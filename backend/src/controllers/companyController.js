import { supabase } from "../config/supabaseClient.js";
import { getCurrencySymbol } from "../services/currencyService.js";

/**
 * Company Controller
 * Handles company creation, setup, and management
 */

// Currency to country mapping (fallback if user data is missing)
const CURRENCY_COUNTRIES = {
  'INR': 'India',
  'USD': 'United States',
  'EUR': 'European Union',
  'GBP': 'United Kingdom',
  'AUD': 'Australia',
  'CAD': 'Canada',
  'SGD': 'Singapore',
  'AED': 'United Arab Emirates',
  'JPY': 'Japan',
  'CNY': 'China'
};

/**
 * Create company during admin signup
 * Called after first user signs up
 * Now accepts country, currency_code, and currency_symbol from user selection
 * CRITICAL: Prevents duplicate company names
 */
export const createCompanyOnSignup = async (userId, userEmail, organizationName, country = 'India', currencyCode = 'INR', currencySymbol = '₹') => {
  console.log("[createCompanyOnSignup] CALLED with:", { userId, userEmail, organizationName, country, currencyCode });
  
  try {
    // Validate currency code (default to INR if invalid)
    const validCurrencyCode = currencyCode?.toUpperCase() || 'INR';
    const validCurrencySymbol = currencySymbol || getCurrencySymbol(validCurrencyCode);
    const validCountry = country || CURRENCY_COUNTRIES[validCurrencyCode] || 'India';

    const companyName = organizationName || `${userEmail.split('@')[0]}'s Company`;
    console.log("[createCompanyOnSignup] Using company name:", companyName);

    // Check if company name already exists
    const { data: existingCompany, error: checkError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("name", companyName.trim())
      .single();

    let company;
    
    if (existingCompany) {
      console.log("[createCompanyOnSignup] Company already exists:", existingCompany);
      // Company exists - just assign user to it instead of failing
      // This handles the case where company was created but profile wasn't properly linked
      company = existingCompany;
      console.log("[createCompanyOnSignup] Will assign user to existing company:", company.id);
    } else {
      console.log("[createCompanyOnSignup] No duplicate, creating new company...");

      // Create company with full currency data
      const { data: newCompany, error: companyError } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          country: validCountry,
          currency: validCurrencyCode,        // Legacy column (kept for backward compatibility)
          currency_code: validCurrencyCode,   // New: 3-letter ISO code
          currency_symbol: validCurrencySymbol, // New: Display symbol
          stale_threshold_days: 3
        })
        .select()
        .single();

      if (companyError) {
        console.log("[createCompanyOnSignup] Company creation ERROR:", companyError);
        // Check if error is due to unique constraint violation (extra safety)
        if (companyError.code === '23505' || companyError.message?.includes('unique')) {
          const error = new Error(
            `A company with the name "${companyName}" already exists. ` +
            `Please contact your administrator for login credentials.`
          );
          error.code = 'DUPLICATE_COMPANY_NAME';
          throw error;
        }
        throw companyError;
      }

      company = newCompany;
      console.log("[createCompanyOnSignup] Company CREATED:", company);
    }

    // Create admin profile linked to company
    console.log("[createCompanyOnSignup] Creating/updating profile with company_id:", company.id);
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        email: userEmail,
        role: 'admin',
        company_id: company.id,
        job_title: 'Administrator'
      }, { onConflict: 'id' });

    if (profileError) {
      console.log("[createCompanyOnSignup] Profile upsert ERROR:", profileError);
      throw profileError;
    }

    console.log("[createCompanyOnSignup] Profile upsert SUCCESS for user:", userId);

    // Verify the profile was actually updated with the new company_id
    const { data: verifyProfile } = await supabase
      .from("profiles")
      .select("id, email, role, company_id")
      .eq("id", userId)
      .single();
    
    console.log("[createCompanyOnSignup] VERIFY profile after upsert:", verifyProfile);

    // Create audit log
    await supabase
      .from("audit_logs")
      .insert({
        actor_id: userId,
        action: 'USER_CREATED',
        target_id: company.id,
        target_type: 'COMPANY',
        new_value: { 
          company_name: company.name, 
          country: validCountry,
          currency_code: validCurrencyCode,
          currency_symbol: validCurrencySymbol
        },
        reason: 'Company created during admin signup',
        company_id: company.id
      });

    console.log("[createCompanyOnSignup] SUCCESS - returning company:", company.name);
    return { company, success: true };
  } catch (error) {
    console.error("[createCompanyOnSignup] EXCEPTION:", error);
    throw error;
  }
};

/**
 * Get company details
 */
export const getCompany = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return res.status(404).json({ error: "No company found for user" });
    }

    const { data: company, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .single();

    if (error) throw error;

    // Get company stats
    const [profilesResult, expensesResult] = await Promise.all([
      supabase.from("profiles").select("*", { count: 'exact', head: true }).eq("company_id", company.id),
      supabase.from("expenses").select("*", { count: 'exact', head: true }).eq("company_id", company.id)
    ]);

    // Ensure currency fields are present (for backward compatibility)
    const companyWithCurrency = {
      ...company,
      currency_code: company.currency_code || company.currency || 'INR',
      currency_symbol: company.currency_symbol || getCurrencySymbol(company.currency_code || company.currency || 'INR')
    };

    res.json({
      company: companyWithCurrency,
      stats: {
        totalUsers: profilesResult.count || 0,
        totalExpenses: expensesResult.count || 0
      }
    });
  } catch (error) {
    console.error("Error getting company:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update company settings (Admin only)
 * Note: Currency CANNOT be changed after creation
 */
export const updateCompany = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, stale_threshold_days } = req.body;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Build update object (currency intentionally excluded)
    const updateData = { updated_at: new Date().toISOString() };
    if (name) updateData.name = name;
    if (stale_threshold_days !== undefined) {
      updateData.stale_threshold_days = parseInt(stale_threshold_days);
    }

    const { data: company, error } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", profile.company_id)
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await supabase
      .from("audit_logs")
      .insert({
        actor_id: userId,
        action: 'SETTINGS_CHANGED',
        target_id: company.id,
        target_type: 'COMPANY',
        new_value: updateData,
        company_id: company.id
      });

    res.json({ 
      company,
      message: "Company settings updated" 
    });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available currencies for signup
 * Uses the currencyService for comprehensive list
 */
export const getAvailableCurrencies = async (req, res) => {
  const commonCurrencies = [
    { code: 'INR', country: 'India', symbol: '₹' },
    { code: 'USD', country: 'United States', symbol: '$' },
    { code: 'EUR', country: 'European Union', symbol: '€' },
    { code: 'GBP', country: 'United Kingdom', symbol: '£' },
    { code: 'AUD', country: 'Australia', symbol: 'A$' },
    { code: 'CAD', country: 'Canada', symbol: 'C$' },
    { code: 'SGD', country: 'Singapore', symbol: 'S$' },
    { code: 'AED', country: 'United Arab Emirates', symbol: 'د.إ' },
    { code: 'JPY', country: 'Japan', symbol: '¥' },
    { code: 'CNY', country: 'China', symbol: '¥' }
  ];
  
  res.json({ currencies: commonCurrencies });
};

export default {
  createCompanyOnSignup,
  getCompany,
  updateCompany,
  getAvailableCurrencies
};
