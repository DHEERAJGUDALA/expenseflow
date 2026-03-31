import { supabase } from "../config/supabaseClient.js";

export const approveExpense = async (req, res) => {
  try {
    const { ticket_id, manager_id, request_owner_id, status } = req.body;

    const { data, error } = await supabase
      .from("manager_approvals")
      .insert([{ ticket_id, manager_id, request_owner_id, status }]);

    if (error) throw error;

    res.json({ message: "Approval recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};