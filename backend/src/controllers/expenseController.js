import { supabase } from "../config/supabaseClient.js";

// Cache for exchange rates (expires after 1 hour)
let exchangeRateCache = {
  rates: {},
  timestamp: 0
};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Fetch exchange rates from API
 */
async function getExchangeRate(baseCurrency, targetCurrency) {
  try {
    // Check cache
    const now = Date.now();
    if (
      exchangeRateCache.rates[baseCurrency] && 
      now - exchangeRateCache.timestamp < CACHE_DURATION
    ) {
      return exchangeRateCache.rates[baseCurrency][targetCurrency] || 1;
    }

    // Fetch fresh rates
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`
    );
    
    if (!response.ok) {
      console.error("Exchange rate API error");
      return 1; // Default to 1:1 if API fails
    }

    const data = await response.json();
    
    // Update cache
    exchangeRateCache = {
      rates: { [baseCurrency]: data.rates },
      timestamp: now
    };

    return data.rates[targetCurrency] || 1;
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    return 1; // Default to 1:1 on error
  }
}

/**
 * Create a new expense
 * Supports OCR-populated data and currency conversion
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
      .select("id")
      .eq("id", userId)
      .single();

    if (!existingProfile) {
      // Create profile for this user
      const { error: createProfileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: userEmail,
          role: userRole
        });

      if (createProfileError) {
        console.error("Error creating profile:", createProfileError);
        return res.status(500).json({ 
          error: "Failed to create user profile. Please contact admin." 
        });
      }
    }

    // Create expense using the existing schema
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        amount: parseFloat(amount),
        category,
        description,
        expense_date: expense_date || new Date().toISOString().split("T")[0],
        paid_by: paid_by || merchant_name || null,
        remarks: remarks || ocr_raw_text || null,
        status: "pending"
      })
      .select()
      .single();

    if (expError) throw expError;

    res.status(201).json({
      expense,
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
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: expenses, error } = await query;

    if (error) throw error;

    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all expenses (Admin/Manager view with filters)
 */
export const getExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const userMetadataRole = req.user.user_metadata?.role;
    const { status, user_id, limit = 50, offset = 0 } = req.query;

    // Get current user's role from profile or metadata
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const userRole = currentUser?.role || userMetadataRole || "employee";

    // Build query
    let query = supabase
      .from("expenses")
      .select(`
        *,
        user:user_id (id, email, role)
      `)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // If not admin, only show own expenses or team expenses
    if (userRole === "employee") {
      query = query.eq("user_id", userId);
    } else if (userRole === "manager") {
      // Get team member IDs
      const { data: teamMembers } = await supabase
        .from("profiles")
        .select("id")
        .eq("manager_id", userId);
      
      const teamIds = teamMembers?.map(m => m.id) || [];
      teamIds.push(userId); // Include own expenses
      query = query.in("user_id", teamIds);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (user_id) {
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
 */
export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: expense, error } = await supabase
      .from("expenses")
      .select(`
        *,
        user:user_id (id, email, role, manager_id)
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json({ expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update expense (only pending expenses can be edited)
 */
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      amount,
      category,
      description,
      expense_date,
      paid_by,
      remarks
    } = req.body;

    // Get expense and verify ownership
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select("user_id, status")
      .eq("id", id)
      .single();

    if (expError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (expense.user_id !== userId) {
      return res.status(403).json({ error: "Cannot edit another user's expense" });
    }

    if (expense.status !== "pending") {
      return res.status(400).json({ 
        error: "Cannot edit expense that is already processed" 
      });
    }

    // Prepare update data
    const updateData = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (expense_date !== undefined) updateData.expense_date = expense_date;
    if (paid_by !== undefined) updateData.paid_by = paid_by;
    if (remarks !== undefined) updateData.remarks = remarks;

    const { data: updated, error } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ expense: updated, message: "Expense updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete expense (only pending expenses)
 */
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get expense and verify ownership
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select("user_id, status")
      .eq("id", id)
      .single();

    if (expError || !expense) {
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
      .eq("id", id);

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

    // Get user's role from profile or metadata
    const { data: currentUser } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const userRole = currentUser?.role || userMetadataRole || "employee";

    // Get expenses based on role
    let query = supabase
      .from("expenses")
      .select("status, amount, category");

    if (userRole === "employee") {
      query = query.eq("user_id", userId);
    }
    // Admin sees all, manager logic can be added

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
 */
export const getConversionRate = async (req, res) => {
  try {
    const { from, to, amount } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "from and to currencies are required" });
    }

    const rate = await getExchangeRate(from.toUpperCase(), to.toUpperCase());
    const convertedAmount = amount ? parseFloat((parseFloat(amount) * rate).toFixed(2)) : null;

    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      ...(amount && { 
        original_amount: parseFloat(amount),
        converted_amount: convertedAmount 
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
