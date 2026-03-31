import { supabase } from "../config/supabaseClient.js";

/**
 * Get pending expenses for approval (Manager/Admin)
 * Returns expenses from team members that are pending approval
 */
export const getPendingApprovals = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.user_metadata?.role || "employee";

    let query = supabase
      .from("expenses")
      .select(`
        id,
        user_id,
        description,
        expense_date,
        category,
        paid_by,
        remarks,
        amount,
        status,
        created_at
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // If manager, only get expenses from their team members
    if (userRole === "manager") {
      // First get team member IDs
      const { data: teamMembers, error: teamError } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", userId);

      if (teamError) throw teamError;

      const teamIds = teamMembers.map(m => m.id);
      
      if (teamIds.length === 0) {
        return res.json({ expenses: [] });
      }

      query = query.in("user_id", teamIds);
    }
    // Admin can see all pending expenses

    const { data: expenses, error } = await query;

    if (error) throw error;

    // Enrich with employee info
    const userIds = [...new Set(expenses.map(e => e.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    const profileMap = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });

    const enrichedExpenses = expenses.map(expense => ({
      ...expense,
      employee_name: profileMap[expense.user_id]?.email?.split("@")[0] || "Unknown",
      user_email: profileMap[expense.user_id]?.email || "Unknown"
    }));

    res.json({ expenses: enrichedExpenses });
  } catch (err) {
    console.error("Error fetching pending approvals:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get approval history (processed by current user)
 */
export const getApprovalHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: approvals, error } = await supabase
      .from("manager_approvals")
      .select(`
        id,
        ticket_id,
        manager_id,
        request_owner_id,
        approval_subject,
        category,
        total_amount,
        status,
        created_at
      `)
      .eq("manager_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Get expense details and employee info
    const ticketIds = approvals.map(a => a.ticket_id);
    const ownerIds = [...new Set(approvals.map(a => a.request_owner_id))];

    const [expenseResult, profileResult] = await Promise.all([
      supabase.from("expenses").select("id, description, amount").in("id", ticketIds),
      supabase.from("profiles").select("id, email").in("id", ownerIds)
    ]);

    const expenseMap = {};
    expenseResult.data?.forEach(e => {
      expenseMap[e.id] = e;
    });

    const profileMap = {};
    profileResult.data?.forEach(p => {
      profileMap[p.id] = p;
    });

    const enrichedApprovals = approvals.map(approval => ({
      ...approval,
      expense_description: expenseMap[approval.ticket_id]?.description || approval.approval_subject || "Expense",
      amount: approval.total_amount || expenseMap[approval.ticket_id]?.amount || 0,
      employee_name: profileMap[approval.request_owner_id]?.email?.split("@")[0] || "Unknown"
    }));

    res.json({ approvals: enrichedApprovals });
  } catch (err) {
    console.error("Error fetching approval history:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Process expense approval (approve/reject)
 */
export const approveExpense = async (req, res) => {
  try {
    const { expense_id, approver_id, status, comments } = req.body;
    const userId = req.user.id;

    if (!expense_id || !status) {
      return res.status(400).json({ error: "expense_id and status are required" });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    }

    // Get expense details
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expense_id)
      .single();

    if (expenseError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Create approval record
    const { data: approval, error: approvalError } = await supabase
      .from("manager_approvals")
      .insert([{
        ticket_id: expense_id,
        manager_id: approver_id || userId,
        request_owner_id: expense.user_id,
        approval_subject: expense.description,
        category: expense.category,
        total_amount: expense.amount,
        status: status,
        request_status: comments || null
      }])
      .select()
      .single();

    if (approvalError) throw approvalError;

    // Update expense status
    const { error: updateError } = await supabase
      .from("expenses")
      .update({ status: status })
      .eq("id", expense_id);

    if (updateError) throw updateError;

    res.json({ 
      message: `Expense ${status} successfully`, 
      approval 
    });
  } catch (err) {
    console.error("Error processing approval:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Manager approval for tickets (legacy support)
 */
export const approveTicket = async (req, res) => {
  try {
    const { ticket_id, manager_id, request_owner_id, status } = req.body;

    const { data, error } = await supabase
      .from("manager_approvals")
      .insert([{ ticket_id, manager_id, request_owner_id, status }])
      .select();

    if (error) throw error;

    res.json({ message: "Approval recorded", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
