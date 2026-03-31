import express from "express";
import { autoFixDataIssues } from "../utils/validation.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

/**
 * Admin utility to auto-fix common data issues
 */
router.post("/fix-data", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await autoFixDataIssues();

    res.json({
      message: "Data fix completed",
      ...result
    });
  } catch (error) {
    console.error("Error in fix-data:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get system health check
 */
router.get("/health", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Check data integrity
    const issues = [];

    // Check profiles without company
    const { count: profilesWithoutCompany } = await supabase
      .from("profiles")
      .select("*", { count: 'exact', head: true })
      .is("company_id", null);

    if (profilesWithoutCompany > 0) {
      issues.push({
        type: "profiles_without_company",
        count: profilesWithoutCompany,
        severity: "warning",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Check expenses without employee_id
    const { count: expensesWithoutEmployee } = await supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .is("employee_id", null);

    if (expensesWithoutEmployee > 0) {
      issues.push({
        type: "expenses_without_employee",
        count: expensesWithoutEmployee,
        severity: "error",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Check expenses without company_id
    const { count: expensesWithoutCompany } = await supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .is("company_id", null);

    if (expensesWithoutCompany > 0) {
      issues.push({
        type: "expenses_without_company",
        count: expensesWithoutCompany,
        severity: "error",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Check companies
    const { count: companiesCount } = await supabase
      .from("companies")
      .select("*", { count: 'exact', head: true });

    // Check approval rules
    const { count: rulesCount } = await supabase
      .from("approval_rules")
      .select("*", { count: 'exact', head: true });

    // Check approval logs
    const { count: logsCount } = await supabase
      .from("approval_logs")
      .select("*", { count: 'exact', head: true });

    res.json({
      status: issues.length === 0 ? "healthy" : "needs_attention",
      issues,
      stats: {
        companies: companiesCount || 0,
        approvalRules: rulesCount || 0,
        approvalLogs: logsCount || 0,
        issuesFound: issues.length
      }
    });
  } catch (error) {
    console.error("Error in health check:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/expenses/:expenseId/force-approve
 * Force approve an expense (Admin override)
 * Requires reason with minimum 20 characters
 * Creates audit trail and cancels all pending approvals
 */
router.post("/expenses/:expenseId/force-approve", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { expenseId } = req.params;
    const { reason } = req.body;

    // Validate reason (minimum 20 characters)
    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({ 
        error: "Reason is required and must be at least 20 characters",
        provided_length: reason ? reason.trim().length : 0
      });
    }

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id, email")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get expense
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .eq("company_id", profile.company_id)
      .single();

    if (expenseError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Check if expense can be force approved
    if (expense.status === 'approved' || expense.status === 'paid') {
      return res.status(400).json({ 
        error: `Expense is already ${expense.status}`,
        status: expense.status
      });
    }

    if (expense.status === 'rejected') {
      return res.status(400).json({ 
        error: "Cannot force approve a rejected expense. Employee must resubmit.",
        status: expense.status
      });
    }

    // Cancel all pending approval logs for this expense
    const { data: cancelledLogs } = await supabase
      .from("approval_logs")
      .update({ 
        status: 'skipped',
        notes: `Skipped due to admin override by ${profile.email}`
      })
      .eq("expense_id", expenseId)
      .eq("status", "pending")
      .select();

    // Update expense status to approved
    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update({ 
        status: 'approved',
        current_step: -1 // Indicates completed via override
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create admin override approval log
    await supabase
      .from("approval_logs")
      .insert({
        expense_id: expenseId,
        approver_id: userId,
        step_index: -1, // Special index for override
        status: 'approved',
        is_parallel: false,
        notes: `ADMIN OVERRIDE: ${reason.trim()}`,
        decided_at: new Date().toISOString()
      });

    // Create audit log
    await supabase
      .from("audit_logs")
      .insert({
        actor_id: userId,
        action: 'EXPENSE_OVERRIDDEN',
        target_id: expenseId,
        target_type: 'EXPENSE',
        old_value: { 
          status: expense.status,
          current_step: expense.current_step
        },
        new_value: { 
          status: 'approved',
          current_step: -1,
          skipped_approvals: cancelledLogs?.length || 0
        },
        reason: reason.trim(),
        company_id: profile.company_id
      });

    res.json({
      message: "Expense force approved successfully",
      expense: updatedExpense,
      override_details: {
        admin: profile.email,
        reason: reason.trim(),
        skipped_approvals: cancelledLogs?.length || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Error in force-approve:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/expenses
 * Get all expenses for the company with filters
 * Admin only
 */
router.get("/expenses", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, category, employee_id, from_date, to_date, limit = 50, offset = 0 } = req.query;

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Build query
    let query = supabase
      .from("expenses")
      .select(`
        *,
        employee:employee_id(id, email)
      `)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }
    if (from_date) {
      query = query.gte("expense_date", from_date);
    }
    if (to_date) {
      query = query.lte("expense_date", to_date);
    }

    const { data: expenses, error } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .eq("company_id", profile.company_id);

    if (status) countQuery = countQuery.eq("status", status);
    if (category) countQuery = countQuery.eq("category", category);
    if (employee_id) countQuery = countQuery.eq("employee_id", employee_id);
    if (from_date) countQuery = countQuery.gte("expense_date", from_date);
    if (to_date) countQuery = countQuery.lte("expense_date", to_date);

    const { count } = await countQuery;

    res.json({
      expenses,
      pagination: {
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + expenses.length) < count
      }
    });
  } catch (error) {
    console.error("Error getting admin expenses:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/audit-logs
 * Get audit logs for the company
 * Admin only
 */
router.get("/audit-logs", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, target_type, limit = 50, offset = 0 } = req.query;

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Build query
    let query = supabase
      .from("audit_logs")
      .select(`
        *,
        actor:actor_id(id, email)
      `)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (action) {
      query = query.eq("action", action);
    }
    if (target_type) {
      query = query.eq("target_type", target_type);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    res.json({ logs });
  } catch (error) {
    console.error("Error getting audit logs:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
