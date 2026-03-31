import { supabase } from "../config/supabaseClient.js";

/**
 * Approval Workflow Engine
 * Handles sequential, parallel, and percentage-based approval logic
 */

/**
 * Get active workflow for an employee
 */
export async function getActiveWorkflow(employeeId) {
  const { data: workflow, error } = await supabase
    .from("approval_workflows")
    .select(`
      *,
      steps:approval_steps(
        id,
        approver_id,
        step_order,
        is_required,
        approver:approver_id(id, email, role)
      )
    `)
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .single();

  if (error && error.code !== 'PGRST116') { // Not a "not found" error
    throw error;
  }

  return workflow;
}

/**
 * Initialize approval workflow for an expense
 */
export async function initializeExpenseWorkflow(expenseId, employeeId) {
  const workflow = await getActiveWorkflow(employeeId);
  
  if (!workflow) {
    // No workflow configured, use default (direct manager approval)
    return null;
  }

  // Link workflow to expense
  await supabase
    .from("expenses")
    .update({ workflow_id: workflow.id })
    .eq("id", expenseId);

  return workflow;
}

/**
 * Check if expense should be auto-approved/rejected
 */
export async function evaluateExpenseStatus(expenseId) {
  // Get expense with workflow
  const { data: expense, error: expError } = await supabase
    .from("expenses")
    .select(`
      id,
      workflow_id,
      user_id,
      workflow:workflow_id(
        id,
        approval_type,
        approval_threshold,
        has_special_approver,
        special_approver_id,
        steps:approval_steps(
          id,
          approver_id,
          step_order,
          is_required
        )
      )
    `)
    .eq("id", expenseId)
    .single();

  if (expError) throw expError;

  if (!expense.workflow) {
    // No workflow, manual approval needed
    return { status: 'pending', reason: 'No workflow configured' };
  }

  // Get approval logs
  const { data: logs, error: logsError } = await supabase
    .from("expense_approval_logs")
    .select("*")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  if (logsError) throw logsError;

  const workflow = expense.workflow;
  const steps = workflow.steps || [];

  // Check for special approver override
  if (workflow.has_special_approver) {
    const specialApproval = logs.find(
      log => log.approver_id === workflow.special_approver_id && log.is_special_override
    );
    if (specialApproval) {
      if (specialApproval.action === 'approved') {
        return { status: 'approved', reason: 'Special approver override', skipRemaining: true };
      } else if (specialApproval.action === 'rejected') {
        return { status: 'rejected', reason: 'Rejected by special approver', skipRemaining: true };
      }
    }
  }

  // Sequential approval
  if (workflow.approval_type === 'sequential') {
    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
    
    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      const log = logs.find(l => l.approver_id === step.approver_id);
      
      if (!log) {
        // Waiting for this approver
        return { 
          status: 'pending', 
          reason: `Waiting for approver at step ${step.step_order}`,
          nextApprover: step.approver_id 
        };
      }
      
      if (log.action === 'rejected') {
        return { 
          status: 'rejected', 
          reason: `Rejected at step ${step.step_order}`,
          skipRemaining: true 
        };
      }
      
      // Continue to next step
    }
    
    // All steps approved
    return { status: 'approved', reason: 'All sequential approvals complete' };
  }

  // Parallel approval (all must approve)
  if (workflow.approval_type === 'parallel') {
    const requiredApprovers = steps.filter(s => s.is_required);
    const allApprovers = steps;
    
    for (const step of requiredApprovers) {
      const log = logs.find(l => l.approver_id === step.approver_id);
      
      if (!log) {
        return { 
          status: 'pending', 
          reason: 'Waiting for required approvers',
          pendingApprovers: requiredApprovers.filter(s => !logs.find(l => l.approver_id === s.approver_id))
        };
      }
      
      if (log.action === 'rejected') {
        return { 
          status: 'rejected', 
          reason: 'Rejected by required approver',
          skipRemaining: true 
        };
      }
    }
    
    // All required approvers approved
    return { status: 'approved', reason: 'All required approvers approved' };
  }

  // Percentage-based approval
  if (workflow.approval_type === 'percentage') {
    const totalApprovers = steps.length;
    const threshold = workflow.approval_threshold || 50; // Default 50%
    
    const approvals = logs.filter(l => l.action === 'approved').length;
    const rejections = logs.filter(l => l.action === 'rejected').length;
    const pending = totalApprovers - approvals - rejections;
    
    const currentApprovalPercentage = (approvals / totalApprovers) * 100;
    const maxPossiblePercentage = ((approvals + pending) / totalApprovers) * 100;
    
    // IMPORTANT: Any rejection = instant reject (as per requirement)
    if (rejections > 0) {
      return {
        status: 'rejected',
        reason: `Rejected by approver`,
        skipRemaining: true
      };
    }
    
    // Check if already reached threshold
    if (currentApprovalPercentage >= threshold) {
      return { 
        status: 'approved', 
        reason: `Threshold reached: ${currentApprovalPercentage.toFixed(1)}% >= ${threshold}%`,
        skipRemaining: true 
      };
    }
    
    // Check if mathematically impossible to reach threshold (shouldn't happen now with instant reject)
    if (maxPossiblePercentage < threshold) {
      return { 
        status: 'rejected', 
        reason: `Cannot reach threshold. Max possible: ${maxPossiblePercentage.toFixed(1)}% < ${threshold}%`,
        autoRejected: true 
      };
    }
    
    // Still pending
    return { 
      status: 'pending', 
      reason: `Current: ${currentApprovalPercentage.toFixed(1)}%, Need: ${threshold}%`,
      stats: { approvals, rejections, pending, totalApprovers }
    };
  }

  return { status: 'pending', reason: 'Unknown workflow type' };
}

