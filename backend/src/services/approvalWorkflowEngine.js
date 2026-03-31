import { supabase } from "../config/supabaseClient.js";

/**
 * Approval Workflow Engine - REWRITTEN FOR NEW SCHEMA
 * 
 * New Tables:
 * - approval_rules (replaces approval_workflows)
 * - approval_rule_steps (replaces approval_steps)
 * - approval_rule_parallel_approvers (special approvers like CFO/CEO)
 * - approval_logs (tracks all approval actions)
 * 
 * Implements exact rejection flowchart logic from requirements
 */

/**
 * Get applicable approval rule for an expense
 * Matches based on: company_id, category, threshold_amount
 * UPDATED: Handles manager submissions (managers can submit, admins cannot)
 */
export async function getApplicableRule(employeeId, expenseAmount, expenseCategory) {
  // Get employee's company and role
  const { data: employee, error: empError } = await supabase
    .from("profiles")
    .select("company_id, manager_id, role")
    .eq("id", employeeId)
    .single();

  if (empError) throw empError;

  if (!employee?.company_id) {
    throw new Error("Employee has no company assigned");
  }

  // CRITICAL: Block admins from submitting expenses
  if (employee.role === "admin") {
    throw new Error("Admins cannot submit expenses. Only employees and managers can submit.");
  }

  // Find matching rule (priority: specific category/threshold → default rule)
  const { data: rules, error: rulesError } = await supabase
    .from("approval_rules")
    .select(`
      *,
      sequential_steps:approval_rule_steps(
        id,
        approver_id,
        step_order,
        is_required,
        approver:approver_id(id, email, role, job_title)
      ),
      parallel_approvers:approval_rule_parallel_approvers(
        id,
        approver_id,
        approver:approver_id(id, email, role, job_title)
      )
    `)
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  if (rulesError) throw rulesError;

  if (!rules || rules.length === 0) {
    // No rules configured - use simple manager approval
    return {
      useSimpleApproval: true,
      managerId: employee.manager_id
    };
  }

  // Find most specific matching rule
  let matchedRule = null;

  // 1. Try to match category + threshold
  matchedRule = rules.find(
    r => r.category === expenseCategory && 
         r.threshold_amount && 
         expenseAmount >= r.threshold_amount
  );

  // 2. Try to match category only
  if (!matchedRule) {
    matchedRule = rules.find(r => r.category === expenseCategory && !r.threshold_amount);
  }

  // 3. Try to match threshold only
  if (!matchedRule) {
    matchedRule = rules.find(
      r => !r.category && 
           r.threshold_amount && 
           expenseAmount >= r.threshold_amount
    );
  }

  // 4. Use default rule
  if (!matchedRule) {
    matchedRule = rules.find(r => r.is_default);
  }

  // 5. Fallback to any rule
  if (!matchedRule && rules.length > 0) {
    matchedRule = rules[0];
  }

  return {
    ...matchedRule,
    managerId: employee.manager_id,
    submitterRole: employee.role  // Include submitter role for workflow logic
  };
}

/**
 * Initialize approval workflow for an expense
 * Creates initial approval_logs entries with LOCKED status
 */
