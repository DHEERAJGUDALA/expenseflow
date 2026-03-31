import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";
import {
  Users, RefreshCw, CheckCircle2, Clock, CheckCircle, 
  XCircle, Filter, DollarSign, Calendar, ChevronRight, Info
} from "lucide-react";

const CATEGORY_ICONS = {
  meals: "🍽️", travel: "✈️", accommodation: "🏨", transport: "🚗",
  office_supplies: "📎", entertainment: "🎬", communication: "📱",
  software: "💻", equipment: "🖥️", other: "📦"
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

const STATUS_LABELS = {
  all: "All Expenses",
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid"
};

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function TeamExpensesPage() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState({
    total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0, pendingAmount: 0
  });

  useEffect(() => { loadTeamExpenses(); }, [filter]);

  const loadTeamExpenses = async () => {
    setIsLoading(true); setError(null);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const data = await expenseApi.getTeamExpenses(params);
      const expenseList = data.expenses || [];
      setExpenses(expenseList);
      
      const allExpensesData = filter === "all" ? expenseList : (await expenseApi.getTeamExpenses({})).expenses || [];
      setStats({
        total: allExpensesData.length,
        pending: allExpensesData.filter(e => e.status === "pending").length,
        approved: allExpensesData.filter(e => e.status === "approved").length,
        rejected: allExpensesData.filter(e => e.status === "rejected").length,
        totalAmount: allExpensesData.reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0),
        pendingAmount: allExpensesData.filter(e => e.status === "pending").reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0)
      });
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
    catch { return `${currency} ${parseFloat(amount).toFixed(2)}`; }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  const getWaitingTime = (createdAt) => {
    const diffMs = new Date() - new Date(createdAt);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
    return `${diffHours}h`;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <motion.div {...fadeIn(0)} className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Users size={24} style={{ color: "var(--accent)" }} /> Team Overview
            </h1>
            <p className="page-subtitle">View all expenses requested by your direct reports.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/app/approvals" className="btn btn-primary btn-sm flex items-center gap-1">
              <CheckCircle2 size={16} /> Action Approvals
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div {...fadeIn(0.05)} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Reports", value: stats.total, icon: Users, color: "var(--text-primary)" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "var(--warning)" },
            { label: "Approved", value: stats.approved, icon: CheckCircle, color: "var(--success)" },
            { label: "Pending Value", value: formatCurrency(stats.pendingAmount, "INR"), icon: DollarSign, color: "var(--accent)" }
          ].map((stat, i) => (
            <div key={i} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <stat.icon size={16} style={{ color: stat.color }} />
                <span className="stat-label" style={{ margin: 0 }}>{stat.label}</span>
              </div>
              <p className="stat-value" style={{ color: stat.color, fontSize: typeof stat.value === "string" ? "18px" : "24px" }}>
                {stat.value}
              </p>
            </div>
          ))}
        </motion.div>

        <motion.div {...fadeIn(0.1)} className="tabs mb-6 flex-wrap">
          {["all", "pending", "approved", "rejected", "paid"].map(status => (
            <button key={status} onClick={() => setFilter(status)} className={`tab ${filter === status ? "tab-active" : ""}`}>
              {STATUS_LABELS[status]}
            </button>
          ))}
        </motion.div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}

        <motion.div {...fadeIn(0.15)} className="card overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-20"><div className="spinner spinner-lg text-slate-400" /></div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">No expenses found</div>
              <div className="empty-state-text">No team expenses match the current filter.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th>Current Step</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr key={expense.id} onClick={() => navigate(`/app/expenses/${expense.id}`)} className="cursor-pointer group hover:bg-slate-50/50">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-sm rounded-lg bg-indigo-50 text-indigo-600 font-bold border border-indigo-100">
                            {(expense.employee_name || expense.user_email || "U")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[13px] text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                              {expense.employee_name || "Unknown"}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {expense.job_title || "Employee"} • <Calendar size={10} className="inline mr-0.5 relative -top-[1px]" />{formatDate(expense.expense_date)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{CATEGORY_ICONS[expense.category] || "📦"}</span>
                          <span className="text-xs font-medium text-slate-600 capitalize">
                            {expense.category?.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td>
                        <p className="text-[13px] text-slate-700 font-medium truncate max-w-[200px]">
                          {expense.description || expense.merchant_name || "-"}
                        </p>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <p className="font-bold text-[14px] font-heading text-slate-900">
                          {formatCurrency(expense.amount, expense.currency_code || "INR")}
                        </p>
                        {expense.converted_amount && expense.currency_code !== expense.company_currency_code && (
                          <p className="text-[11px] font-semibold text-slate-500">
                            ≈ {formatCurrency(expense.converted_amount, expense.company_currency_code)}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(expense.status)} capitalize text-[10px]`}>
                          {expense.status.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        {expense.status === "pending" && expense.current_approver_name ? (
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-700 truncate max-w-[140px]">
                              Waiting: {expense.current_approver_name}
                            </span>
                            <span className="text-[10px] font-semibold text-amber-600">
                              <Clock size={10} className="inline mr-1" />{getWaitingTime(expense.created_at)}
                            </span>
                          </div>
                        ) : expense.status === "approved" || expense.status === "paid" ? (
                          <span className="text-[11px] font-bold text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Resolved
                          </span>
                        ) : expense.status === "rejected" ? (
                          <span className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                            <XCircle size={12} /> Closed
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        <motion.div {...fadeIn(0.2)} className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100/50">
          <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <p className="text-[13px] text-blue-800 font-medium">
            This is a read-only view of your team's expenses. To directly approve or reject pending requests, please use the <Link to="/app/approvals" className="font-bold underline hover:text-blue-900">Approvals Page</Link>.
          </p>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
