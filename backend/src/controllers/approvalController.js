import { supabase } from "../config/supabaseClient.js";
import { processApprovalAction } from "../services/approvalWorkflowEngine.js";
import { notifyApprover, notifyEmployee, notifySpecialApprover } from "./notificationController.js";

/**
 * Approval Controller - REWRITTEN FOR NEW SCHEMA
 * Uses approval_logs instead of manager_approvals
 */

/**
 * Get pending expenses for approval (Manager/Admin)
 * Returns expenses from team members that are pending approval
 * CRITICAL: Only shows expenses from same company
 */
export const getPendingApprovals = async (req, res) => {
  try {
    const userId = req.user.id;

    // Ensure approver profile exists (used for permission context)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "Approver profile not found" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get expenses where user is a PENDING approver
    const { data: pendingLogs, error: logsError } = await supabase
      .from("approval_logs")
      .select("expense_id")
      .eq("approver_id", userId)
      .eq("action", "PENDING");

    if (logsError) throw logsError;

    const expenseIds = pendingLogs.map(log => log.expense_id);

    if (expenseIds.length === 0) {
      return res.json({ expenses: [] });
    }

    // Get expense details SCOPED TO COMPANY
    const { data: expenses, error: expensesError } = await supabase
      .from("expenses")
      .select(`
        id,
        employee_id,
        user_id,
        description,
        expense_date,
        category,
        paid_by,
        remarks,
        amount,
        currency,
        status,
        current_step,
        created_at,
        company_id,
        employee:employee_id(id, email, role, full_name, job_title)
      `)
      .in("id", expenseIds)
      .eq("company_id", profile.company_id) // MULTI-TENANCY FILTER
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (expensesError) throw expensesError;

    // Enrich with employee info
    const enrichedExpenses = expenses.map(expense => ({
      ...expense,
      employee_name: expense.employee?.full_name || expense.employee?.email?.split("@")[0] || "Unknown",
      job_title: expense.employee?.job_title || null,
      user_email: expense.employee?.email || "Unknown"
    }));

    res.json({ expenses: enrichedExpenses });
  } catch (err) {
    console.error("Error fetching pending approvals:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get approval history (processed by current user)
 * CRITICAL: Only shows approvals for expenses from same company
 */
export const getApprovalHistory = async (req, res) => {
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

    // Get approval logs where user took action
    const { data: logs, error: logsError } = await supabase
      .from("approval_logs")
      .select(`
        id,
        expense_id,
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
          employee_id,
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

    const enrichedApprovals = companyFilteredLogs.map(log => ({
      id: log.id,
      expense_id: log.expense_id,
      status: log.action.toLowerCase(),
      comment: log.comment,
      step_order: log.step_order,
      type: log.type,
      created_at: log.created_at,
      updated_at: log.updated_at,
      expense_description: log.expense?.description || "Expense",
      amount: log.expense?.amount || 0,
      currency: log.expense?.currency || "INR",
      category: log.expense?.category,
      employee_name: log.expense?.employee?.email?.split("@")[0] || "Unknown",
      employee_email: log.expense?.employee?.email || "Unknown"
    }));

    res.json({ approvals: enrichedApprovals });
  } catch (err) {
    console.error("Error fetching approval history:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Process expense approval (approve/reject)
 * Uses new workflow engine
 */
export const approveExpense = async (req, res) => {
  try {
    const { expense_id, status, comments } = req.body;
    const userId = req.user.id;

    if (!expense_id || !status) {
      return res.status(400).json({ error: "expense_id and status are required" });
    }

    if (!["approved", "rejected"].includes(status.toLowerCase())) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    }

    // Use new workflow engine
    const action = status.toUpperCase();
    const result = await processApprovalAction(expense_id, userId, action, comments);

    res.json({ 
      message: `Expense ${status} successfully`, 
      ...result
    });
  } catch (err) {
    console.error("Error processing approval:", err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Legacy support - Manager approval for tickets
 * Redirects to new workflow system
 */
export const approveTicket = async (req, res) => {
  try {
    const { ticket_id, status } = req.body;
    const userId = req.user.id;

    if (!ticket_id || !status) {
      return res.status(400).json({ error: "ticket_id and status are required" });
    }

    // Use new workflow engine
    const action = status.toUpperCase();
    const result = await processApprovalAction(ticket_id, userId, action, null);

    res.json({ 
      message: "Approval recorded", 
      data: result 
    });
  } catch (err) {
    console.error("Error approving ticket:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all expenses pending for manager approval (legacy compatibility)
 * CRITICAL: Only shows expenses from same company
 */
export const getManagerPendingExpenses = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's company_id
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get team members SCOPED TO COMPANY
    const { data: teamMembers, error: teamError } = await supabase
      .from("profiles")
      .select("id")
      .eq("manager_id", userId)
      .eq("company_id", currentUser.company_id); // MULTI-TENANCY FILTER

    if (teamError) throw teamError;

    if (teamMembers.length === 0) {
      return res.json({ expenses: [] });
    }

    const teamIds = teamMembers.map(m => m.id);

    // Get pending expenses from team SCOPED TO COMPANY
    const { data: expenses, error: expensesError } = await supabase
      .from("expenses")
      .select(`
        id,
        employee_id,
        description,
        expense_date,
        category,
        amount,
        currency,
        status,
        created_at,
        company_id,
        employee:employee_id(id, email)
      `)
      .in("employee_id", teamIds)
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (expensesError) throw expensesError;

    const enrichedExpenses = expenses.map(expense => ({
      ...expense,
      employee_name: expense.employee?.email?.split("@")[0] || "Unknown",
      user_email: expense.employee?.email || "Unknown"
    }));

    res.json({ expenses: enrichedExpenses });
  } catch (err) {
    console.error("Error fetching manager pending expenses:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get special approver queue
 * Returns expenses where this user is a PARALLEL (special) approver
 * CRITICAL: Only shows expenses from same company
 */
export const getSpecialApproverQueue = async (req, res) => {
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

    // Get expenses where user is a PARALLEL approver with PENDING status
    const { data: pendingLogs, error: logsError } = await supabase
      .from("approval_logs")
      .select("expense_id")
      .eq("approver_id", userId)
      .eq("type", "PARALLEL")
      .eq("action", "PENDING");

    if (logsError) throw logsError;

    const expenseIds = pendingLogs.map(log => log.expense_id);

    if (expenseIds.length === 0) {
      return res.json({ expenses: [], is_special_approver: false });
    }

    // Get expense details SCOPED TO COMPANY
    const { data: expenses, error: expensesError } = await supabase
      .from("expenses")
      .select(`
        id,
        employee_id,
        description,
        expense_date,
        category,
        amount,
        currency,
        converted_amount,
        company_currency,
        company_id,
        status,
        current_step,
        created_at,
        employee:employee_id(id, email, job_title)
      `)
      .in("id", expenseIds)
      .eq("company_id", profile.company_id) // MULTI-TENANCY FILTER
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (expensesError) throw expensesError;

    // Calculate waiting time for each expense
    const now = new Date();
    const enrichedExpenses = expenses.map(expense => {
      const createdAt = new Date(expense.created_at);
      const waitingDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      const waitingHours = Math.floor((now - createdAt) / (1000 * 60 * 60)) % 24;
      
      return {
        ...expense,
        employee_name: expense.employee?.email?.split("@")[0] || "Unknown",
        employee_email: expense.employee?.email || "Unknown",
        employee_job_title: expense.employee?.job_title,
        waiting_time: waitingDays > 0 
          ? `${waitingDays}d ${waitingHours}h` 
          : `${waitingHours}h`
      };
    });

    res.json({ 
      expenses: enrichedExpenses,
      is_special_approver: true,
      count: enrichedExpenses.length
    });
  } catch (err) {
    console.error("Error fetching special approver queue:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Enhanced approval processing with notifications
 */
export const processApprovalWithNotification = async (req, res) => {
  try {
    const { expense_id, status, comments } = req.body;
    const userId = req.user.id;

    if (!expense_id || !status) {
      return res.status(400).json({ error: "expense_id and status are required" });
    }

    if (!["approved", "rejected"].includes(status.toLowerCase())) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    }

    // Validate rejection comment
    if (status.toLowerCase() === 'rejected' && (!comments || comments.trim().length < 20)) {
      return res.status(400).json({ 
        error: "Rejection reason is required and must be at least 20 characters",
        provided_length: comments ? comments.trim().length : 0
      });
    }

    // Get expense and employee info before processing
    const { data: expense } = await supabase
      .from("expenses")
      .select(`
        employee_id,
        employee:employee_id(email)
      `)
      .eq("id", expense_id)
      .single();

    // Get approver info
    const { data: approver } = await supabase
      .from("profiles")
      .select("email, job_title")
      .eq("id", userId)
      .single();

    // Use new workflow engine
    const action = status.toUpperCase();
    const result = await processApprovalAction(expense_id, userId, action, comments);

    // Send notifications based on result
    if (result.success) {
      const approverName = approver?.email?.split('@')[0] || 'Approver';
      
      if (result.evaluation.finalStatus === 'APPROVED') {
        // Expense fully approved
        await notifyEmployee(expense.employee_id, expense_id, 'approved', approverName);
      } else if (result.evaluation.finalStatus === 'REJECTED') {
        // Expense rejected
        await notifyEmployee(expense.employee_id, expense_id, 'rejected', approverName, comments);
      } else if (result.action === 'APPROVED' && result.evaluation.moveToNextStep) {
        // Step approved, notify employee and next approver
        await notifyEmployee(expense.employee_id, expense_id, 'step_approved', approverName);
        
        // Get next approver
        const { data: nextApprover } = await supabase
          .from("approval_logs")
          .select("approver_id")
          .eq("expense_id", expense_id)
          .eq("action", "PENDING")
          .eq("type", "SEQUENTIAL")
          .order("step_order", { ascending: true })
          .limit(1)
          .single();

        if (nextApprover) {
          const { data: expenseDetails } = await supabase
            .from("expenses")
            .select("amount, category, currency")
            .eq("id", expense_id)
            .single();

          const employeeName = expense.employee?.email?.split('@')[0] || 'Employee';
          await notifyApprover(
            nextApprover.approver_id, 
            expense_id, 
            employeeName,
            `${expenseDetails.currency} ${expenseDetails.amount}`,
            expenseDetails.category
          );
        }
      }
    }

    res.json({ 
      message: `Expense ${status} successfully`, 
      ...result
    });
  } catch (err) {
    console.error("Error processing approval:", err);
    res.status(400).json({ error: err.message });
  }
};

export default {
  getPendingApprovals,
  getApprovalHistory,
  approveExpense,
  approveTicket,
  getManagerPendingExpenses,
  getSpecialApproverQueue,
  processApprovalWithNotification
};