export async function initializeExpenseWorkflow(expenseId, employeeId, expenseAmount, expenseCategory) {
  try {
    // Get applicable rule
    const rule = await getApplicableRule(employeeId, expenseAmount, expenseCategory);

    // Simple manager approval (no rules configured)
    if (rule.useSimpleApproval) {
      if (!rule.managerId) {
        throw new Error("Employee has no manager assigned and no approval rules configured");
      }

      const { error: logError } = await supabase
        .from("approval_logs")
        .insert({
          expense_id: expenseId,
          approver_id: rule.managerId,
          step_order: 1,
          type: 'SEQUENTIAL',
          is_required: true,
          action: 'PENDING'
        });

      if (logError) throw logError;

      await supabase
        .from("expenses")
        .update({ current_step: 1 })
        .eq("id", expenseId);

      return { 
        type: 'simple', 
        managerId: rule.managerId,
        message: 'Simple manager approval workflow initialized'
      };
    }

    // Complex workflow with rules
    const logsToInsert = [];

    // CRITICAL: Handle manager submissions
    // If submitter is a manager, their expense goes to THEIR manager (or follows rules)
    // Only add submitter's manager if:
    // 1. Rule says to include manager as approver (is_manager_approver = true)
    // 2. Submitter HAS a manager (manager_id is not null)
    // 3. Submitter is not approving their own expense (avoid self-approval)
    
    if (rule.is_manager_approver && rule.managerId && rule.managerId !== employeeId) {
      logsToInsert.push({
        expense_id: expenseId,
        approver_id: rule.managerId,
        step_order: 1,
        type: 'SEQUENTIAL',
        is_required: true,
        action: 'PENDING'
      });
    }

    // Add sequential approvers
    if (rule.sequential_steps && rule.sequential_steps.length > 0) {
      const startOrder = logsToInsert.length > 0 ? 2 : 1;
      
      rule.sequential_steps
        .sort((a, b) => a.step_order - b.step_order)
        .forEach((step, index) => {
          logsToInsert.push({
            expense_id: expenseId,
            approver_id: step.approver_id,
            step_order: startOrder + index,
            type: 'SEQUENTIAL',
            is_required: step.is_required,
            action: index === 0 && logsToInsert.length === 0 ? 'PENDING' : 'LOCKED'
          });
        });
    }

    // Add parallel approvers (special approvers - always PENDING, can act anytime)
    if (rule.parallel_approvers && rule.parallel_approvers.length > 0) {
      rule.parallel_approvers.forEach(approver => {
        logsToInsert.push({
          expense_id: expenseId,
          approver_id: approver.approver_id,
          step_order: null, // Parallel approvers have no order
          type: 'PARALLEL',
          is_required: false,
          action: 'PENDING'
        });
      });
    }

    if (logsToInsert.length === 0) {
      throw new Error("No approvers configured in approval rule");
    }

    // Insert all approval logs
    const { error: insertError } = await supabase
      .from("approval_logs")
      .insert(logsToInsert);

    if (insertError) throw insertError;

    // Update expense
    await supabase
      .from("expenses")
      .update({ current_step: 1 })
      .eq("id", expenseId);

    return {
      type: 'workflow',
      ruleId: rule.id,
      ruleName: rule.name,
      totalApprovers: logsToInsert.length,
      sequentialCount: logsToInsert.filter(l => l.type === 'SEQUENTIAL').length,
      parallelCount: logsToInsert.filter(l => l.type === 'PARALLEL').length,
      minApprovalPercentage: rule.min_approval_percentage,
      message: 'Workflow initialized successfully'
    };

  } catch (error) {
    console.error("Error initializing workflow:", error);
    throw error;
  }
}

/**
 * REJECTION FLOWCHART LOGIC (EXACT IMPLEMENTATION)
 * 
 * Approver clicks REJECT
 *     ↓
 * Is PARALLEL workflow?
 *   YES → Immediate REJECTED (skip all)
 *   NO ↓
 *   
 * Is REQUIRED approver in SEQUENTIAL?
 *   YES → Immediate REJECTED (skip all)
 *   NO ↓
 *   
 * Is NON-REQUIRED in sequential WITHOUT percentage?
 *   YES → Note rejection, continue to next step
 *   NO ↓
 *   
 * Percentage rule exists?
 *   YES → Check if threshold still reachable
 *         - Can reach? → Continue (rejection counts against %)
 *         - Cannot reach? → Auto REJECTED (skip all)
 */
