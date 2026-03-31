import { supabase } from "../config/supabaseClient.js";

/**
 * Payment Cycle Controller
 * Manages payment batches for approved expenses
 */

/**
 * Create a new payment cycle
 */
export const createPaymentCycle = async (req, res) => {
  try {
    const userId = req.user.id;
    const { process_date } = req.body;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!process_date) {
      return res.status(400).json({ error: "process_date is required" });
    }

    // Create payment cycle
    const { data: cycle, error } = await supabase
      .from("payment_cycles")
      .insert({
        company_id: profile.company_id,
        process_date: process_date,
        status: 'UPCOMING',
        total_amount: 0
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-queue approved expenses to this cycle
    const queueResult = await queueApprovedExpenses(cycle.id, profile.company_id);

    res.status(201).json({
      cycle,
      queued: queueResult,
      message: "Payment cycle created"
    });
  } catch (error) {
    console.error("Error creating payment cycle:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Queue approved expenses to a payment cycle
 */
async function queueApprovedExpenses(cycleId, companyId) {
  // Find approved expenses not yet in any cycle
  const { data: expenses, error: expError } = await supabase
    .from("expenses")
    .select("id, converted_amount")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .is("payment_cycle_id", null);

  if (expError) throw expError;

  if (expenses.length === 0) {
    return { count: 0, totalAmount: 0 };
  }

  // Update expenses with cycle id and status
  const expenseIds = expenses.map(e => e.id);
  const totalAmount = expenses.reduce((sum, e) => sum + (e.converted_amount || 0), 0);

  const { error: updateError } = await supabase
    .from("expenses")
    .update({ 
      payment_cycle_id: cycleId,
      status: 'PAYMENT_QUEUED'
    })
    .in("id", expenseIds);

  if (updateError) throw updateError;

  // Update cycle total
  await supabase
    .from("payment_cycles")
    .update({ total_amount: totalAmount })
    .eq("id", cycleId);

  return { 
    count: expenses.length, 
    totalAmount 
  };
}

/**
 * Get all payment cycles
 */
export const getPaymentCycles = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { data: cycles, error } = await supabase
      .from("payment_cycles")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("process_date", { ascending: false });

    if (error) throw error;

    // Get expense counts for each cycle
    const enrichedCycles = await Promise.all(
      cycles.map(async (cycle) => {
        const { count } = await supabase
          .from("expenses")
          .select("*", { count: 'exact', head: true })
          .eq("payment_cycle_id", cycle.id);

        return {
          ...cycle,
          expense_count: count || 0
        };
      })
    );

    res.json({ cycles: enrichedCycles });
  } catch (error) {
    console.error("Error getting payment cycles:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get payment cycle details with expenses
 */
export const getPaymentCycleDetails = async (req, res) => {
  try {
    const { cycleId } = req.params;
    const userId = req.user.id;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get cycle
    const { data: cycle, error: cycleError } = await supabase
      .from("payment_cycles")
      .select("*")
      .eq("id", cycleId)
      .eq("company_id", profile.company_id)
      .single();

    if (cycleError || !cycle) {
      return res.status(404).json({ error: "Payment cycle not found" });
    }

    // Get expenses in this cycle
    const { data: expenses, error: expError } = await supabase
      .from("expenses")
      .select(`
        id,
        description,
        amount,
        currency,
        converted_amount,
        category,
        expense_date,
        status,
        employee:employee_id(id, email)
      `)
      .eq("payment_cycle_id", cycleId)
      .order("created_at", { ascending: false });

    if (expError) throw expError;

    // Group by employee for summary
    const byEmployee = {};
    expenses.forEach(exp => {
      const email = exp.employee?.email || 'Unknown';
      if (!byEmployee[email]) {
        byEmployee[email] = { total: 0, count: 0, expenses: [] };
      }
      byEmployee[email].total += exp.converted_amount || 0;
      byEmployee[email].count += 1;
      byEmployee[email].expenses.push(exp);
    });

    res.json({
      cycle,
      expenses,
      summary: {
        total_amount: cycle.total_amount,
        expense_count: expenses.length,
        by_employee: byEmployee
      }
    });
  } catch (error) {
    console.error("Error getting payment cycle details:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Process payments - Mark cycle as completed and expenses as PAID
 */
export const processPayments = async (req, res) => {
  try {
    const { cycleId } = req.params;
    const userId = req.user.id;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get cycle
    const { data: cycle, error: cycleError } = await supabase
      .from("payment_cycles")
      .select("*")
      .eq("id", cycleId)
      .eq("company_id", profile.company_id)
      .single();

    if (cycleError || !cycle) {
      return res.status(404).json({ error: "Payment cycle not found" });
    }

    if (cycle.status === 'COMPLETED') {
      return res.status(400).json({ error: "Payment cycle already processed" });
    }

    // Update cycle status
    await supabase
      .from("payment_cycles")
      .update({ status: 'PROCESSING' })
      .eq("id", cycleId);

    // Mark all expenses in this cycle as PAID
    const { data: expenses, error: updateError } = await supabase
      .from("expenses")
      .update({ status: 'paid' })
      .eq("payment_cycle_id", cycleId)
      .select("id, employee_id, converted_amount");

    if (updateError) throw updateError;

    // Complete the cycle
    await supabase
      .from("payment_cycles")
      .update({ status: 'COMPLETED' })
      .eq("id", cycleId);

    // Create audit log
    await supabase
      .from("audit_logs")
      .insert({
        actor_id: userId,
        action: 'PAYMENT_PROCESSED',
        target_id: cycleId,
        target_type: 'PAYMENT_CYCLE',
        new_value: { 
          expenses_paid: expenses.length,
          total_amount: cycle.total_amount
        },
        company_id: profile.company_id
      });

    res.json({
      message: "Payments processed successfully",
      cycle_id: cycleId,
      expenses_paid: expenses.length,
      total_amount: cycle.total_amount
    });
  } catch (error) {
    console.error("Error processing payments:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add more expenses to an existing UPCOMING cycle
 */
export const addExpensesToCycle = async (req, res) => {
  try {
    const { cycleId } = req.params;
    const userId = req.user.id;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get cycle
    const { data: cycle, error: cycleError } = await supabase
      .from("payment_cycles")
      .select("*")
      .eq("id", cycleId)
      .eq("company_id", profile.company_id)
      .single();

    if (cycleError || !cycle) {
      return res.status(404).json({ error: "Payment cycle not found" });
    }

    if (cycle.status !== 'UPCOMING') {
      return res.status(400).json({ error: "Can only add expenses to UPCOMING cycles" });
    }

    const result = await queueApprovedExpenses(cycleId, profile.company_id);

    // Update cycle total
    const { data: totalData } = await supabase
      .from("expenses")
      .select("converted_amount")
      .eq("payment_cycle_id", cycleId);

    const newTotal = totalData.reduce((sum, e) => sum + (e.converted_amount || 0), 0);

    await supabase
      .from("payment_cycles")
      .update({ total_amount: newTotal })
      .eq("id", cycleId);

    res.json({
      message: `Added ${result.count} expenses to cycle`,
      added: result,
      new_total: newTotal
    });
  } catch (error) {
    console.error("Error adding expenses to cycle:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  createPaymentCycle,
  getPaymentCycles,
  getPaymentCycleDetails,
  processPayments,
  addExpensesToCycle
};
