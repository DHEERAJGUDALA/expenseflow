import { supabase } from "../config/supabaseClient.js";

export const createExpense = async (req, res) => {
  try {
    const { user_id, amount, category, description } = req.body;

    const { data, error } = await supabase
      .from("expenses")
      .insert([{ user_id, amount, category, description }]);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};