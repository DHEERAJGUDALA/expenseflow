import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";
import { 
  Plus, Receipt, Clock, CheckCircle, XCircle, TrendingUp, 
  DollarSign, ArrowRight, Paperclip
} from "lucide-react";

const CATEGORY_ICONS = {
  meals: "🍽️", travel: "✈️", accommodation: "🏨", transport: "🚗",
  office_supplies: "📎", entertainment: "🎬", communication: "📱",
  software: "💻", equipment: "🖥️", other: "📦"
};

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function ExpenseListPage() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadExpenses();
    loadStats();
  }, [filter]);

  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const data = await expenseApi.getMyExpenses(params);
      setExpenses(data.expenses || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const loadStats = async () => {
    try { const data = await expenseApi.getStats(); setStats(data.stats); }
    catch (err) { console.error("Failed to load stats:", err); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount || 0); }
    catch { return `${currency} ${parseFloat(amount || 0).toFixed(2)}`; }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  };

  const getStatusBadge = (status) => {
    const map = {
      approved: "badge-success",
      pending: "badge-warning",
      rejected: "badge-danger",
      draft: "badge-neutral",
      paid: "badge-accent"
    };
    return map[status] || "badge-neutral";
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl">
        {/* Header */}
        <motion.div {...fadeIn(0)} className="page-header flex sm:flex-row flex-col sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">My Expenses</h1>
            <p className="page-subtitle">Track and manage your expense submissions</p>
          </div>
          <Link to="/app/expenses/new" className="btn btn-primary shadow-lg shadow-indigo-500/25">
            <Plus size={18} /> New Expense
          </Link>
        </motion.div>

        {/* Stats Cards */}
        {stats && (
          <motion.div {...fadeIn(0.05)} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Expenses", value: stats.total_count || 0, icon: TrendingUp, color: "var(--accent)" },
              { label: "Pending", value: formatCurrency(stats.pending_amount, stats.currency), icon: Clock, color: "var(--warning)" },
              { label: "Approved", value: formatCurrency(stats.approved_amount, stats.currency), icon: CheckCircle, color: "var(--success)" },
              { label: "Total Value", value: formatCurrency(stats.total_amount, stats.currency), icon: DollarSign, color: "var(--text-primary)" },
            ].map((stat, i) => (
              <div key={stat.label} className="stat-card">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon size={16} style={{ color: stat.color }} />
                  <span className="stat-label" style={{ margin: 0 }}>{stat.label}</span>
                </div>
                <p className="stat-value" style={{ color: stat.color, fontSize: typeof stat.value === "number" ? "28px" : "22px" }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Filters */}
        <motion.div {...fadeIn(0.1)} className="tabs mb-6">
          {["all", "pending", "approved", "rejected", "paid"].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`tab ${filter === status ? "tab-active" : ""}`}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </motion.div>

        {/* Error */}
        {error && <div className="alert alert-danger mb-4">{error}</div>}

        {/* Expense List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="spinner spinner-lg mx-auto mb-3" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading expenses...</p>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No expenses found</div>
            <Link to="/app/expenses/new" className="inline-block mt-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Submit your first expense →
            </Link>
          </div>
        ) : (
          <motion.div {...fadeIn(0.15)} className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th>Current Step</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr
                      key={expense.id}
                      onClick={() => navigate(`/app/expenses/${expense.id}`)}
                      className="cursor-pointer group"
                    >
                      <td>{formatDate(expense.expense_date)}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="text-lg">{CATEGORY_ICONS[expense.category] || "📦"}</span>
                          <span className="capitalize" style={{ color: "var(--text-primary)" }}>{expense.category?.replace(/_/g, " ")}</span>
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate max-w-[200px]" style={{ color: "var(--text-primary)" }}>
                            {expense.merchant_name || expense.description || "Expense"}
                          </p>
                          {expense.receipt_url && <Paperclip size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(expense.amount, expense.currency)}
                        </p>
                        {expense.company_currency && expense.currency !== expense.company_currency && expense.converted_amount && (
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {formatCurrency(expense.converted_amount, expense.company_currency)}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(expense.status)} capitalize`}>
                          {expense.status}
                        </span>
                      </td>
                      <td>
                        {expense.status === "pending" && expense.current_approver_name ? (
                          <div>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Waiting on:</p>
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{expense.current_approver_name}</p>
                          </div>
                        ) : expense.status === "approved" ? (
                          <span className="text-sm font-medium" style={{ color: "var(--success)" }}>Fully Approved</span>
                        ) : expense.status === "rejected" ? (
                          <span className="text-sm font-medium" style={{ color: "var(--danger)" }}>Rejected</span>
                        ) : expense.status === "paid" ? (
                          <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>Payment Complete</span>
                        ) : (
                          <span className="text-sm" style={{ color: "var(--text-placeholder)" }}>-</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <ArrowRight size={16} style={{ color: "var(--text-placeholder)" }} className="opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 transform" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
