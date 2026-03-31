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
    const {
      amount,
      currency_code,
      category,
      description,
      expense_date,
      merchant_name,
      receipt_url,
      ocr_raw_text,
      line_items // Array of { description, amount, quantity }
    } = req.body;

    // Validate required fields
    if (!amount || !category) {
      return res.status(400).json({ 
        error: "Amount and category are required" 
      });
    }

    // Get employee and company info
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select(`
        id,
        company_id,
        company:company_id (currency_code)
      `)
      .eq("user_id", userId)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    const expenseCurrency = currency_code || "USD";
    const companyCurrency = employee.company?.currency_code || "USD";

    // Convert amount to company currency
    let convertedAmount = amount;
    if (expenseCurrency !== companyCurrency) {
      const rate = await getExchangeRate(expenseCurrency, companyCurrency);
      convertedAmount = parseFloat((amount * rate).toFixed(2));
    }

    // Create expense
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .insert({
        employee_id: employee.id,
        company_id: employee.company_id,
        amount: parseFloat(amount),
        currency_code: expenseCurrency,
        converted_amount: convertedAmount,
        company_currency_code: companyCurrency,
        category,
        description: description || null,
        expense_date: expense_date || new Date().toISOString().split("T")[0],
        merchant_name: merchant_name || null,
        receipt_url: receipt_url || null,
        ocr_raw_text: ocr_raw_text || null,
        status: "pending"
      })
      .select()
      .single();

    if (expError) throw expError;

    // Create expense line items if provided
    if (line_items && line_items.length > 0) {
      const lineItemsData = line_items.map(item => ({
        expense_id: expense.id,
        description: item.description,
        amount: parseFloat(item.amount),
        quantity: item.quantity || 1
      }));

      const { error: lineError } = await supabase
        .from("expense_lines")
        .insert(lineItemsData);

      if (lineError) {
        console.error("Error creating line items:", lineError);
        // Don't fail the whole request for line items
      }
    }

    res.status(201).json({
      expense,
      message: "Expense submitted successfully",
      conversion: expenseCurrency !== companyCurrency ? {
        original: { amount, currency: expenseCurrency },
        converted: { amount: convertedAmount, currency: companyCurrency }
      } : null
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

    // Get employee ID
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    // Build query
    let query = supabase
      .from("expenses")
      .select(`
        *,
        expense_lines (*)
      `)
      .eq("employee_id", employee.id)
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
 * Get all expenses (Admin view with filters)
 */
export const getExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, employee_id, limit = 50, offset = 0 } = req.query;

    // Get current user's company and role
    const { data: currentEmployee, error: empError } = await supabase
      .from("employees")
      .select("company_id, role")
      .eq("user_id", userId)
      .single();

    if (empError || !currentEmployee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    // Build query
    let query = supabase
      .from("expenses")
      .select(`
        *,
        employee:employee_id (id, full_name, email, department),
        expense_lines (*)
      `)
      .eq("company_id", currentEmployee.company_id)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
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
        employee:employee_id (id, full_name, email, department, manager_id),
        expense_lines (*)
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
 * Update expense (only draft expenses can be edited)
 */
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      amount,
      currency_code,
      category,
      description,
      expense_date,
      merchant_name,
      receipt_url
    } = req.body;

    // Get expense and verify ownership
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select(`
        *,
        employee:employee_id (user_id, company:company_id (currency_code))
      `)
      .eq("id", id)
      .single();

    if (expError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (expense.employee.user_id !== userId) {
      return res.status(403).json({ error: "Cannot edit another user's expense" });
    }

    if (expense.status !== "draft" && expense.status !== "pending") {
      return res.status(400).json({ 
        error: "Cannot edit expense that is already being processed" 
      });
    }

    // Prepare update data
    const updateData = { updated_at: new Date().toISOString() };

    if (amount !== undefined) {
      updateData.amount = parseFloat(amount);
      const expenseCurrency = currency_code || expense.currency_code;
      const companyCurrency = expense.employee.company?.currency_code || "USD";
      
      if (expenseCurrency !== companyCurrency) {
        const rate = await getExchangeRate(expenseCurrency, companyCurrency);
        updateData.converted_amount = parseFloat((amount * rate).toFixed(2));
      } else {
        updateData.converted_amount = parseFloat(amount);
      }
    }

    if (currency_code !== undefined) updateData.currency_code = currency_code;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (expense_date !== undefined) updateData.expense_date = expense_date;
    if (merchant_name !== undefined) updateData.merchant_name = merchant_name;
    if (receipt_url !== undefined) updateData.receipt_url = receipt_url;

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
 * Delete expense (only draft expenses)
 */
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get expense and verify ownership
    const { data: expense, error: expError } = await supabase
      .from("expenses")
      .select("employee:employee_id (user_id), status")
      .eq("id", id)
      .single();

    if (expError || !expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (expense.employee.user_id !== userId) {
      return res.status(403).json({ error: "Cannot delete another user's expense" });
    }

    if (expense.status !== "draft") {
      return res.status(400).json({ 
        error: "Can only delete draft expenses" 
      });
    }

    // Delete expense (cascade will handle line items)
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

    // Get employee info
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, company_id, role")
      .eq("user_id", userId)
      .single();

    if (empError || !employee) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    // Get expenses based on role
    let query = supabase
      .from("expenses")
      .select("status, converted_amount, company_currency_code, category");

    if (employee.role === "employee") {
      query = query.eq("employee_id", employee.id);
    } else {
      query = query.eq("company_id", employee.company_id);
    }

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
      currency: expenses[0]?.company_currency_code || "USD"
    };

    for (const exp of expenses) {
      // By status
      stats.by_status[exp.status] = (stats.by_status[exp.status] || 0) + 1;
      
      // By category
      stats.by_category[exp.category] = (stats.by_category[exp.category] || 0) + 1;
      
      // Amounts
      const amount = exp.converted_amount || 0;
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
