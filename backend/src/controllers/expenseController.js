import { supabase } from "../config/supabaseClient.js";
import { matchRule, buildApprovalChain } from "../services/approvalEngine.js";
import { convertToBase, getExchangeRate, getCommonCurrencies, getCurrencySymbol } from "../services/currencyService.js";

/**
 * Create a new expense
 * Supports OCR-populated data and currency conversion
 * IMPORTANT: If exchange rate API is down, REJECT the submission
 */
export const createExpense = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userRole = req.user.user_metadata?.role || "employee";
    
    const {
      amount,
      currency_code,
      category,
      description,
      expense_date,
      merchant_name,
      receipt_url,
      ocr_raw_text,
      paid_by,
      remarks
    } = req.body;

    // Validate required fields
    if (!amount || !category || !description) {
      return res.status(400).json({ 
        error: "Amount, category, and description are required" 
      });
    }

    // Ensure user has a profile record (auto-create if missing)
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from("profiles")
      .select("id, company_id, role, manager_id")
      .eq("id", userId)
      .single();

    if (!existingProfile) {
      // Create profile for this user with default company
      const { error: createProfileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: userEmail,
          role: userRole,
          company_id: '00000000-0000-0000-0000-000000000001' // Default company
        });

      if (createProfileError) {
        console.error("Error creating profile:", createProfileError);
        return res.status(500).json({ 
          error: "Failed to create user profile. Please contact admin." 
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL: BLOCK ADMINS FROM SUBMITTING EXPENSES
    // ═══════════════════════════════════════════════════════════════════
    const userActualRole = existingProfile?.role || userRole;
    if (userActualRole === 'admin') {
      return res.status(403).json({
        error: "Admins cannot submit expenses",
        message: "Only employees and managers are allowed to submit expense reports.",
        allowed_roles: ["employee", "manager"]
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // MANAGERS CAN SUBMIT - Their expenses go to their manager or admin
    // ═══════════════════════════════════════════════════════════════════
    if (userActualRole === 'manager' && !existingProfile?.manager_id) {
      console.log(`[Expense] Manager ${userEmail} has no manager - expenses will need special approval rule`);
    }

    // Validate company_id exists
    if (!existingProfile?.company_id) {
      // Update profile with default company if missing
      await supabase
        .from("profiles")
        .update({ company_id: '00000000-0000-0000-0000-000000000001' })
        .eq("id", userId);
    }

    const companyId = existingProfile?.company_id || '00000000-0000-0000-0000-000000000001';

    // Get company currency (base currency)
    const { data: company } = await supabase
      .from("companies")
      .select("currency, currency_code, currency_symbol")
      .eq("id", companyId)
      .single();

    // Use currency_code if available, fallback to currency
    const companyCurrencyCode = company?.currency_code || company?.currency || 'INR';
    const companyCurrencySymbol = company?.currency_symbol || getCurrencySymbol(companyCurrencyCode);
    const expenseCurrency = (currency_code || 'INR').toUpperCase();
    const originalAmount = parseFloat(amount);

    // ═══════════════════════════════════════════════════════════════════
    // CURRENCY CONVERSION - CRITICAL SECTION
    // ═══════════════════════════════════════════════════════════════════
    // If expense currency differs from company base currency, convert it.
    // If the exchange rate API is down, REJECT the submission.
    // ═══════════════════════════════════════════════════════════════════
    
    let convertedAmount = originalAmount;
    let exchangeRateUsed = 1;
    let conversionTimestamp = new Date().toISOString();

    if (expenseCurrency !== companyCurrencyCode) {
      try {
        console.log(`[Expense] Converting ${originalAmount} ${expenseCurrency} to ${companyCurrencyCode}`);
        
        const conversionResult = await convertToBase(
          originalAmount, 
          expenseCurrency, 
          companyCurrencyCode
        );
        
        convertedAmount = conversionResult.convertedAmount;
        exchangeRateUsed = conversionResult.exchangeRate;
        conversionTimestamp = conversionResult.timestamp;
        
        console.log(`[Expense] Converted: ${convertedAmount} ${companyCurrencyCode} (rate: ${exchangeRateUsed})`);
      } catch (conversionError) {
        console.error("[Expense] Currency conversion failed:", conversionError);
        return res.status(503).json({
          error: "Currency conversion service is temporarily unavailable. Please try again later or submit in your company's base currency.",
          details: conversionError.message
        });
      }
    }

    // Create expense with full currency data
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,                        // Legacy: backward compatibility
        employee_id: userId,                     // Primary employee reference
        company_id: companyId,                   // Company reference
        
        // Original amount in employee's selected currency
        amount: originalAmount,                  // Legacy field (keep for compatibility)
        original_amount: originalAmount,         // New: Employee's entered amount
        original_currency: expenseCurrency,      // New: Employee's selected currency
        
        // Converted amount in company's base currency
        converted_amount: convertedAmount,       // New: Amount in company currency
        company_currency: companyCurrencyCode,   // New: Company's base currency
        
        // Exchange rate tracking (frozen at submission time)
        exchange_rate_used: exchangeRateUsed,    // New: Rate used for conversion
        conversion_timestamp: conversionTimestamp, // New: When conversion happened
        
        // Legacy currency field (for backward compatibility)
        currency: expenseCurrency,
        
        // Other expense details
        category,
        description,
        expense_date: expense_date || new Date().toISOString().split("T")[0],
        paid_by: paid_by || merchant_name || null,
        remarks: remarks || ocr_raw_text || null,
        status: "pending",
        current_step: 0                          // Workflow tracking
      })
      .select()
      .single();

    if (expError) throw expError;

    // ═══════════════════════════════════════════════════════════════
    // APPROVAL ENGINE — match rule and build chain
    // If either fails, rollback the expense and return the error
    // ═══════════════════════════════════════════════════════════════
    console.log(`[createExpense] Expense inserted: id=${expense.id}, category=${expense.category}, amount=${expense.converted_amount || expense.amount}`);
    console.log(`[createExpense] Calling matchRule with companyId=${companyId}...`);
    try {
      const rule = await matchRule(expense, companyId);
      console.log(`[createExpense] matchRule returned: rule="${rule.name}", id=${rule.id}`);
      
      console.log(`[createExpense] Calling buildApprovalChain...`);
      const chainResult = await buildApprovalChain(expense, rule, userId);
      console.log(`[createExpense] ✅ Approval chain built: ${chainResult.ruleApplied} (${chainResult.steps.length} steps)`);
    } catch (workflowError) {
      console.error(`[createExpense] ❌ APPROVAL ENGINE FAILED:`, workflowError.message);
      console.error(`[createExpense] ❌ Full error:`, workflowError);
      // Rollback: delete the expense
      console.log(`[createExpense] Rolling back expense ${expense.id}...`);
      const { error: deleteError } = await supabase.from("expenses").delete().eq("id", expense.id);
      if (deleteError) {
        console.error(`[createExpense] ❌ ROLLBACK ALSO FAILED:`, deleteError);
      } else {
        console.log(`[createExpense] ✅ Expense rolled back successfully`);
      }
      return res.status(400).json({
        error: workflowError.message,
        hint: "Contact your admin to configure approval rules for this category."
      });
    }

    res.status(201).json({
      expense: {
        ...expense,
        // Include formatted currency info in response
        display: {
          original: `${getCurrencySymbol(expenseCurrency)}${originalAmount.toFixed(2)} ${expenseCurrency}`,
          converted: `${companyCurrencySymbol}${convertedAmount.toFixed(2)} ${companyCurrencyCode}`,
          exchange_rate: exchangeRateUsed,
          same_currency: expenseCurrency === companyCurrencyCode
        }
      },
      message: "Expense submitted successfully"
    });
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get expenses for current user (Employee view)
 */
export const getMyExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, limit = 50, offset = 0 } = req.query;

    // Build query
    let query = supabase
      .from("expenses")
      .select(`
        *,
        payment_cycle:payment_cycle_id (id, process_date, status)
      `)
      .or(`user_id.eq.${userId},employee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: expenses, error } = await query;

    if (error) throw error;

    // For each expense, get the current approver info
    const expensesWithApprover = await Promise.all(
      expenses.map(async (expense) => {
        // Get current pending approver from expense_approval_steps
        const { data: pendingApprover } = await supabase
          .from("expense_approval_steps")
          .select(`
            approver_id,
            step_order,
            approver:approver_id (email, full_name, job_title)
          `)
          .eq("expense_id", expense.id)
          .eq("status", "PENDING")
          .order("step_order", { ascending: true })
          .limit(1)
          .single();

        return {
          ...expense,
          current_approver: pendingApprover ? {
            email: pendingApprover.approver?.email,
            name: pendingApprover.approver?.full_name || pendingApprover.approver?.email?.split('@')[0],
            job_title: pendingApprover.approver?.job_title,
            step: pendingApprover.step_order
          } : null
        };
      })
    );

    res.json({ expenses: expensesWithApprover });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all expenses (Admin/Manager view with filters)
 * CRITICAL: Only returns expenses from same company
 */
export const getExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;
    const { status, user_id, limit = 50, offset = 0 } = req.query;

    // Get current user's role AND company_id from profile
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (!currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    const userRole = currentUser?.role || userMetadataRole || "employee";

    // Build query with MANDATORY company_id filter
    let query = supabase
      .from("expenses")
      .select(`
        *,
        user:user_id (id, email, role)
      `)
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // If not admin, only show own expenses or team expenses
    if (userRole === "employee") {
      query = query.eq("user_id", userId);
    } else if (userRole === "manager") {
      // Get team member IDs (already scoped to company in employeeController)
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", userId)
        .eq("company_id", currentUser.company_id); // Extra safety
      
      const teamIds = teamMembers?.map(m => m.id) || [];
      teamIds.push(userId); // Include own expenses
      query = query.in("user_id", teamIds);
    }

    if (status) {
      query = query.eq("status", status);
    }

    // If filtering by user_id, verify that user is in same company
    if (user_id) {
      const { data: targetUser } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user_id)
        .single();

      if (targetUser?.company_id !== currentUser.company_id) {
        return res.status(403).json({ error: "Cannot view expenses from different company" });
      }

      query = query.eq("user_id", user_id);
    }

    const { data: expenses, error } = await query;

    if (error) throw error;

    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get single expense by ID
 * CRITICAL: Only returns expense if it belongs to user's company
 */
export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get current user's company_id
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    const { data: expense, error } = await supabase
      .from("expenses")
      .select(`
        *,
        user:user_id (id, email, role, manager_id),
        employee:employee_id (id, email, role, job_title, manager_id),
        payment_cycle:payment_cycle_id (id, process_date, status),
        rule:applied_rule_id (id, name, specific_approver_id, min_approval_percentage)
      `)
      .eq("id", id)
      .eq("company_id", currentUser.company_id) // MULTI-TENANCY FILTER
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: "Expense not found or not in your company" });
      }
      throw error;
    }

    if (!expense) {
      return res.status(404).json({ error: "Expense not found or not in your company" });
    }

    // Get approval steps from expense_approval_steps (the new table)
    const { data: approvalSteps, error: stepsError } = await supabase
      .from("expense_approval_steps")
      .select(`
        id,
        approver_id,
        step_order,
        status,
        comment,
        actioned_at,
        created_at,
        approver:approver_id (id, email, full_name, job_title, role)
      `)
      .eq("expense_id", id)
      .order("step_order", { ascending: true });

    if (stepsError) throw stepsError;

    // Map steps to response shape
    const steps = (approvalSteps || []).map(s => ({
      step: s.step_order,
      approver: {
        id: s.approver_id,
        email: s.approver?.email,
        name: s.approver?.full_name || s.approver?.email?.split('@')[0],
        job_title: s.approver?.job_title || s.approver?.role
      },
      status: s.status?.toLowerCase(),
      comment: s.comment,
      actioned_at: s.actioned_at,
      created_at: s.created_at
    }));

    // Get special approver info if rule has one
    let specialApprover = null;
    if (expense.rule?.specific_approver_id) {
      const { data: spApprover } = await supabase
        .from("profiles")
        .select("id, email, full_name, job_title, role")
        .eq("id", expense.rule.specific_approver_id)
        .single();

      if (spApprover) {
        specialApprover = {
          id: spApprover.id,
          name: spApprover.full_name || spApprover.email?.split('@')[0],
          email: spApprover.email,
          job_title: spApprover.job_title || 'Special Approver',
        };
      }
    }

    // Find current approver
    const currentApprover = steps.find(s => s.status === 'pending');

    res.json({
      expense,
      approval_chain: {
        steps,
        special_approver: specialApprover,
        current_approver: currentApprover || null,
        applied_rule_name: expense.rule?.name || null,
        summary: {
          total_steps: steps.length,
          completed_steps: steps.filter(s => s.status === 'approved').length,
          has_special_approver: !!specialApprover
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * UPDATE EXPENSE — DISABLED
 * Expenses are fully locked after submission per spec.
 * Employee must delete and resubmit if changes are needed.
 */
export const updateExpense = async (req, res) => {
  return res.status(403).json({
    error: "Expenses cannot be edited after submission",
    hint: "Delete this expense and submit a new one if changes are needed."
  });
};

/**
 * Delete expense (only pending expenses)
 */
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const companyId = req.user.profile?.company_id;

    if (!companyId) {
      return res.status(403).json({ error: "Company context required" });
    }

    // Get expense and verify ownership AND company isolation
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select("user_id, status, company_id")
      .eq("id", id)
      .single();

    if (expError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // MULTI-TENANCY: Verify expense belongs to user's company
    if (expense.company_id !== companyId) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (expense.user_id !== userId) {
      return res.status(403).json({ error: "Cannot delete another user's expense" });
    }

    if (expense.status !== "pending") {
      return res.status(400).json({ 
        error: "Can only delete pending expenses" 
      });
    }

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId); // Double-check company isolation

    if (error) throw error;

    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get expense statistics/summary
 */
export const getExpenseStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;
    const companyId = req.user.profile?.company_id;

    if (!companyId) {
      return res.status(403).json({ error: "Company context required" });
    }

    // Get user's role from profile or metadata
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const userRole = currentUser?.role || userMetadataRole || "employee";

    // Get expenses based on role - ALWAYS filter by company_id for multi-tenancy
    let query = supabase
      .from("expenses")
      .select("status, amount, category")
      .eq("company_id", companyId); // MULTI-TENANCY: Always filter by company

    if (userRole === "employee") {
      query = query.eq("user_id", userId);
    }
    // Admin/manager sees all expenses within their company only

    const { data: expenses, error } = await query;

    if (error) throw error;

    // Calculate stats
    const stats = {
      total_count: expenses.length,
      by_status: {},
      by_category: {},
      total_amount: 0,
      pending_amount: 0,
      approved_amount: 0,
      currency: "INR" // Default currency
    };

    for (const exp of expenses) {
      // By status
      stats.by_status[exp.status] = (stats.by_status[exp.status] || 0) + 1;
      
      // By category
      stats.by_category[exp.category] = (stats.by_category[exp.category] || 0) + 1;
      
      // Amounts
      const amount = parseFloat(exp.amount) || 0;
      stats.total_amount += amount;
      
      if (exp.status === "pending") {
        stats.pending_amount += amount;
      } else if (exp.status === "approved") {
        stats.approved_amount += amount;
      }
    }

    // Round amounts
    stats.total_amount = parseFloat(stats.total_amount.toFixed(2));
    stats.pending_amount = parseFloat(stats.pending_amount.toFixed(2));
    stats.approved_amount = parseFloat(stats.approved_amount.toFixed(2));

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get exchange rate between two currencies
 * Uses the centralized currencyService
 */
export const getConversionRate = async (req, res) => {
  try {
    const { from, to, amount } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to currencies are required" });
    }

    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();

    // Use centralized currency service
    const rate = await getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = amount ? parseFloat((parseFloat(amount) * rate).toFixed(2)) : null;

    res.json({
      from: fromCurrency,
      to: toCurrency,
      rate,
      from_symbol: getCurrencySymbol(fromCurrency),
      to_symbol: getCurrencySymbol(toCurrency),
      ...(amount && { 
        original_amount: parseFloat(amount),
        converted_amount: convertedAmount 
      })
    });
  } catch (err) {
    console.error("Error getting conversion rate:", err);
    res.status(503).json({ 
      error: "Currency conversion service is temporarily unavailable",
      details: err.message 
    });
  }
};

/**
 * Get available currencies for expense form dropdown
 */
export const getAvailableCurrencies = async (req, res) => {
  try {
    const currencies = getCommonCurrencies();
    res.json({ currencies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get team expenses (Manager view)
 * Returns all expenses from direct reports with filters
 * CRITICAL: Scoped to user's company for multi-tenancy
 */
export const getTeamExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, category, from_date, to_date, limit = 50, offset = 0 } = req.query;

    // Get current user's profile with company_id
    const { data: currentUser, error: userError } = await supabase
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .single();

    if (userError || !currentUser) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!currentUser.company_id) {
      return res.status(403).json({ error: "No company assigned to your account" });
    }

    // Get team members who report to this manager AND are in same company
    const { data: teamMembers, error: teamError } = await supabase
      .from("profiles")
      .select("id, email, job_title")
      .eq("manager_id", userId)
      .eq("company_id", currentUser.company_id);  // MULTI-TENANCY FILTER

    if (teamError) throw teamError;

    if (!teamMembers || teamMembers.length === 0) {
      return res.json({ 
        expenses: [],
        team_members: [],
        message: "No direct reports found"
      });
    }

    const teamIds = teamMembers.map(m => m.id);

    // Build query for team expenses - CRITICAL: Filter by company_id
    let query = supabase
      .from("expenses")
      .select(`
        *,
        employee:employee_id (id, email, job_title)
      `)
      .in("employee_id", teamIds)
      .eq("company_id", currentUser.company_id)  // MULTI-TENANCY FILTER
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (from_date) {
      query = query.gte("expense_date", from_date);
    }
    if (to_date) {
      query = query.lte("expense_date", to_date);
    }

    const { data: expenses, error } = await query;

    if (error) throw error;

    // Get total count - CRITICAL: Filter by company_id
    let countQuery = supabase
      .from("expenses")
      .select("*", { count: 'exact', head: true })
      .in("employee_id", teamIds)
      .eq("company_id", currentUser.company_id);  // MULTI-TENANCY FILTER

    if (status) countQuery = countQuery.eq("status", status);
    if (category) countQuery = countQuery.eq("category", category);

    const { count } = await countQuery;

    res.json({
      expenses: expenses.map(exp => ({
        ...exp,
        employee_name: exp.employee?.email?.split('@')[0],
        employee_email: exp.employee?.email,
        employee_job_title: exp.employee?.job_title
      })),
      team_members: teamMembers,
      pagination: {
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error("Error getting team expenses:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get categories used in approval rules for the user's company
 */
export const getCategories = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      // Return default categories if no company
      return res.json({
        categories: [
          { value: "meals", label: "Meals & Food" },
          { value: "travel", label: "Travel" },
          { value: "accommodation", label: "Accommodation" },
          { value: "transport", label: "Transport" },
          { value: "office_supplies", label: "Office Supplies" },
          { value: "entertainment", label: "Entertainment" },
          { value: "communication", label: "Communication" },
          { value: "software", label: "Software & Subscriptions" },
          { value: "equipment", label: "Equipment" },
          { value: "other", label: "Other" }
        ]
      });
    }

    // Get categories from approval rules
    const { data: rules } = await supabase
      .from("approval_rules")
      .select("category")
      .eq("company_id", profile.company_id)
      .not("category", "is", null);

    const ruleCategories = rules?.map(r => r.category).filter(Boolean) || [];

    // Combine with default categories
    const defaultCategories = [
      { value: "meals", label: "Meals & Food" },
      { value: "travel", label: "Travel" },
      { value: "accommodation", label: "Accommodation" },
      { value: "transport", label: "Transport" },
      { value: "office_supplies", label: "Office Supplies" },
      { value: "entertainment", label: "Entertainment" },
      { value: "communication", label: "Communication" },
      { value: "software", label: "Software & Subscriptions" },
      { value: "equipment", label: "Equipment" },
      { value: "other", label: "Other" }
    ];

    // Add any custom categories from rules that aren't in defaults
    const categoryValues = new Set(defaultCategories.map(c => c.value));
    ruleCategories.forEach(cat => {
      if (!categoryValues.has(cat)) {
        defaultCategories.push({
          value: cat,
          label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')
        });
      }
    });

    res.json({ categories: defaultCategories });
  } catch (err) {
    console.error("Error getting categories:", err);
    res.status(500).json({ error: err.message });
  }
};
