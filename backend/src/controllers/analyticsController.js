import { supabase } from "../config/supabaseClient.js";

/**
 * Analytics Controller
 * Provides spending trends, bottleneck detection, and approval metrics
 */

/**
 * Get spending trends - Monthly spending by category
 */
export const getSpendingTrends = async (req, res) => {
  try {
    const userId = req.user.id;
    const { months = 6 } = req.query;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    // Get all expenses in date range
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("amount, converted_amount, category, expense_date, status, currency")
      .eq("company_id", profile.company_id)
      .gte("expense_date", startDate.toISOString().split('T')[0])
      .lte("expense_date", endDate.toISOString().split('T')[0]);

    if (error) throw error;

    // Aggregate by month and category
    const monthlyData = {};
    const categoryData = {};
    const statusData = { pending: 0, approved: 0, rejected: 0, paid: 0 };

    expenses.forEach(exp => {
      const monthKey = exp.expense_date.substring(0, 7); // YYYY-MM
      const amount = exp.converted_amount || exp.amount || 0;
      const category = exp.category || 'Other';

      // Monthly totals
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, count: 0, categories: {} };
      }
      monthlyData[monthKey].total += amount;
      monthlyData[monthKey].count += 1;
      
      // Monthly by category
      if (!monthlyData[monthKey].categories[category]) {
        monthlyData[monthKey].categories[category] = 0;
      }
      monthlyData[monthKey].categories[category] += amount;

      // Overall category totals
      if (!categoryData[category]) {
        categoryData[category] = { total: 0, count: 0 };
      }
      categoryData[category].total += amount;
      categoryData[category].count += 1;

      // Status breakdown
      const status = exp.status?.toLowerCase() || 'pending';
      if (statusData.hasOwnProperty(status)) {
        statusData[status] += amount;
      }
    });

    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyData).sort();
    const monthlyTrend = sortedMonths.map(month => ({
      month,
      ...monthlyData[month]
    }));

    // Calculate growth rate
    let growthRate = null;
    if (monthlyTrend.length >= 2) {
      const lastMonth = monthlyTrend[monthlyTrend.length - 1].total;
      const prevMonth = monthlyTrend[monthlyTrend.length - 2].total;
      if (prevMonth > 0) {
        growthRate = ((lastMonth - prevMonth) / prevMonth * 100).toFixed(1);
      }
    }

    res.json({
      trends: {
        monthly: monthlyTrend,
        byCategory: categoryData,
        byStatus: statusData
      },
      summary: {
        totalExpenses: expenses.length,
        totalAmount: expenses.reduce((sum, e) => sum + (e.converted_amount || e.amount || 0), 0),
        averageExpense: expenses.length > 0 
          ? (expenses.reduce((sum, e) => sum + (e.converted_amount || e.amount || 0), 0) / expenses.length).toFixed(2)
          : 0,
        growthRate,
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        }
      }
    });
  } catch (error) {
    console.error("Error getting spending trends:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get bottleneck report - Find stale expenses and approval delays
 */
export const getBottleneckReport = async (req, res) => {
  try {
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

    // Get company's stale threshold
    const { data: company } = await supabase
      .from("companies")
      .select("stale_threshold_days")
      .eq("id", profile.company_id)
      .single();

    const staleThreshold = company?.stale_threshold_days || 3;
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleThreshold);

    // Find stale expenses (pending for too long)
    const { data: staleExpenses, error: staleError } = await supabase
      .from("expenses")
      .select(`
        id,
        description,
        amount,
        converted_amount,
        currency,
        category,
        created_at,
        current_step,
        status,
        employee:employee_id(id, email)
      `)
      .eq("company_id", profile.company_id)
      .in("status", ["pending", "pending_approval"])
      .lt("created_at", staleDate.toISOString())
      .order("created_at", { ascending: true });

    if (staleError) throw staleError;

    // Calculate days stale for each expense
    const now = new Date();
    const staleExpensesWithDays = staleExpenses.map(exp => {
      const createdAt = new Date(exp.created_at);
      const daysStale = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      return {
        ...exp,
        days_stale: daysStale,
        days_over_threshold: daysStale - staleThreshold
      };
    });

    // Find pending approvals - which approvers are holding things up
    // FIXED: Use correct column names (action, step_order instead of status, step_index)
    // MULTI-TENANCY: Filter approval_logs by expenses belonging to this company
    const { data: pendingApprovals, error: approvalError } = await supabase
      .from("approval_logs")
      .select(`
        id,
        expense_id,
        step_order,
        approver_id,
        action,
        created_at,
        approver:approver_id(id, email),
        expense:expense_id(company_id)
      `)
      .eq("action", "PENDING")
      .eq("expense.company_id", profile.company_id)
      .order("created_at", { ascending: true });

    if (approvalError) throw approvalError;

    // Group pending approvals by approver
    const approverBacklog = {};
    pendingApprovals.forEach(approval => {
      const email = approval.approver?.email || approval.approver_id;
      if (!approverBacklog[email]) {
        approverBacklog[email] = { count: 0, oldest: null, approver_id: approval.approver_id };
      }
      approverBacklog[email].count += 1;
      const createdAt = new Date(approval.created_at);
      if (!approverBacklog[email].oldest || createdAt < new Date(approverBacklog[email].oldest)) {
        approverBacklog[email].oldest = approval.created_at;
      }
    });

    // Calculate average time per approver
    const approverStats = Object.entries(approverBacklog).map(([email, data]) => {
      const oldestDate = new Date(data.oldest);
      const daysWaiting = Math.floor((now - oldestDate) / (1000 * 60 * 60 * 24));
      return {
        approver_email: email,
        approver_id: data.approver_id,
        pending_count: data.count,
        oldest_pending: data.oldest,
        days_waiting: daysWaiting
      };
    }).sort((a, b) => b.pending_count - a.pending_count);

    res.json({
      stale_threshold_days: staleThreshold,
      bottlenecks: {
        stale_expenses: {
          count: staleExpensesWithDays.length,
          total_amount: staleExpensesWithDays.reduce((sum, e) => sum + (e.converted_amount || e.amount || 0), 0),
          expenses: staleExpensesWithDays
        },
        approver_backlog: {
          count: approverStats.length,
          approvers: approverStats
        }
      },
      recommendations: generateRecommendations(staleExpensesWithDays, approverStats, staleThreshold)
    });
  } catch (error) {
    console.error("Error getting bottleneck report:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate actionable recommendations based on bottlenecks
 */
function generateRecommendations(staleExpenses, approverStats, threshold) {
  const recommendations = [];

  if (staleExpenses.length > 5) {
    recommendations.push({
      type: "high_stale_count",
      severity: "high",
      message: `${staleExpenses.length} expenses are stale (> ${threshold} days). Consider reviewing approval workflow efficiency.`
    });
  }

  const overloadedApprovers = approverStats.filter(a => a.pending_count > 5);
  if (overloadedApprovers.length > 0) {
    recommendations.push({
      type: "approver_overload",
      severity: "medium",
      message: `${overloadedApprovers.length} approver(s) have more than 5 pending approvals. Consider redistributing workload or adding parallel approvers.`,
      approvers: overloadedApprovers.map(a => a.approver_email)
    });
  }

  const veryOld = staleExpenses.filter(e => e.days_stale > threshold * 3);
  if (veryOld.length > 0) {
    recommendations.push({
      type: "critical_delay",
      severity: "critical",
      message: `${veryOld.length} expense(s) are ${threshold * 3}+ days old. Consider admin override to unblock.`,
      expense_ids: veryOld.map(e => e.id)
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: "healthy",
      severity: "low",
      message: "No significant bottlenecks detected. Approval workflow is running smoothly."
    });
  }

  return recommendations;
}

/**
 * Get approval metrics - Average approval time, rejection rates, etc.
 */
export const getApprovalMetrics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get approval logs in date range - MULTI-TENANCY: Filter by company via expense relation
    const { data: approvalLogs, error: logsError } = await supabase
      .from("approval_logs")
      .select("*, expense:expense_id(company_id)")
      .gte("created_at", startDate.toISOString())
      .eq("expense.company_id", profile.company_id);

    if (logsError) throw logsError;

    // Calculate metrics
    // FIXED: Use correct column name 'action' instead of 'status', uppercase enum values
    const completed = approvalLogs.filter(l => ['APPROVED', 'REJECTED'].includes(l.action));
    const approved = approvalLogs.filter(l => l.action === 'APPROVED');
    const rejected = approvalLogs.filter(l => l.action === 'REJECTED');
    const pending = approvalLogs.filter(l => l.action === 'PENDING');

    // Calculate average approval time for completed approvals
    // FIXED: Use 'updated_at' instead of 'decided_at'
    let avgApprovalTimeHours = null;
    const completedWithTime = completed.filter(l => l.updated_at);
    if (completedWithTime.length > 0) {
      const totalTime = completedWithTime.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const decided = new Date(l.updated_at);
        return sum + (decided - created);
      }, 0);
      avgApprovalTimeHours = (totalTime / completedWithTime.length / (1000 * 60 * 60)).toFixed(1);
    }

    // Group by approver
    const approverMetrics = {};
    completed.forEach(log => {
      const approverId = log.approver_id;
      if (!approverMetrics[approverId]) {
        approverMetrics[approverId] = { approved: 0, rejected: 0, total: 0 };
      }
      approverMetrics[approverId].total += 1;
      if (log.action === 'APPROVED') {
        approverMetrics[approverId].approved += 1;
      } else {
        approverMetrics[approverId].rejected += 1;
      }
    });

    // Get approver emails
    const approverIds = Object.keys(approverMetrics);
    const { data: approverProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", approverIds);

    const approverEmailMap = {};
    approverProfiles?.forEach(p => {
      approverEmailMap[p.id] = p.email;
    });

    const approverStats = Object.entries(approverMetrics).map(([id, metrics]) => ({
      approver_id: id,
      approver_email: approverEmailMap[id] || id,
      ...metrics,
      approval_rate: metrics.total > 0 ? ((metrics.approved / metrics.total) * 100).toFixed(1) : 0
    }));

    res.json({
      period: {
        start: startDate.toISOString().split('T')[0],
        days: parseInt(days)
      },
      metrics: {
        total_decisions: completed.length,
        approved: approved.length,
        rejected: rejected.length,
        pending: pending.length,
        approval_rate: completed.length > 0 ? ((approved.length / completed.length) * 100).toFixed(1) : 0,
        rejection_rate: completed.length > 0 ? ((rejected.length / completed.length) * 100).toFixed(1) : 0,
        avg_approval_time_hours: avgApprovalTimeHours
      },
      by_approver: approverStats.sort((a, b) => b.total - a.total)
    });
  } catch (error) {
    console.error("Error getting approval metrics:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get dashboard summary - All key metrics in one call
 */
export const getDashboardSummary = async (req, res) => {
  try {
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

    const companyId = profile.company_id;

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    // Get counts in parallel
    const [
      profilesResult,
      expensesResult,
      pendingResult,
      approvedResult,
      rulesResult,
      cyclesResult
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: 'exact', head: true }).eq("company_id", companyId),
      supabase.from("expenses").select("*", { count: 'exact', head: true }).eq("company_id", companyId),
      supabase.from("expenses").select("*", { count: 'exact', head: true }).eq("company_id", companyId).in("status", ["pending", "pending_approval"]),
      supabase.from("expenses").select("*", { count: 'exact', head: true }).eq("company_id", companyId).eq("status", "approved"),
      supabase.from("approval_rules").select("*", { count: 'exact', head: true }).eq("company_id", companyId),
      supabase.from("payment_cycles").select("*", { count: 'exact', head: true }).eq("company_id", companyId).eq("status", "UPCOMING")
    ]);

    // Get total amounts
    const { data: amountData } = await supabase
      .from("expenses")
      .select("converted_amount, status")
      .eq("company_id", companyId);

    const totalPending = amountData
      ?.filter(e => ['pending', 'pending_approval'].includes(e.status))
      .reduce((sum, e) => sum + (e.converted_amount || 0), 0) || 0;

    const totalApproved = amountData
      ?.filter(e => e.status === 'approved')
      .reduce((sum, e) => sum + (e.converted_amount || 0), 0) || 0;

    res.json({
      company: {
        name: company?.name,
        currency: company?.currency,
        stale_threshold_days: company?.stale_threshold_days
      },
      counts: {
        total_users: profilesResult.count || 0,
        total_expenses: expensesResult.count || 0,
        pending_expenses: pendingResult.count || 0,
        approved_expenses: approvedResult.count || 0,
        approval_rules: rulesResult.count || 0,
        upcoming_payment_cycles: cyclesResult.count || 0
      },
      amounts: {
        pending: totalPending,
        approved_awaiting_payment: totalApproved,
        currency: company?.currency || 'INR'
      }
    });
  } catch (error) {
    console.error("Error getting dashboard summary:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  getSpendingTrends,
  getBottleneckReport,
  getApprovalMetrics,
  getDashboardSummary
};
