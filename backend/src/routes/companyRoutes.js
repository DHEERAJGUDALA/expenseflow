import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import {
  getCompany,
  updateCompany,
  getAvailableCurrencies,
  createCompanyOnSignup
} from "../controllers/companyController.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

/**
 * GET /api/companies/currencies
 * Get list of available currencies for signup
 * Public endpoint - no auth required
 */
router.get("/currencies", getAvailableCurrencies);

/**
 * GET /api/companies/me
 * Get current user's company details with stats
 * Requires authentication
 */
router.get("/me", authenticateUser, getCompany);

/**
 * PUT /api/companies/me
 * Update company settings (Admin only)
 * Note: Currency cannot be changed after creation
 */
router.put("/me", authenticateUser, updateCompany);

/**
 * POST /api/companies/setup
 * Create company during admin signup
 * Called after user signs up but before profile is fully set up
 * Requires authentication
 */
router.post("/setup", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { organizationName, currency } = req.body;

    if (!organizationName) {
      return res.status(400).json({ error: "organizationName is required" });
    }

    // Check if user already has a company
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (existingProfile?.company_id) {
      return res.status(400).json({ 
        error: "User already belongs to a company",
        company_id: existingProfile.company_id
      });
    }

    // Create company and set up admin profile
    const result = await createCompanyOnSignup(userId, userEmail, organizationName, currency);

    res.status(201).json({
      message: "Company created successfully",
      company: result.company
    });
  } catch (error) {
    console.error("Error in company setup:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
