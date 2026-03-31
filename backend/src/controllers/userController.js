import { supabase } from "../config/supabaseClient.js";

export const inviteUser = async (req, res) => {
  try {
    const { email, role } = req.body;

    const { data, error } =
      await supabase.auth.admin.inviteUserByEmail(email);

    if (error) throw error;

    await supabase.from("profiles").insert({
      id: data.user.id,
      email,
      role
    });

    res.json({ message: "Invite sent successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};