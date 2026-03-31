import { supabase } from "../config/supabaseClient.js";
import { 
  getApplicableRule,
  getApprovalStatus,
  processApprovalAction
} from "../services/approvalWorkflowEngine.js";

/**
 * Workflow Controller - REWRITTEN FOR NEW SCHEMA
 * Manages approval_rules, approval_rule_steps, approval_rule_parallel_approvers
 */

/**
 * Get all approval rules for a company (Admin only)
 */
export const getAllRules = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return res.status(400).json({ error: "User has no company assigned" });
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view approval rules" });
    }

    const { data: rules, error } = await supabase
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
        ),
        specific_approver:specific_approver_id(id, email, role, job_title)
      `)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ rules });
  } catch (err) {
    console.error("Error fetching rules:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get a specific approval rule
 */
export const getRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return res.status(400).json({ error: "User has no company assigned" });
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view approval rules" });
    }

    const { data: rule, error } = await supabase
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
      .eq("id", ruleId)
      .eq("company_id", profile.company_id)
      .single();

    if (error) throw error;

    res.json({ rule });
  } catch (err) {
    console.error("Error fetching rule:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create approval rule (Admin only)
 */
export const createRule = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      category,
      threshold_amount,
      is_manager_approver,
      min_approval_percentage,
      specific_approver_id,
      sequential_approvers,  // Array of { approver_id, step_order, is_required }
      parallel_approvers,    // Array of { approver_id }
      is_default
    } = req.body;

    // Validate
    if (!name) {
      return res.status(400).json({ error: "Rule name is required" });
    }

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return res.status(400).json({ error: "User has no company assigned" });
    }

    if (profile.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can create approval rules" });
    }

    // If this is set as default, unset other defaults
    if (is_default) {
      await supabase
        .from("approval_rules")
        .update({ is_default: false })
        .eq("company_id", profile.company_id);
    }

    // Create approval rule
    const { data: rule, error: ruleError } = await supabase
      .from("approval_rules")
      .insert({
        company_id: profile.company_id,
        name,
        category: category || null,
        threshold_amount: threshold_amount || null,
        is_manager_approver: is_manager_approver || false,
        min_approval_percentage: min_approval_percentage || null,
        specific_approver_id: specific_approver_id || null,
        is_default: is_default || false
      })
      .select()
      .single();

    if (ruleError) throw ruleError;

    // Add sequential approvers
    if (sequential_approvers && Array.isArray(sequential_approvers) && sequential_approvers.length > 0) {
      const steps = sequential_approvers.map(a => ({
        rule_id: rule.id,
        approver_id: a.approver_id,
        step_order: a.step_order || 1,
        is_required: a.is_required !== undefined ? a.is_required : true
      }));

      const { error: stepsError } = await supabase
        .from("approval_rule_steps")
        .insert(steps);

      if (stepsError) throw stepsError;
    }

    // Add parallel approvers (special approvers like CFO/CEO)
    if (parallel_approvers && Array.isArray(parallel_approvers) && parallel_approvers.length > 0) {
      const parallelSteps = parallel_approvers.map(a => ({
        rule_id: rule.id,
        approver_id: a.approver_id
      }));

      const { error: parallelError } = await supabase
        .from("approval_rule_parallel_approvers")
        .insert(parallelSteps);

      if (parallelError) throw parallelError;
    }

    // Fetch complete rule
    const { data: completeRule } = await supabase
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
      .eq("id", rule.id)
      .single();

    res.status(201).json({ 
      rule: completeRule,
      message: "Approval rule created successfully" 
    });
  } catch (err) {
    console.error("Error creating rule:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update approval rule (Admin only)
 */
export const updateRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const userId = req.user.id;
    const {
      name,
      category,
      threshold_amount,
      is_manager_approver,
      min_approval_percentage,
      specific_approver_id,
      sequential_approvers,
      parallel_approvers,
      is_default
    } = req.body;

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can update approval rules" });
    }

    // If setting as default, unset others
    if (is_default) {
      await supabase
        .from("approval_rules")
        .update({ is_default: false })
        .eq("company_id", profile.company_id)
        .neq("id", ruleId);
    }

    // Update rule
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (threshold_amount !== undefined) updateData.threshold_amount = threshold_amount;
    if (is_manager_approver !== undefined) updateData.is_manager_approver = is_manager_approver;
    if (min_approval_percentage !== undefined) updateData.min_approval_percentage = min_approval_percentage;
    if (specific_approver_id !== undefined) updateData.specific_approver_id = specific_approver_id;
    if (is_default !== undefined) updateData.is_default = is_default;
    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("approval_rules")
      .update(updateData)
      .eq("id", ruleId);

    if (updateError) throw updateError;

    // Update sequential approvers if provided
    if (sequential_approvers !== undefined) {
      // Delete existing steps
      await supabase
        .from("approval_rule_steps")
        .delete()
        .eq("rule_id", ruleId);

      // Insert new steps
      if (Array.isArray(sequential_approvers) && sequential_approvers.length > 0) {
        const steps = sequential_approvers.map(a => ({
          rule_id: ruleId,
          approver_id: a.approver_id,
          step_order: a.step_order || 1,
          is_required: a.is_required !== undefined ? a.is_required : true
        }));

        await supabase
          .from("approval_rule_steps")
          .insert(steps);
      }
    }

    // Update parallel approvers if provided
    if (parallel_approvers !== undefined) {
      // Delete existing parallel approvers
      await supabase
        .from("approval_rule_parallel_approvers")
        .delete()
        .eq("rule_id", ruleId);

      // Insert new parallel approvers
      if (Array.isArray(parallel_approvers) && parallel_approvers.length > 0) {
        const parallelSteps = parallel_approvers.map(a => ({
          rule_id: ruleId,
          approver_id: a.approver_id
        }));

        await supabase
          .from("approval_rule_parallel_approvers")
          .insert(parallelSteps);
      }
    }

    // Fetch updated rule
    const { data: updatedRule } = await supabase
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
      .eq("id", ruleId)
      .single();

    res.json({ 
      rule: updatedRule,
      message: "Approval rule updated successfully" 
    });
  } catch (err) {
    console.error("Error updating rule:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete approval rule (Admin only)
 * CRITICAL: Only admins can delete rules from their own company
 */
export const deleteRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const userId = req.user.id;

    // Verify user is admin AND get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (profile.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can delete approval rules" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // CRITICAL: Verify rule belongs to admin's company before deleting
    const { data: ruleToDelete } = await supabase
      .from("approval_rules")
      .select("company_id")
      .eq("id", ruleId)
      .single();

    if (!ruleToDelete) {
      return res.status(404).json({ error: "Approval rule not found" });
    }

    if (ruleToDelete.company_id !== profile.company_id) {
      return res.status(403).json({ error: "Cannot delete rule from different company" });
    }

    // Check if rule is in use
    const { count } = await supabase
      .from("approval_logs")
      .select("*", { count: 'exact', head: true })
      .eq("rule_id", ruleId);

    if (count > 0) {
      return res.status(400).json({ 
        error: "Cannot delete rule that has been used in approvals. Consider deactivating it instead." 
      });
    }

    // Delete rule (CASCADE will delete steps and parallel approvers)
    const { error } = await supabase
      .from("approval_rules")
      .delete()
      .eq("id", ruleId)
      .eq("company_id", profile.company_id); // Extra safety check

    if (error) throw error;

    res.json({ message: "Approval rule deleted successfully" });
  } catch (err) {
    console.error("Error deleting rule:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get approval status for an expense
 * CRITICAL: Only returns status if expense belongs to user's company
 */
export const getExpenseApprovalStatus = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user.id;

    // Get current user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get expense details SCOPED TO COMPANY
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select(`
        id,
        description,
        amount,
        category,
        status,
        current_step,
        company_id,
        employee:employee_id(id, email, company_id)
      `)
      .eq("id", expenseId)
      .eq("company_id", profile.company_id) // MULTI-TENANCY FILTER
      .single();

    if (expError) {
      if (expError.code === 'PGRST116') {
        return res.status(404).json({ error: "Expense not found or not in your company" });
      }
      throw expError;
    }

    if (!expense) {
      return res.status(404).json({ error: "Expense not found or not in your company" });
    }

    // Get approval status
    const status = await getApprovalStatus(expenseId);

    res.json({
      expense,
      approvalStatus: status
    });
  } catch (err) {
    console.error("Error fetching approval status:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Process approval (approve/reject)
 */
export const processApproval = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { action, comment } = req.body;
    const approverId = req.user.id;

    if (!action || !['APPROVED', 'REJECTED'].includes(action.toUpperCase())) {
      return res.status(400).json({ error: "action must be 'APPROVED' or 'REJECTED'" });
    }

    const result = await processApprovalAction(
      expenseId,
      approverId,
      action.toUpperCase(),
      comment
    );

    res.json({
      message: `Expense ${action.toLowerCase()} successfully`,
      ...result
    });
  } catch (err) {
    console.error("Error processing approval:", err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get pending approvals for current user
 * CRITICAL: Only shows expenses from same company
 */
export const getMyPendingApprovals = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get all expenses where user is a pending approver
    const { data: pendingLogs, error: logsError } = await supabase
      .from("approval_logs")
      .select(`
        expense_id,
        step_order,
        type,
        is_required,
        expense:expense_id(
          id,
          description,
          amount,
          currency,
          category,
          expense_date,
          status,
          current_step,
          company_id,
          employee:employee_id(id, email)
        )
      `)
      .eq("approver_id", userId)
      .eq("action", "PENDING")
      .order("created_at", { ascending: false });

    if (logsError) throw logsError;

    // Filter expenses to only include from same company (MULTI-TENANCY FILTER)
    const expenses = pendingLogs
      .map(log => log.expense)
      .filter(exp => exp && exp.status === 'pending' && exp.company_id === profile.company_id);

    res.json({ 
      count: expenses.length,
      expenses 
    });
  } catch (err) {
    console.error("Error fetching pending approvals:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get approval history for current user
 * CRITICAL: Only shows approvals for expenses from same company
 */
export const getMyApprovalHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    const { data: logs, error: logsError } = await supabase
      .from("approval_logs")
      .select(`
        id,
        action,
        comment,
        step_order,
        type,
        created_at,
        updated_at,
        expense:expense_id(
          id,
          description,
          amount,
          currency,
          category,
          expense_date,
          status,
          company_id,
          employee:employee_id(id, email)
        )
      `)
      .eq("approver_id", userId)
      .in("action", ["APPROVED", "REJECTED"])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (logsError) throw logsError;

    // Filter logs to only include expenses from same company (MULTI-TENANCY FILTER)
    const companyFilteredLogs = logs.filter(log => 
      log.expense?.company_id === profile.company_id
    );

    res.json({ 
      count: companyFilteredLogs.length,
      history: companyFilteredLogs 
    });
  } catch (err) {
    console.error("Error fetching approval history:", err);
    res.status(500).json({ error: err.message });
  }
};

export default {
  getAllRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  getExpenseApprovalStatus,
  processApproval,
  getMyPendingApprovals,
  getMyApprovalHistory
};
