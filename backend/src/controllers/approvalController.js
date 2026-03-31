import { supabase } from "../config/supabaseClient.js";

export const approveExpense = async (req, res) => {
  try {
    const { expense_id, approver_id, status, comments } = req.body;

    const { data, error } = await supabase
      .from("approvals")
      .insert([{ expense_id, approver_id, status, comments }]);

    if (error) throw error;

    // Update expense status if needed
    if (status === "approved" || status === "rejected") {
      await supabase
        .from("expenses")
        .update({ status: status })
        .eq("id", expense_id);
    }

    res.json({ message: "Approval recorded", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Manager approval for tickets (from main branch)
export const approveTicket = async (req, res) => {
  try {
    const { ticket_id, manager_id, request_owner_id, status } = req.body;

    const { data, error } = await supabase
      .from("manager_approvals")
      .insert([{ ticket_id, manager_id, request_owner_id, status }]);

    if (error) throw error;

    res.json({ message: "Approval recorded", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
