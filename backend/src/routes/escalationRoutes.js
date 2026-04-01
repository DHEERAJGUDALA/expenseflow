import express from "express";
import { 
  setManagerOnLeave, 
  removeManagerFromLeave,
  getEscalationStats 
} from "../services/escalationService.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

/**
 * POST /api/escalation/manager/:managerId/set-leave
 * Set manager on leave (auto-escalates all pending approvals)
 * Admin only
 */
router.post("/manager/:managerId/set-leave", authenticateUser, async (req, res) => {
  try {
    const { managerId } = req.params;
    const { leave_start_date, leave_end_date } = req.body;

    // Verify admin permission AND get company_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "Admin has no company assigned" });
    }

    // CRITICAL: Verify target manager belongs to same company
    const { data: targetManager, error: managerError } = await supabase
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", managerId)
      .single();

    if (managerError || !targetManager) {
      return res.status(404).json({ error: "Manager not found" });
    }

    if (targetManager.company_id !== profile.company_id) {
      return res.status(403).json({ error: "Cannot modify manager from different company" });
    }

    if (!["manager", "admin"].includes(targetManager.role)) {
      return res.status(400).json({ error: "Target user is not a manager or admin" });
    }

    // Validate dates
    if (!leave_start_date || !leave_end_date) {
      return res.status(400).json({ error: "Leave start and end dates are required" });
    }

    const startDate = new Date(leave_start_date);
    const endDate = new Date(leave_end_date);

    if (endDate <= startDate) {
      return res.status(400).json({ error: "End date must be after start date" });
    }

    // Set manager on leave (pass company_id for extra safety)
    const result = await setManagerOnLeave(managerId, startDate, endDate, profile.company_id);

    res.json({
      message: "Manager marked on leave successfully",
      ...result
    });
  } catch (error) {
    console.error("Error setting manager on leave:", error);
    res.status(500).json({ error: "Failed to set manager on leave" });
  }
});

/**
 * POST /api/escalation/manager/:managerId/remove-leave
 * Remove manager from leave status
 * Admin only
 */
router.post("/manager/:managerId/remove-leave", authenticateUser, async (req, res) => {
  try {
    const { managerId } = req.params;

    // Verify admin permission AND get company_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!profile.company_id) {
      return res.status(403).json({ error: "Admin has no company assigned" });
    }

    // CRITICAL: Verify target manager belongs to same company
    const { data: targetManager, error: managerError } = await supabase
      .from("profiles")
      .select("id, company_id")
      .eq("id", managerId)
      .single();

    if (managerError || !targetManager) {
      return res.status(404).json({ error: "Manager not found" });
    }

    if (targetManager.company_id !== profile.company_id) {
      return res.status(403).json({ error: "Cannot modify manager from different company" });
    }

    // Remove leave status (pass company_id for extra safety)
    const result = await removeManagerFromLeave(managerId, profile.company_id);

    res.json({
      message: "Manager leave status removed successfully",
      ...result
    });
  } catch (error) {
    console.error("Error removing manager from leave:", error);
    res.status(500).json({ error: "Failed to remove manager from leave" });
  }
});

/**
 * GET /api/escalation/stats
 * Get escalation statistics
 * Admin/Manager only
 */
router.get("/stats", authenticateUser, async (req, res) => {
  try {
    const companyId = req.user.profile?.company_id;

    if (!companyId) {
      return res.status(403).json({ error: "Company context required" });
    }

    // Verify permission
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!["admin", "manager"].includes(profile.role)) {
      return res.status(403).json({ error: "Manager or admin access required" });
    }

    // Get escalation stats
    const stats = await getEscalationStats(companyId);

    res.json(stats);
  } catch (error) {
    console.error("Error fetching escalation stats:", error);
    res.status(500).json({ error: "Failed to fetch escalation statistics" });
  }
});

/**
 * GET /api/escalation/managers-on-leave
 * Get list of managers currently on leave
 * Admin only
 */
router.get("/managers-on-leave", authenticateUser, async (req, res) => {
  try {
    const companyId = req.user.profile?.company_id;

    if (!companyId) {
      return res.status(403).json({ error: "Company context required" });
    }

    // Verify admin permission
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get managers on leave
    const { data: managers, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, on_leave, leave_start_date, leave_end_date")
      .eq("company_id", companyId)
      .eq("role", "manager")
      .eq("on_leave", true)
      .order("leave_end_date", { ascending: true });

    if (error) {
      console.error("Error fetching managers on leave:", error);
      return res.status(500).json({ error: "Failed to fetch managers on leave" });
    }

    res.json({ managers });
  } catch (error) {
    console.error("Error fetching managers on leave:", error);
    res.status(500).json({ error: "Failed to fetch managers on leave" });
  }
});

export default router;