function evaluateRejection(rule, allLogs, rejectedLog) {
  const isParallel = rejectedLog.type === 'PARALLEL';
  const isRequired = rejectedLog.is_required;
  const hasPercentageRule = rule.min_approval_percentage && rule.min_approval_percentage > 0;

  // STEP 1: Is PARALLEL workflow?
  if (isParallel) {
    return {
      finalStatus: 'REJECTED',
      reason: 'Rejected by special approver (parallel workflow)',
      skipRemaining: true,
      autoSkip: true
    };
  }

  // STEP 2: Is REQUIRED approver in SEQUENTIAL?
  if (isRequired) {
    return {
      finalStatus: 'REJECTED',
      reason: `Rejected by required approver at step ${rejectedLog.step_order}`,
      skipRemaining: true,
      autoSkip: true
    };
  }

  // STEP 3: Is NON-REQUIRED in sequential WITHOUT percentage?
  if (!hasPercentageRule) {
    return {
      finalStatus: 'PENDING',
      reason: `Non-required approver rejected at step ${rejectedLog.step_order}, continuing to next`,
      continueFlow: true,
      moveToNextStep: true
    };
  }

  // STEP 4: Percentage rule exists - check if threshold still reachable
  const sequentialLogs = allLogs.filter(l => l.type === 'SEQUENTIAL');
  const totalApprovers = sequentialLogs.length;
  const approvedCount = sequentialLogs.filter(l => l.action === 'APPROVED').length;
  const rejectedCount = sequentialLogs.filter(l => l.action === 'REJECTED').length;
  const pendingCount = sequentialLogs.filter(l => l.action === 'PENDING' || l.action === 'LOCKED').length;

  const maxPossibleApprovals = approvedCount + pendingCount;
  const maxPossiblePercentage = (maxPossibleApprovals / totalApprovers) * 100;

  if (maxPossiblePercentage < rule.min_approval_percentage) {
    return {
      finalStatus: 'REJECTED',
      reason: `Threshold can no longer be met. Max possible: ${maxPossiblePercentage.toFixed(1)}% < ${rule.min_approval_percentage}%`,
      skipRemaining: true,
      autoSkip: true
    };
  }

  // Threshold still reachable
  return {
    finalStatus: 'PENDING',
    reason: `Rejection noted. Threshold still reachable (max possible: ${maxPossiblePercentage.toFixed(1)}%)`,
    continueFlow: true,
    moveToNextStep: true
  };
}

/**
 * Evaluate if expense should be auto-approved based on percentage threshold
 */
function checkPercentageApproval(rule, allLogs) {
  if (!rule.min_approval_percentage || rule.min_approval_percentage <= 0) {
    return null; // No percentage rule
  }

  const sequentialLogs = allLogs.filter(l => l.type === 'SEQUENTIAL');
  const totalApprovers = sequentialLogs.length;
  const approvedCount = sequentialLogs.filter(l => l.action === 'APPROVED').length;

  const currentPercentage = (approvedCount / totalApprovers) * 100;

  if (currentPercentage >= rule.min_approval_percentage) {
    return {
      finalStatus: 'APPROVED',
      reason: `Approval threshold reached: ${currentPercentage.toFixed(1)}% >= ${rule.min_approval_percentage}%`,
      skipRemaining: true,
      autoApproved: true
    };
  }

  return null; // Not yet reached
}

/**
 * Process an approval/rejection action
 */
