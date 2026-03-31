import { supabase } from "../config/supabaseClient.js";

/**
 * Get approval workflow preview for an employee BEFORE submitting
 * Shows who will approve based on amount and category
 * 
 * SIMPLIFIED VERSION - Works with basic schema
 */
export async function getApprovalPreview(req, res) {
  try {
    const userId = req.user.id;
    const { amount, category } = req.query;

    if (!amount || !category) {
      return res.status(400).json({ 
        error: "amount and category are required" 
      });
    }

    // Get user's company and manager
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id, manager_id, role, full_name, email")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // CRITICAL: Block admins from submitting expenses
    if (profile.role === 'admin') {
      return res.json({
        can_submit: false,
        reason: "Admins cannot submit expenses. Only employees and managers can submit.",
        approval_steps: [],
        total_steps: 0,
        estimated_days: 0
      });
    }

    const companyId = profile.company_id;
    const convertedAmount = parseFloat(amount);

    // Simple workflow: Just show manager approval
    // This works regardless of approval_rules table structure
    
    if (!profile.manager_id) {
      // No manager assigned
      return res.json({
        can_submit: true,
        message: "No manager assigned. Expense will require admin approval.",
        approval_steps: [],
        total_steps: 0,
        estimated_days: 0
      });
    }

    // Get manager info
    const { data: manager, error: managerError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, on_leave, leave_start_date, leave_end_date")
      .eq("id", profile.manager_id)
      .single();

    if (managerError || !manager) {
      return res.json({
        can_submit: true,
        message: "Manager information not available.",
        approval_steps: [],
        total_steps: 0,
        estimated_days: 0
      });
    }

    // Build approval preview
    const approvalSteps = [{
      step_order: 1,
      approver_id: manager.id,
      approver_name: manager.full_name || manager.email,
      approver_email: manager.email,
      approver_role: manager.role || 'manager',
      approver_on_leave: manager.on_leave || false,
      approver_leave_start_date: manager.leave_start_date,
      approver_leave_end_date: manager.leave_end_date,
      will_escalate: manager.on_leave || false,
      escalation_reason: manager.on_leave ? "manager_on_leave" : null,
      estimated_days: manager.on_leave ? 1 : 3
    }];

    return res.json({
      can_submit: true,
      approval_steps: approvalSteps,
      total_steps: 1,
      estimated_days: manager.on_leave ? 1 : 3,
      message: manager.on_leave 
        ? "Your manager is on leave. This expense will be escalated to admin immediately."
        : "This expense will be sent to your manager for approval."
    });

  } catch (error) {
    console.error("Error getting approval preview:", error);
    res.status(500).json({ 
      error: "Failed to get approval preview",
      details: error.message 
    });
  }
}

/**
 * Check if current user can submit expenses
 * Blocks admins from submitting
 */
export async function checkSubmissionEligibility(req, res) {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, manager_id, company_id")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Check if admin
    if (profile.role === 'admin') {
      return res.json({
        can_submit: false,
        reason: "Admins cannot submit expenses. Only employees and managers can submit.",
        allowed_roles: ["employee", "manager"]
      });
    }

    // Check if has manager (optional check)
    const hasManager = !!profile.manager_id;

    return res.json({
      can_submit: true,
      role: profile.role,
      has_manager: hasManager,
      message: hasManager 
        ? "You can submit expenses for approval." 
        : "You can submit expenses, but no manager is assigned. Admin will review."
    });

  } catch (error) {
    console.error("Error checking submission eligibility:", error);
    res.status(500).json({ 
      error: "Failed to check eligibility",
      details: error.message 
    });
  }
}
