import { supabase } from "../config/supabaseClient.js";
import { 
  getActiveWorkflow, 
  processApprovalAction,
  evaluateExpenseStatus 
} from "../services/approvalWorkflowEngine.js";

/**
 * Get all workflows (Admin only)
 */
export const getAllWorkflows = async (req, res) => {
  try {
    const { data: workflows, error } = await supabase
      .from("approval_workflows")
      .select(`
        *,
        employee:employee_id(id, email, role),
        special_approver:special_approver_id(id, email, role),
        steps:approval_steps(
          id,
          approver_id,
          step_order,
          is_required,
          approver:approver_id(id, email, role)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ workflows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get workflow for specific employee
 */
export const getWorkflowForEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const workflow = await getActiveWorkflow(employeeId);

    if (!workflow) {
      return res.json({ workflow: null, message: "No workflow configured" });
    }

    res.json({ workflow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create or update approval workflow (Admin only)
 */
export const createWorkflow = async (req, res) => {
  try {
    const {
      employee_id,
      workflow_name,
      approval_type,
      approval_threshold,
      has_special_approver,
      special_approver_id,
      approvers // Array of { approver_id, step_order, is_required }
    } = req.body;

    // Validate
    if (!employee_id || !workflow_name || !approval_type) {
      return res.status(400).json({ 
        error: "employee_id, workflow_name, and approval_type are required" 
      });
    }

    if (!['sequential', 'parallel', 'percentage'].includes(approval_type)) {
      return res.status(400).json({ 
        error: "approval_type must be sequential, parallel, or percentage" 
      });
    }

    if (approval_type === 'percentage' && (!approval_threshold || approval_threshold < 1 || approval_threshold > 100)) {
      return res.status(400).json({ 
        error: "approval_threshold must be between 1 and 100 for percentage-based workflows" 
      });
    }

    if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
      return res.status(400).json({ 
        error: "At least one approver is required" 
      });
    }

    // Deactivate existing workflows for this employee
    await supabase
      .from("approval_workflows")
      .update({ is_active: false })
      .eq("employee_id", employee_id);

    // Create new workflow
    const { data: workflow, error: workflowError } = await supabase
      .from("approval_workflows")
      .insert({
        employee_id,
        workflow_name,
        approval_type,
        approval_threshold,
        has_special_approver: has_special_approver || false,
        special_approver_id: special_approver_id || null,
        is_active: true
      })
      .select()
      .single();

    if (workflowError) throw workflowError;

    // Create approval steps
    const steps = approvers.map(a => ({
      workflow_id: workflow.id,
      approver_id: a.approver_id,
      step_order: a.step_order || 1,
      is_required: a.is_required !== undefined ? a.is_required : true
    }));

    const { error: stepsError } = await supabase
      .from("approval_steps")
      .insert(steps);

    if (stepsError) throw stepsError;

    // Fetch complete workflow
    const completeWorkflow = await getActiveWorkflow(employee_id);

    res.status(201).json({ 
      workflow: completeWorkflow,
      message: "Workflow created successfully" 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete workflow (Admin only)
 */
export const deleteWorkflow = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("approval_workflows")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ message: "Workflow deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get approval status for an expense
 */
export const getExpenseApprovalStatus = async (req, res) => {
  try {
    const { expenseId } = req.params;

    // Get expense with logs
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select(`
        id,
        status,
        workflow_id,
        workflow:workflow_id(
          id,
          workflow_name,
          approval_type,
          approval_threshold,
          has_special_approver,
          special_approver:special_approver_id(id, email, role),
          steps:approval_steps(
            id,
            step_order,
            is_required,
            approver:approver_id(id, email, role)
          )
        )
      `)
      .eq("id", expenseId)
      .single();

    if (expError) throw expError;

    // Get approval logs
    const { data: logs, error: logsError } = await supabase
      .from("expense_approval_logs")
      .select(`
        id,
        action,
        comments,
        step_order,
        is_special_override,
        created_at,
        approver:approver_id(id, email, role)
      `)
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: true });

    if (logsError) throw logsError;

    // Evaluate current status
    const evaluation = await evaluateExpenseStatus(expenseId);

    res.json({
      expense,
      logs,
      evaluation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Process approval (approve/reject)
 */
export const processApproval = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { action, comments } = req.body;
    const approverId = req.user.id;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: "action must be 'approved' or 'rejected'" });
    }

    // Check if user is special approver
    const { data: expense } = await supabase
      .from("expenses")
      .select(`
        workflow:workflow_id(
          special_approver_id,
          has_special_approver
        )
      `)
      .eq("id", expenseId)
      .single();

    const isSpecialOverride = 
      expense?.workflow?.has_special_approver && 
      expense?.workflow?.special_approver_id === approverId;

    const result = await processApprovalAction(
      expenseId,
      approverId,
      action,
      comments,
      isSpecialOverride
    );

    res.json({
      message: `Expense ${action} successfully`,
      ...result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export default {
  getAllWorkflows,
  getWorkflowForEmployee,
  createWorkflow,
  deleteWorkflow,
  getExpenseApprovalStatus,
  processApproval
};