/**
 * Process an approval action
 */
export async function processApprovalAction(expenseId, approverId, action, comments, isSpecialOverride = false) {
  // Get expense and workflow
  const { data: expense } = await supabase
    .from("expenses")
    .select(`
      id,
      workflow_id,
      workflow:workflow_id(
        id,
        approval_type,
        steps:approval_steps(approver_id, step_order)
      )
    `)
    .eq("id", expenseId)
    .single();

  if (!expense) {
    throw new Error("Expense not found");
  }

  // Verify approver is in the workflow
  const workflow = expense.workflow;
  const approverStep = workflow?.steps?.find(s => s.approver_id === approverId);
  
  if (!approverStep && !isSpecialOverride) {
    throw new Error("You are not an approver for this expense");
  }

  // Check if already actioned
  const { data: existingLog } = await supabase
    .from("expense_approval_logs")
    .select("id")
    .eq("expense_id", expenseId)
    .eq("approver_id", approverId)
    .single();

  if (existingLog) {
    throw new Error("You have already processed this expense");
  }

  // Create approval log
  const { data: log, error: logError } = await supabase
    .from("expense_approval_logs")
    .insert({
      expense_id: expenseId,
      workflow_id: expense.workflow_id,
      approver_id: approverId,
      action,
      comments,
      step_order: approverStep?.step_order || null,
      is_special_override: isSpecialOverride
    })
    .select()
    .single();

  if (logError) throw logError;

  // Evaluate new status
  const evaluation = await evaluateExpenseStatus(expenseId);
  
  // Update expense status if final decision reached
  if (evaluation.status === 'approved' || evaluation.status === 'rejected') {
    await supabase
      .from("expenses")
      .update({ status: evaluation.status })
      .eq("id", expenseId);

    // Mark remaining approvers as skipped if needed
    if (evaluation.skipRemaining) {
      const { data: logs } = await supabase
        .from("expense_approval_logs")
        .select("approver_id")
        .eq("expense_id", expenseId);

      const actionedApprovers = new Set(logs?.map(l => l.approver_id) || []);
      const remainingApprovers = workflow.steps
        .filter(s => !actionedApprovers.has(s.approver_id))
        .map(s => ({
          expense_id: expenseId,
          workflow_id: expense.workflow_id,
          approver_id: s.approver_id,
          action: 'skipped',
          comments: 'Skipped due to ' + evaluation.reason,
          step_order: s.step_order,
          is_special_override: false
        }));

      if (remainingApprovers.length > 0) {
        await supabase
          .from("expense_approval_logs")
          .insert(remainingApprovers);
      }
    }
  }

  return {
    log,
    evaluation,
    finalStatus: evaluation.status
  };
}

export default {
  getActiveWorkflow,
  initializeExpenseWorkflow,
  evaluateExpenseStatus,
  processApprovalAction
};
