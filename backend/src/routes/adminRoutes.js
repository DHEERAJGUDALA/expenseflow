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
 * CRITICAL: Scoped to admin's company only (multi-tenancy enforced)
 */
router.get("/health", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is admin AND get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "Admin has no company assigned" });
    }

    // Check data integrity FOR THIS COMPANY ONLY
    const issues = [];

    // Check profiles without company (in this company - should be 0)
    const { count: profilesWithoutCompany } = await supabase
      .from("profiles")
      .select("*", { count: 'exact', head: true })
      .eq("company_id", profile.company_id)
      .is("company_id", null);

    if (profilesWithoutCompany > 0) {
      issues.push({
        type: "profiles_without_company",
        count: profilesWithoutCompany,
        severity: "warning",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Check expenses without employee_id (scoped to company)
    const { count: expensesWithoutEmployee } = await supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .eq("company_id", profile.company_id)
      .is("employee_id", null);

    if (expensesWithoutEmployee > 0) {
      issues.push({
        type: "expenses_without_employee",
        count: expensesWithoutEmployee,
        severity: "error",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Check expenses without company_id (should never happen for company-scoped query)
    const { count: expensesWithoutCompany } = await supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .eq("company_id", profile.company_id)
      .is("company_id", null);

    if (expensesWithoutCompany > 0) {
      issues.push({
        type: "expenses_without_company",
        count: expensesWithoutCompany,
        severity: "error",
        fix: "Run /api/admin/fix-data to auto-fix"
      });
    }

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", profile.company_id)
      .single();

    // Check approval rules for this company
    const { count: rulesCount } = await supabase
      .from("approval_rules")
      .select("*", { count: 'exact', head: true })
      .eq("company_id", profile.company_id);

    // Check approval logs for expenses in this company
    const { count: logsCount } = await supabase
      .from("approval_logs")
      .select(`
        id,
        expense:expense_id!inner (company_id)
      `, { count: 'exact', head: true })
      .eq("expense.company_id", profile.company_id);

    res.json({
      status: issues.length === 0 ? "healthy" : "needs_attention",
      issues,
      company: {
        id: company?.id,
        name: company?.name
      },
      stats: {
        approvalRules: rulesCount || 0,
        approvalLogs: logsCount || 0,
        issuesFound: issues.length
      },
      message: "Health check scoped to your company only"
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
 * Creates audit trail, cancels all pending approvals,
 * and notifies skipped approvers + other admins
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

    // ═══════════════════════════════════════════════════════════════
    // Cancel all pending/locked approval logs for this expense
    // FIXED: Use correct column names (action, comment, updated_at)
    // ═══════════════════════════════════════════════════════════════
    const { data: cancelledLogs } = await supabase
      .from("approval_logs")
      .update({ 
        action: 'SKIPPED',
        comment: `Skipped due to admin override by ${profile.email}`,
        updated_at: new Date().toISOString()
      })
      .eq("expense_id", expenseId)
      .in("action", ['PENDING', 'LOCKED'])
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

    // ═══════════════════════════════════════════════════════════════
    // Create admin override approval log
    // FIXED: Use correct column names and types
    // ═══════════════════════════════════════════════════════════════
    await supabase
      .from("approval_logs")
      .insert({
        expense_id: expenseId,
        approver_id: userId,
        step_order: -1,
        type: 'SEQUENTIAL',
        is_required: false,
        action: 'APPROVED',
        comment: `ADMIN OVERRIDE: ${reason.trim()}`,
        updated_at: new Date().toISOString()
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

    // ═══════════════════════════════════════════════════════════════
    // NOTIFICATIONS — Required by spec:
    // 1. Notify the employee that their expense was force-approved
    // 2. Notify every skipped approver
    // 3. Notify every OTHER admin in the company
    // ═══════════════════════════════════════════════════════════════
    const notifications = [];

    // 1. Notify the employee
    if (expense.employee_id) {
      notifications.push({
        user_id: expense.employee_id,
        message: `Your expense "${expense.description}" has been approved by admin (${profile.email}). Override reason: ${reason.trim()}`,
        expense_id: expenseId,
        type: 'expense_approved',
        is_read: false
      });
    }

    // 2. Notify every skipped approver
    if (cancelledLogs && cancelledLogs.length > 0) {
      const skippedApproverIds = [...new Set(cancelledLogs.map(l => l.approver_id))];
      for (const approverId of skippedApproverIds) {
        if (approverId !== userId) { // Don't notify the admin who did the override
          notifications.push({
            user_id: approverId,
            message: `An expense you were assigned to approve ("${expense.description}") was force-approved by admin (${profile.email}). Your approval was skipped.`,
            expense_id: expenseId,
            type: 'general',
            is_read: false
          });
        }
      }
    }

    // 3. Notify every OTHER admin in the company
    const { data: otherAdmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("role", "admin")
      .neq("id", userId);

    if (otherAdmins && otherAdmins.length > 0) {
      for (const admin of otherAdmins) {
        notifications.push({
          user_id: admin.id,
          message: `Admin ${profile.email} force-approved expense "${expense.description}" (${expense.converted_amount || expense.amount} ${expense.company_currency || expense.currency}). Reason: ${reason.trim()}`,
          expense_id: expenseId,
          type: 'general',
          is_read: false
        });
      }
    }

    // Insert all notifications
    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    res.json({
      message: "Expense force approved successfully",
      expense: updatedExpense,
      override_details: {
        admin: profile.email,
        reason: reason.trim(),
        skipped_approvals: cancelledLogs?.length || 0,
        notifications_sent: notifications.length,
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

/**
 * GET /api/admin/debug/tenancy
 * Debug endpoint to check multi-tenancy state for admin's OWN company only
 * CRITICAL: Scoped to admin's company - does NOT show other companies' data
 */
router.get("/debug/tenancy", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user is admin AND get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "Admin has no company assigned" });
    }

    // Get admin's company info
    const { data: company } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", profile.company_id)
      .single();

    // Get profiles ONLY for admin's company (MULTI-TENANCY FILTER)
    const { data: companyProfiles } = await supabase
      .from("profiles")
      .select("id, email, role, company_id")
      .eq("company_id", profile.company_id);

    // Get orphaned profiles in this company (should be none)
    const orphanedInCompany = (companyProfiles || []).filter(p => !p.company_id);

    // Build summary for admin's company ONLY
    const roleCounts = {
      admin: 0,
      manager: 0,
      employee: 0
    };

    for (const p of companyProfiles || []) {
      if (roleCounts[p.role] !== undefined) {
        roleCounts[p.role]++;
      }
    }

    res.json({
      current_user: {
        id: userId,
        company_id: profile.company_id
      },
      company: {
        id: company?.id,
        name: company?.name
      },
      total_profiles_in_company: companyProfiles?.length || 0,
      role_distribution: roleCounts,
      profiles: (companyProfiles || []).map(p => ({
        id: p.id,
        email: p.email,
        role: p.role
      })),
      orphaned_profiles_count: orphanedInCompany.length,
      message: "Showing data for your company only (multi-tenancy enforced)"
    });
  } catch (error) {
    console.error("Error in debug/tenancy:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
