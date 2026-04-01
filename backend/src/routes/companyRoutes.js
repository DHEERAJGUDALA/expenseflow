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

// CRITICAL: This is the "Default Company" UUID from database migration
// New admins get this by default due to column DEFAULT - we must NOT treat it as a real company
const DEFAULT_COMPANY_UUID = '00000000-0000-0000-0000-000000000001';

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
    const { organizationName, country, currencyCode, currencySymbol } = req.body;

    console.log("[CompanySetup] Request received:", { userId, organizationName, country, currencyCode });

    if (!organizationName) {
      return res.status(400).json({ error: "organizationName is required" });
    }

    // Check if user already has a REAL company (not the default placeholder)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    console.log("[CompanySetup] Existing profile:", existingProfile);

    // CRITICAL: Allow setup if user has NO company OR has the default placeholder company
    // The default company (00000000-...) is assigned by database DEFAULT, not a real company
    const hasRealCompany = existingProfile?.company_id && 
                           existingProfile.company_id !== DEFAULT_COMPANY_UUID;

    if (hasRealCompany) {
      console.log("[CompanySetup] User already has real company:", existingProfile.company_id);
      return res.status(400).json({ 
        error: "User already belongs to a company",
        company_id: existingProfile.company_id
      });
    }

    console.log("[CompanySetup] Creating company for user:", organizationName);

    // Create company and set up admin profile
    // Pass all currency parameters from frontend
    const result = await createCompanyOnSignup(
      userId, 
      userEmail, 
      organizationName, 
      country || 'India',
      currencyCode || 'INR',
      currencySymbol || '₹'
    );

    console.log("[CompanySetup] Company created successfully:", result.company?.name);

    res.status(201).json({
      message: "Company created successfully",
      company: result.company
    });
  } catch (error) {
    console.error("[CompanySetup] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
