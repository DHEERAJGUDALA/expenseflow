import { supabase } from "../config/supabaseClient.js";

export const approveExpense = async (req, res) => {
  try {
    const { expense_id, approver_id, status } = req.body;

    const { data, error } = await supabase
      .from("approvals")
      .insert([{ expense_id, approver_id, status }]);

    if (error) throw error;

    res.json({ message: "Approval recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};