import { supabase } from "../config/supabaseClient.js";

/**
 * Invite a new user to the company
 * CRITICAL: company_id MUST be inherited from the inviting admin's profile
 */
export const inviteUser = async (req, res) => {
  try {
    const { email, role } = req.body;
    const adminUserId = req.user.id;

    // Get admin's profile to verify role and get company_id
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({ error: "Admin profile not found" });
    }

    // Verify admin role
    if (adminProfile.role !== "admin") {
      return res.status(403).json({ error: "Only admins can invite users" });
    }

    // CRITICAL: Verify admin has company_id
    if (!adminProfile.company_id) {
      return res.status(403).json({ error: "Admin account has no company assigned" });
    }

    // Validate role
    const validRoles = ["admin", "manager", "employee"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be admin, manager, or employee" });
    }

    const { data, error } =
      await supabase.auth.admin.inviteUserByEmail(email);

    if (error) throw error;

    // CRITICAL: Inherit company_id from admin, NEVER from request body
    await supabase.from("profiles").insert({
      id: data.user.id,
      email,
      role: role || "employee",
      company_id: adminProfile.company_id  // MULTI-TENANCY: Inherited from admin
    });

    res.json({ message: "Invite sent successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};