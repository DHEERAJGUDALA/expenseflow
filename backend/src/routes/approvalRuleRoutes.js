import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// Helper: verify admin role
// ═══════════════════════════════════════════════════════════════
async function requireAdmin(req, res) {
  const userId = req.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", userId)
    .single();

  if (!profile || profile.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return profile;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/approval-rules/eligible-approvers
// Returns all managers and admins in the company for dropdowns
// MUST be defined before /:id to avoid route conflict
// ═══════════════════════════════════════════════════════════════
router.get("/eligible-approvers", authenticateUser, async (req, res) => {
  try {
    const profile = await requireAdmin(req, res);
    if (!profile) return;

    const { data: approvers, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, job_title, role")
      .eq("company_id", profile.company_id)
      .in("role", ["manager", "admin"])
      .order("full_name", { ascending: true });

    if (error) throw error;

    res.json({
      approvers: (approvers || []).map((a) => ({
        id: a.id,
        full_name: a.full_name || a.email?.split("@")[0],
        email: a.email,
        job_title: a.job_title || a.role,
        role: a.role,
      })),
    });
  } catch (error) {
    console.error("Error fetching eligible approvers:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/approval-rules
// List all rules for the company with nested steps
// ═══════════════════════════════════════════════════════════════
router.get("/", authenticateUser, async (req, res) => {
  try {
    const profile = await requireAdmin(req, res);
    if (!profile) return;

    const { data: rules, error } = await supabase
      .from("approval_rules")
      .select(`
        *,
        steps:approval_rule_steps(
          id, approver_id, step_order,
          approver:approver_id(id, email, full_name, job_title, role)
        ),
        special_approver:specific_approver_id(id, email, full_name, job_title, role)
      `)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Sort steps within each rule
    const rulesWithSortedSteps = (rules || []).map((rule) => ({
      ...rule,
      steps: (rule.steps || []).sort((a, b) => a.step_order - b.step_order),
    }));

    res.json({ rules: rulesWithSortedSteps });
  } catch (error) {
    console.error("Error fetching rules:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/approval-rules
// Create a rule + its steps in a single operation
// ═══════════════════════════════════════════════════════════════
router.post("/", authenticateUser, async (req, res) => {
  try {
    const profile = await requireAdmin(req, res);
    if (!profile) return;

    const {
      name,
      category,
      threshold_amount,
      is_manager_approver,
      min_approval_percentage,
      specific_approver_id,
      is_default,
      steps,
    } = req.body;

    // Validate required
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Rule name is required" });
    }

    // Validate: only one default rule per company
    if (is_default) {
      const { data: existingDefault } = await supabase
        .from("approval_rules")
        .select("id, name")
        .eq("company_id", profile.company_id)
        .eq("is_default", true)
        .limit(1);

      if (existingDefault && existingDefault.length > 0) {
        return res.status(400).json({
          error: `Another default rule already exists: "${existingDefault[0].name}". Only one default rule is allowed per company.`,
        });
      }
    }

    // Validate steps: approvers must be MANAGER or ADMIN
    if (steps && steps.length > 0) {
      const approverIds = steps.map((s) => s.approver_id);
      const { data: approverProfiles } = await supabase
        .from("profiles")
        .select("id, role")
        .in("id", approverIds);

      const invalidApprovers = (approverProfiles || []).filter(
        (p) => !["manager", "admin"].includes(p.role)
      );

      if (invalidApprovers.length > 0) {
        return res.status(400).json({
          error: "All approvers in the chain must have role MANAGER or ADMIN",
        });
      }
    }

    // Validate specific_approver_id role
    if (specific_approver_id) {
      const { data: specialProfile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", specific_approver_id)
        .single();

      if (!specialProfile || !["manager", "admin"].includes(specialProfile.role)) {
        return res.status(400).json({
          error: "Special approver must have role MANAGER or ADMIN",
        });
      }
    }

    // Insert rule
    const { data: rule, error: ruleError } = await supabase
      .from("approval_rules")
      .insert({
        company_id: profile.company_id,
        name: name.trim(),
        category: category || null,
        threshold_amount: threshold_amount !== undefined && threshold_amount !== "" ? parseFloat(threshold_amount) : null,
        is_manager_approver: is_manager_approver !== false, // default true
        min_approval_percentage: min_approval_percentage || null,
        specific_approver_id: specific_approver_id || null,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (ruleError) throw ruleError;

    // Insert steps
    if (steps && steps.length > 0) {
      const stepsToInsert = steps.map((s, i) => ({
        rule_id: rule.id,
        approver_id: s.approver_id,
        step_order: s.step_order || i + 1,
      }));

      const { error: stepsError } = await supabase
        .from("approval_rule_steps")
        .insert(stepsToInsert);

      if (stepsError) {
        // Rollback: delete the rule
        await supabase.from("approval_rules").delete().eq("id", rule.id);
        throw stepsError;
      }
    }

    // Re-fetch with full data
    const { data: fullRule } = await supabase
      .from("approval_rules")
      .select(`
        *,
        steps:approval_rule_steps(
          id, approver_id, step_order,
          approver:approver_id(id, email, full_name, job_title, role)
        ),
        special_approver:specific_approver_id(id, email, full_name, job_title, role)
      `)
      .eq("id", rule.id)
      .single();

    if (fullRule?.steps) {
      fullRule.steps.sort((a, b) => a.step_order - b.step_order);
    }

    res.status(201).json({ rule: fullRule, message: "Rule created successfully" });
  } catch (error) {
    console.error("Error creating rule:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/approval-rules/:id
// Update rule and replace its steps
// ═══════════════════════════════════════════════════════════════
router.put("/:id", authenticateUser, async (req, res) => {
  try {
    const profile = await requireAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;
    const {
      name,
      category,
      threshold_amount,
      is_manager_approver,
      min_approval_percentage,
      specific_approver_id,
      is_default,
      steps,
    } = req.body;

    // Verify rule belongs to company
    const { data: existing } = await supabase
      .from("approval_rules")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", profile.company_id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: "Rule not found" });
    }

    // Validate default uniqueness (exclude self)
    if (is_default) {
      const { data: otherDefault } = await supabase
        .from("approval_rules")
        .select("id, name")
        .eq("company_id", profile.company_id)
        .eq("is_default", true)
        .neq("id", id)
        .limit(1);

      if (otherDefault && otherDefault.length > 0) {
        return res.status(400).json({
          error: `Another default rule exists: "${otherDefault[0].name}"`,
        });
      }
    }

    // Update rule
    const { error: updateError } = await supabase
      .from("approval_rules")
      .update({
        name: name?.trim(),
        category: category || null,
        threshold_amount: threshold_amount !== undefined && threshold_amount !== "" ? parseFloat(threshold_amount) : null,
        is_manager_approver: is_manager_approver !== false,
        min_approval_percentage: min_approval_percentage || null,
        specific_approver_id: specific_approver_id || null,
        is_default: is_default || false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Replace steps: delete old, insert new
    await supabase.from("approval_rule_steps").delete().eq("rule_id", id);

    if (steps && steps.length > 0) {
      const stepsToInsert = steps.map((s, i) => ({
        rule_id: id,
        approver_id: s.approver_id,
        step_order: s.step_order || i + 1,
      }));

      const { error: stepsError } = await supabase
        .from("approval_rule_steps")
        .insert(stepsToInsert);

      if (stepsError) throw stepsError;
    }

    // Re-fetch full rule
    const { data: fullRule } = await supabase
      .from("approval_rules")
      .select(`
        *,
        steps:approval_rule_steps(
          id, approver_id, step_order,
          approver:approver_id(id, email, full_name, job_title, role)
        ),
        special_approver:specific_approver_id(id, email, full_name, job_title, role)
      `)
      .eq("id", id)
      .single();

    if (fullRule?.steps) {
      fullRule.steps.sort((a, b) => a.step_order - b.step_order);
    }

    res.json({ rule: fullRule, message: "Rule updated successfully" });
  } catch (error) {
    console.error("Error updating rule:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/approval-rules/:id
// ═══════════════════════════════════════════════════════════════
router.delete("/:id", authenticateUser, async (req, res) => {
  try {
    const profile = await requireAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;

    // Verify rule belongs to company
    const { data: existing } = await supabase
      .from("approval_rules")
      .select("id")
      .eq("id", id)
      .eq("company_id", profile.company_id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: "Rule not found" });
    }

    // Steps are cascade-deleted via FK
    const { error } = await supabase
      .from("approval_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ message: "Rule deleted successfully" });
  } catch (error) {
    console.error("Error deleting rule:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
