import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { managerApi } from "../lib/api";
import { Search, Filter, ArrowRight, Users, Calendar } from "lucide-react";

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

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function ManagerTeamExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => { loadTeamExpenses(); }, []);

  const loadTeamExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await managerApi.getTeamExpenses();
      setExpenses(data.expenses || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
    catch { return `${currency} ${parseFloat(amount).toFixed(2)}`; }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  const filteredExpenses = expenses.filter((exp) => {
    if (statusFilter !== "all" && exp.status !== statusFilter) return false;
    if (dateFilter === "30_days") {
      const date = new Date(exp.expense_date || exp.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (date < thirtyDaysAgo) return false;
    } else if (dateFilter === "this_month") {
      const date = new Date(exp.expense_date || exp.created_at);
      const now = new Date();
      if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return false;
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div {...fadeIn(0)} className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Users size={22} style={{ color: "var(--accent)" }} />
              Team Expenses
            </h1>
            <p className="page-subtitle">View all expenses submitted by your team members</p>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Filter size={14} /></div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input pl-8 py-2 text-sm h-10 min-w-[140px]" style={{ paddingRight: "30px" }}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Calendar size={14} /></div>
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="input pl-8 py-2 text-sm h-10 min-w-[140px]" style={{ paddingRight: "30px" }}>
                <option value="">Any Time</option>
                <option value="30_days">Last 30 Days</option>
                <option value="this_month">This Month</option>
              </select>
            </div>
          </div>
        </motion.div>

        {error && <div className="alert alert-danger mb-4">{error}</div>}

        {/* Table/List */}
        <motion.div {...fadeIn(0.1)}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="text-center"><div className="spinner spinner-lg mx-auto mb-3" /><p className="text-sm text-slate-500">Loading team expenses...</p></div></div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">No team expenses found</div>
            <div className="empty-state-text">Your team hasn't submitted any expenses yet.</div>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">No matching expenses</div>
            <div className="empty-state-text">Try adjusting your filters to see more results.</div>
            <button onClick={() => { setStatusFilter("all"); setDateFilter(""); }} className="btn btn-secondary mt-4 btn-sm">Clear Filters</button>
          </div>
        ) : (
          <div className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="group">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-sm">{(exp.employee_name || "E")[0]}</div>
                          <div>
                            <p className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{exp.employee_name || "Employee"}</p>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{exp.employee_job_title || exp.employee_email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <span>{CATEGORY_ICONS[exp.category] || "📦"}</span>
                          <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{exp.category?.replace(/_/g, " ")}</span>
                        </span>
                      </td>
                      <td className="text-sm" style={{ color: "var(--text-secondary)" }}>{formatDate(exp.expense_date || exp.created_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <p className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(exp.converted_amount || exp.amount, exp.company_currency || exp.currency)}
                        </p>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(exp.status)} capitalize text-[10px]`}>
                          {exp.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link to={`/app/expenses/${exp.id}`} className="btn btn-sm btn-ghost inline-flex items-center gap-1 group-hover:bg-slate-100 transition-colors">
                          View <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 group-hover:translate-x-0" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
