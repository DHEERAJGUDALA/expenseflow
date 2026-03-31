import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { supabase } from "../config/supabaseClient.js";
import {
  processApproval,
  processSpecialApproverAction,
} from "../services/approvalEngine.js";

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// Helper: verify manager or admin role
// ═══════════════════════════════════════════════════════════════
async function requireManagerOrAdmin(req, res) {
  const userId = req.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, company_id, email, full_name")
    .eq("id", userId)
    .single();

  if (!profile || !["manager", "admin"].includes(profile.role)) {
    res.status(403).json({ error: "Manager or Admin access required" });
    return null;
  }
  return profile;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/manager/queue
// Returns expenses where this user has a PENDING approval step
// CRITICAL: Only returns expenses from user's company
// ═══════════════════════════════════════════════════════════════
router.get("/queue", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    // CRITICAL: Verify user has company_id
    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Find expense IDs where I have a PENDING step
    const { data: pendingSteps, error: stepsError } = await supabase
      .from("expense_approval_steps")
      .select("expense_id, step_order, created_at")
      .eq("approver_id", profile.id)
      .eq("status", "PENDING");

    if (stepsError) throw stepsError;

    if (!pendingSteps || pendingSteps.length === 0) {
      return res.json({ expenses: [] });
    }

    const expenseIds = pendingSteps.map((s) => s.expense_id);

    // Fetch expense details - CRITICAL: Filter by company_id
    const { data: expenses, error: expError } = await supabase
      .from("expenses")
      .select(`
        id, description, category, amount, currency,
        converted_amount, company_currency, expense_date,
        status, created_at,
        employee:employee_id(id, email, full_name, job_title),
        rule:applied_rule_id(id, name)
      `)
      .in("id", expenseIds)
      .eq("company_id", profile.company_id)  // MULTI-TENANCY FILTER
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (expError) throw expError;

    // Enrich with waiting time and step info
    const now = new Date();
    const enriched = (expenses || []).map((exp) => {
      const step = pendingSteps.find((s) => s.expense_id === exp.id);
      const createdAt = new Date(exp.created_at);
      const waitingMs = now - createdAt;
      const waitingDays = Math.floor(waitingMs / (1000 * 60 * 60 * 24));
      const waitingHours = Math.floor(waitingMs / (1000 * 60 * 60)) % 24;

      return {
        ...exp,
        employee_name: exp.employee?.full_name || exp.employee?.email?.split("@")[0] || "Unknown",
        employee_email: exp.employee?.email,
        employee_job_title: exp.employee?.job_title,
        rule_name: exp.rule?.name,
        my_step_order: step?.step_order,
        waiting_since: exp.created_at,
        waiting_time: waitingDays > 0 ? `${waitingDays}d ${waitingHours}h` : `${waitingHours}h`,
      };
    });

    res.json({ expenses: enriched });
  } catch (error) {
    console.error("Error fetching manager queue:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/manager/special-queue
// Returns expenses where this user is the special approver
// CRITICAL: Only returns expenses from user's company
// ═══════════════════════════════════════════════════════════════
router.get("/special-queue", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    // CRITICAL: Verify user has company_id
    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Find rules where I'm the special approver (already filtered by company_id)
    const { data: myRules, error: rulesError } = await supabase
      .from("approval_rules")
      .select("id, name, category")
      .eq("specific_approver_id", profile.id)
      .eq("company_id", profile.company_id);

    if (rulesError) throw rulesError;

    if (!myRules || myRules.length === 0) {
      return res.json({ expenses: [], is_special_approver: false });
    }

    const ruleIds = myRules.map((r) => r.id);

    // Find pending expenses using those rules - CRITICAL: Filter by company_id
    const { data: expenses, error: expError } = await supabase
      .from("expenses")
      .select(`
        id, description, category, amount, currency,
        converted_amount, company_currency, expense_date,
        status, created_at, applied_rule_id,
        employee:employee_id(id, email, full_name, job_title)
      `)
      .in("applied_rule_id", ruleIds)
      .eq("company_id", profile.company_id)  // MULTI-TENANCY FILTER
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (expError) throw expError;

    const enriched = (expenses || []).map((exp) => {
      const rule = myRules.find((r) => r.id === exp.applied_rule_id);
      return {
        ...exp,
        employee_name: exp.employee?.full_name || exp.employee?.email?.split("@")[0] || "Unknown",
        employee_email: exp.employee?.email,
        employee_job_title: exp.employee?.job_title,
        rule_name: rule?.name,
        is_special_approver: true,
      };
    });

    res.json({ expenses: enriched, is_special_approver: true });
  } catch (error) {
    console.error("Error fetching special queue:", error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/manager/expenses/:id/approve
// ═══════════════════════════════════════════════════════════════
router.post("/expenses/:id/approve", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;
    const { comment } = req.body;

    const result = await processApproval(id, profile.id, "APPROVE", comment || null);

    res.json({
      message: "Expense approved successfully",
      result,
    });
  } catch (error) {
    console.error("Error approving expense:", error);
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/manager/expenses/:id/reject
// Requires comment of at least 20 characters
// ═══════════════════════════════════════════════════════════════
router.post("/expenses/:id/reject", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || comment.trim().length < 20) {
      return res.status(400).json({
        error: "Rejection comment is required and must be at least 20 characters",
        provided_length: comment ? comment.trim().length : 0,
      });
    }

    const result = await processApproval(id, profile.id, "REJECT", comment.trim());

    res.json({
      message: "Expense rejected",
      result,
    });
  } catch (error) {
    console.error("Error rejecting expense:", error);
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/manager/expenses/:id/special-approve
// ═══════════════════════════════════════════════════════════════
router.post("/expenses/:id/special-approve", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;
    const { comment } = req.body;

    const result = await processSpecialApproverAction(id, profile.id, "APPROVE", comment || null);

    res.json({
      message: "Expense approved by special approver",
      result,
    });
  } catch (error) {
    console.error("Error special-approving expense:", error);
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/manager/expenses/:id/special-reject
// ═══════════════════════════════════════════════════════════════
router.post("/expenses/:id/special-reject", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || comment.trim().length < 20) {
      return res.status(400).json({
        error: "Rejection comment is required and must be at least 20 characters",
        provided_length: comment ? comment.trim().length : 0,
      });
    }

    const result = await processSpecialApproverAction(id, profile.id, "REJECT", comment.trim());

    res.json({
      message: "Expense rejected by special approver",
      result,
    });
  } catch (error) {
    console.error("Error special-rejecting expense:", error);
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/manager/team-expenses
// Returns read-only expenses for users who report to this manager
// CRITICAL: Only returns team members and expenses from same company
// ═══════════════════════════════════════════════════════════════
router.get("/team-expenses", authenticateUser, async (req, res) => {
  try {
    const profile = await requireManagerOrAdmin(req, res);
    if (!profile) return;

    // CRITICAL: Verify user has company_id
    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // First find all profiles who have this manager AND are in same company
    const { data: teamMembers, error: teamError } = await supabase
      .from("profiles")
      .select("id")
      .eq("manager_id", profile.id)
      .eq("company_id", profile.company_id);  // MULTI-TENANCY FILTER

    if (teamError) throw teamError;

    if (!teamMembers || teamMembers.length === 0) {
      return res.json({ expenses: [] });
    }

    const teamIds = teamMembers.map((t) => t.id);

    // Fetch their expenses - CRITICAL: Filter by company_id
    const { data: expenses, error: expError } = await supabase
      .from("expenses")
      .select(`
        id, description, category, amount, currency,
        converted_amount, company_currency, expense_date,
        status, created_at,
        employee:employee_id(id, email, full_name, job_title)
      `)
      .in("employee_id", teamIds)
      .eq("company_id", profile.company_id)  // MULTI-TENANCY FILTER
      .order("created_at", { ascending: false });

    if (expError) throw expError;

    const enriched = (expenses || []).map((exp) => ({
      ...exp,
      employee_name: exp.employee?.full_name || exp.employee?.email?.split("@")[0] || "Unknown",
      employee_email: exp.employee?.email,
      employee_job_title: exp.employee?.job_title,
    }));

    res.json({ expenses: enriched });
  } catch (error) {
    console.error("Error fetching team expenses:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
