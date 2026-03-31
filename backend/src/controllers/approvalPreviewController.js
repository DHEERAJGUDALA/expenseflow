import { supabase } from "../config/supabaseClient.js";
import { getApplicableRule } from "../services/approvalWorkflowEngine.js";

/**
 * Get approval workflow preview for an employee BEFORE submitting.
 * Uses the same rule matcher as real workflow initialization.
 */
export async function getApprovalPreview(req, res) {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { amount, category } = req.query;

    // Validate required parameters
    if (!amount || !category) {
      return res.status(400).json({ error: "amount and category are required" });
    }

    // Parse and validate amount
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    // Normalize category (handle case mismatch)
    const normalizedCategory = category.toLowerCase();

    // Get user profile with company_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, company_id, manager_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Check company_id is present
    if (!profile.company_id) {
      return res.status(400).json({ error: "User has no company assigned" });
    }

    // Admins cannot submit
    if (profile.role === "admin") {
      return res.json({
        can_submit: false,
        reason: "Admins cannot submit expenses. Only employees and managers can submit.",
        approval_steps: [],
        total_steps: 0,
        estimated_days: 0
      });
    }

    // Get applicable rule - wrap in try/catch for safety
    let rule;
    try {
      rule = await getApplicableRule(userId, parsedAmount, normalizedCategory);
    } catch (ruleError) {
      console.error("Error getting applicable rule:", ruleError);
      // Return graceful fallback - no rule found
      return res.json({
        can_submit: true,
        rule: null,
        message: ruleError.message || "No approval rule configured for this expense",
        approval_steps: profile.manager_id ? [{
          step_order: 1,
          approver_id: profile.manager_id,
          approver_name: "Your Manager",
          approver_role: "manager",
          type: "SEQUENTIAL",
          estimated_days: 3
        }] : [],
        total_steps: profile.manager_id ? 1 : 0,
        estimated_days: profile.manager_id ? 3 : 0
      });
    }

    // Handle null/undefined rule
    if (!rule) {
      return res.json({
        can_submit: true,
        rule: null,
        message: "No approval rule configured for this company",
        approval_steps: [],
        total_steps: 0,
        estimated_days: 0
      });
    }

    // Simple manager fallback
    if (rule.useSimpleApproval) {
      if (!rule.managerId) {
        return res.json({
          can_submit: true,
          approval_steps: [],
          total_steps: 0,
          estimated_days: 0,
          message: "No manager assigned and no rules configured"
        });
      }

      const { data: manager } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, on_leave, leave_end_date")
        .eq("id", rule.managerId)
        .single();

      return res.json({
        can_submit: true,
        approval_steps: manager
          ? [
              {
                step_order: 1,
                approver_id: manager.id,
                approver_name: manager.full_name || manager.email,
                approver_email: manager.email,
                approver_role: manager.role,
                approver_on_leave: manager.on_leave || false,
                will_escalate: manager.on_leave || false,
                escalation_reason: manager.on_leave ? "manager_on_leave" : null,
                approver_leave_end_date: manager.leave_end_date,
                estimated_days: 3
              }
            ]
          : [],
        total_steps: manager ? 1 : 0,
        estimated_days: manager ? 3 : 0
      });
    }

    // Rule-based preview
    const approverIds = new Set();

    if (rule.is_manager_approver && rule.managerId && rule.managerId !== userId) {
      approverIds.add(rule.managerId);
    }

    (rule.sequential_steps || []).forEach((step) => approverIds.add(step.approver_id));
    (rule.parallel_approvers || []).forEach((p) => approverIds.add(p.approver_id));
    if (rule.specific_approver_id) approverIds.add(rule.specific_approver_id);

    const approverIdList = Array.from(approverIds);

    let approversById = {};
    if (approverIdList.length > 0) {
      const { data: approvers } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, on_leave, leave_end_date")
        .in("id", approverIdList);

      approversById = (approvers || []).reduce((acc, a) => {
        acc[a.id] = a;
        return acc;
      }, {});
    }

    const steps = [];
    let orderCursor = 1;

    if (rule.is_manager_approver && rule.managerId && rule.managerId !== userId) {
      const m = approversById[rule.managerId];
      if (m) {
        steps.push({
          step_order: orderCursor++,
          approver_id: m.id,
          approver_name: m.full_name || m.email,
          approver_email: m.email,
          approver_role: m.role,
          approver_on_leave: m.on_leave || false,
          will_escalate: m.on_leave || false,
          escalation_reason: m.on_leave ? "manager_on_leave" : null,
          approver_leave_end_date: m.leave_end_date,
          estimated_days: 3,
          type: "SEQUENTIAL"
        });
      }
    }

    (rule.sequential_steps || [])
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .forEach((step) => {
        const p = approversById[step.approver_id];
        if (!p) return;
        steps.push({
          step_order: orderCursor++,
          approver_id: p.id,
          approver_name: p.full_name || p.email,
          approver_email: p.email,
          approver_role: p.role,
          approver_on_leave: p.on_leave || false,
          will_escalate: p.on_leave || false,
          escalation_reason: p.on_leave ? "manager_on_leave" : null,
          approver_leave_end_date: p.leave_end_date,
          estimated_days: 3,
          type: "SEQUENTIAL"
        });
      });

    const parallelCandidates = [
      ...(rule.parallel_approvers || []).map((p) => p.approver_id),
      ...(rule.specific_approver_id ? [rule.specific_approver_id] : [])
    ];

    const seenParallel = new Set();
    parallelCandidates.forEach((approverId) => {
      if (seenParallel.has(approverId)) return;
      seenParallel.add(approverId);
      const p = approversById[approverId];
      if (!p) return;
      steps.push({
        step_order: null,
        approver_id: p.id,
        approver_name: p.full_name || p.email,
        approver_email: p.email,
        approver_role: p.role,
        approver_on_leave: p.on_leave || false,
        will_escalate: p.on_leave || false,
        escalation_reason: p.on_leave ? "manager_on_leave" : null,
        approver_leave_end_date: p.leave_end_date,
        estimated_days: 1,
        type: "PARALLEL"
      });
    });

    return res.json({
      can_submit: true,
      rule: {
        id: rule.id,
        name: rule.name,
        min_approval_percentage: rule.min_approval_percentage,
        has_special_approver: Boolean(rule.specific_approver_id)
      },
      approval_steps: steps,
      total_steps: steps.length,
      estimated_days: steps.filter((s) => s.type === "SEQUENTIAL").length * 3 + (steps.some((s) => s.type === "PARALLEL") ? 1 : 0)
    });
  } catch (error) {
    console.error("Error getting approval preview:", error);
    res.status(500).json({ error: "Failed to get approval preview", details: error.message });
  }
}

/**
 * Check if current user can submit expenses.
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

    if (profile.role === "admin") {
      return res.json({
        can_submit: false,
        reason: "Admins cannot submit expenses. Only employees and managers can submit.",
        allowed_roles: ["employee", "manager"]
      });
    }

    return res.json({
      can_submit: true,
      role: profile.role,
      has_manager: Boolean(profile.manager_id),
      message: "You can submit expenses for approval."
    });
  } catch (error) {
    console.error("Error checking submission eligibility:", error);
    res.status(500).json({ error: "Failed to check eligibility", details: error.message });
  }
}