export async function processApprovalAction(expenseId, approverId, action, comment = null) {
  try {
    // Validate action
    if (!['APPROVED', 'REJECTED'].includes(action)) {
      throw new Error("Action must be 'APPROVED' or 'REJECTED'");
    }

    // Get expense with company info
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select(`
        id,
        employee_id,
        amount,
        category,
        status,
        current_step,
        employee:employee_id(company_id)
      `)
      .eq("id", expenseId)
      .single();

    if (expError || !expense) {
      throw new Error("Expense not found");
    }

    if (expense.status !== 'pending') {
      throw new Error(`Expense is already ${expense.status}`);
    }

    // Get all approval logs for this expense
    const { data: allLogs, error: logsError } = await supabase
      .from("approval_logs")
      .select("*")
      .eq("expense_id", expenseId)
      .order("step_order", { ascending: true, nullsFirst: false });

    if (logsError) throw logsError;

    // Find approver's log
    const approverLog = allLogs.find(l => l.approver_id === approverId);

    if (!approverLog) {
      throw new Error("You are not an approver for this expense");
    }

    if (approverLog.action === 'APPROVED' || approverLog.action === 'REJECTED') {
      throw new Error("You have already processed this expense");
    }

    if (approverLog.action === 'LOCKED') {
      throw new Error("Not your turn yet - waiting for previous approver");
    }

    if (approverLog.action === 'SKIPPED') {
      throw new Error("This approval was skipped");
    }

    // Get the approval rule
    const companyId = expense.employee.company_id;
    const { data: rule, error: ruleError } = await supabase
      .from("approval_rules")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (ruleError) throw ruleError;

    // Update approval log
    const { error: updateError } = await supabase
      .from("approval_logs")
      .update({ 
        action,
        comment,
        updated_at: new Date().toISOString()
      })
      .eq("id", approverLog.id);

    if (updateError) throw updateError;

    // Refresh logs after update
    const { data: updatedLogs } = await supabase
      .from("approval_logs")
      .select("*")
      .eq("expense_id", expenseId)
      .order("step_order", { ascending: true, nullsFirst: false });

    let evaluation = { finalStatus: 'PENDING', continueFlow: true };

    // HANDLE REJECTION
    if (action === 'REJECTED') {
      evaluation = evaluateRejection(rule || {}, updatedLogs, { ...approverLog, action: 'REJECTED' });
    }

    // HANDLE APPROVAL
    if (action === 'APPROVED') {
      // Check for parallel (special) approver override
      if (approverLog.type === 'PARALLEL') {
        evaluation = {
          finalStatus: 'APPROVED',
          reason: 'Approved by special approver (parallel override)',
          skipRemaining: true,
          autoApproved: true
        };
      } else {
        // Check percentage threshold
        const percentageCheck = rule ? checkPercentageApproval(rule, updatedLogs) : null;
        
        if (percentageCheck) {
          evaluation = percentageCheck;
        } else {
          // Check if all SEQUENTIAL required approvers have approved
          const sequentialLogs = updatedLogs.filter(l => l.type === 'SEQUENTIAL' && l.is_required);
          const allSequentialApproved = sequentialLogs.every(l => l.action === 'APPROVED');

          if (allSequentialApproved) {
            evaluation = {
              finalStatus: 'APPROVED',
              reason: 'All required approvals complete',
              skipRemaining: true
            };
          } else {
            // Move to next step
            evaluation = {
              finalStatus: 'PENDING',
              reason: 'Approved, waiting for next approver',
              moveToNextStep: true
            };
          }
        }
      }
    }

    // Apply evaluation result
    if (evaluation.finalStatus === 'APPROVED' || evaluation.finalStatus === 'REJECTED') {
      // Update expense status
      await supabase
        .from("expenses")
        .update({ status: evaluation.finalStatus.toLowerCase() })
        .eq("id", expenseId);

      // Skip remaining approvers if needed
      if (evaluation.skipRemaining) {
        await supabase
          .from("approval_logs")
          .update({ 
            action: 'SKIPPED',
            comment: `Auto-skipped: ${evaluation.reason}`,
            updated_at: new Date().toISOString()
          })
          .eq("expense_id", expenseId)
          .in("action", ['PENDING', 'LOCKED']);
      }
    } else if (evaluation.moveToNextStep) {
      // Unlock next sequential approver
      const nextLog = updatedLogs.find(
        l => l.type === 'SEQUENTIAL' && 
             l.action === 'LOCKED' && 
             l.step_order > (approverLog.step_order || 0)
      );

      if (nextLog) {
        await supabase
          .from("approval_logs")
          .update({ 
            action: 'PENDING',
            updated_at: new Date().toISOString()
          })
          .eq("id", nextLog.id);

        await supabase
          .from("expenses")
          .update({ current_step: nextLog.step_order })
          .eq("id", expenseId);
      }
    }

    return {
      success: true,
      action,
      evaluation
    };

  } catch (error) {
    console.error("Error processing approval:", error);
    throw error;
  }
}

/**
 * Get approval status for an expense
 */
export async function getApprovalStatus(expenseId) {
  const { data: logs, error } = await supabase
    .from("approval_logs")
    .select(`
      *,
      approver:approver_id(id, email, role, job_title)
    `)
    .eq("expense_id", expenseId)
    .order("step_order", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const sequentialLogs = logs.filter(l => l.type === 'SEQUENTIAL');
  const parallelLogs = logs.filter(l => l.type === 'PARALLEL');

  return {
    sequential: sequentialLogs.map(l => ({
      stepOrder: l.step_order,
      approver: l.approver,
      isRequired: l.is_required,
      action: l.action,
      comment: l.comment,
      timestamp: l.updated_at || l.created_at
    })),
    parallel: parallelLogs.map(l => ({
      approver: l.approver,
      action: l.action,
      comment: l.comment,
      timestamp: l.updated_at || l.created_at
    })),
    summary: {
      total: logs.length,
      approved: logs.filter(l => l.action === 'APPROVED').length,
      rejected: logs.filter(l => l.action === 'REJECTED').length,
      pending: logs.filter(l => l.action === 'PENDING').length,
      locked: logs.filter(l => l.action === 'LOCKED').length,
      skipped: logs.filter(l => l.action === 'SKIPPED').length
    }
  };
}

export default {
  getApplicableRule,
  initializeExpenseWorkflow,
  processApprovalAction,
  getApprovalStatus
};
