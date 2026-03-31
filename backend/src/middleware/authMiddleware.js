import { supabase } from "../config/supabaseClient.js";

/**
 * Authenticate user via Supabase JWT and enrich req.user with profile data.
 *
 * After this middleware:
 *   req.user          — Supabase auth user object (id, email, user_metadata…)
 *   req.user.profile  — { id, role, company_id, email, full_name, job_title, manager_id }
 *
 * Any endpoint can read req.user.profile.company_id to scope queries.
 */
export const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Attach the raw auth user
    req.user = data.user;

    // ─── Enrich with profile data (company_id, role, etc.) ─────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, company_id, email, full_name, job_title, manager_id")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      // Profile may not exist yet during initial signup flow.
      // Allow the request to continue but mark profile as null.
      req.user.profile = null;
    } else {
      req.user.profile = profile;
    }

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};