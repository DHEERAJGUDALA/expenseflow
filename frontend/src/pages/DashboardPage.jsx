import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";
import { expenseApi, employeeApi } from "../lib/api";
import { PlusCircle, Receipt, CheckCircle, Clock, TrendingUp, DollarSign, ArrowRight } from "lucide-react";

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

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const role = user?.role || "employee";
  const fullName = user?.full_name || user?.email;

  useEffect(() => { loadDashboardData(); }, []);

  if (role === "manager") {
    return <Navigate to="/manager/queue" replace />;
  }

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsData, expensesData, profileData] = await Promise.all([
        expenseApi.getStats().catch(() => null),
        expenseApi.getMyExpenses({ limit: 5 }).catch(() => ({ expenses: [] })),
        employeeApi.getMyProfile().catch(() => null)
      ]);
      setStats(statsData?.stats);
      setRecentExpenses(expensesData?.expenses || []);
      setUserProfile(profileData?.employee);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount || 0); }
    catch { return `${currency} ${parseFloat(amount || 0).toFixed(2)}`; }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getStatusBadge = (status) => {
    const map = {
      approved: "badge-success",
      pending: "badge-warning",
      rejected: "badge-danger",
      draft: "badge-neutral",
    };
    return map[status] || "badge-neutral";
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="spinner spinner-lg mx-auto mb-4" />
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl">
        {/* Welcome Header */}
        <motion.div {...fadeIn(0)} className="page-header">
          <h1 className="page-title" style={{ fontSize: "28px" }}>
            {getGreeting()}, {fullName?.split(" ")[0]} 👋
          </h1>
          <p className="page-subtitle">
            {userProfile?.company?.name && `${userProfile.company.name} · `}
            Here's your expense overview
          </p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div {...fadeIn(0.05)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Link
            to="/app/expenses/new"
            className="card card-hover flex items-center gap-4 p-5 group"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
            >
              <PlusCircle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Submit Expense</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Scan receipt with OCR</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--text-placeholder)" }} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            to="/app/expenses"
            className="card card-hover flex items-center gap-4 p-5 group"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              <Receipt size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>View Expenses</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Track your submissions</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--text-placeholder)" }} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          {role === "admin" && (
            <Link
              to="/app/approvals"
              className="card card-hover flex items-center gap-4 p-5 group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--success-subtle)", color: "var(--success)" }}
              >
                <CheckCircle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Approvals</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Review pending requests</p>
              </div>
              <ArrowRight size={16} style={{ color: "var(--text-placeholder)" }} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </motion.div>

        {/* Stats Grid */}
        <motion.div {...fadeIn(0.1)} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Expenses", value: stats?.total_count || 0, icon: TrendingUp, color: "var(--accent)" },
            { label: "Pending", value: formatCurrency(stats?.pending_amount, stats?.currency), icon: Clock, color: "var(--warning)" },
            { label: "Approved", value: formatCurrency(stats?.approved_amount, stats?.currency), icon: CheckCircle, color: "var(--success)" },
            { label: "Total Value", value: formatCurrency(stats?.total_amount, stats?.currency), icon: DollarSign, color: "var(--text-primary)" },
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

        {/* Recent Expenses */}
        <motion.div {...fadeIn(0.15)} className="table-container">
          <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
              Recent Expenses
            </h2>
            <Link
              to="/app/expenses"
              className="text-xs font-semibold flex items-center gap-1 group"
              style={{ color: "var(--accent)" }}
            >
              View all
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {recentExpenses.length === 0 ? (
            <div className="empty-state" style={{ border: "none", borderRadius: 0 }}>
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">No expenses yet</div>
              <Link
                to="/app/expenses/new"
                className="inline-block mt-3 text-sm font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Submit your first expense →
              </Link>
            </div>
          ) : (
            <div>
              {recentExpenses.map(expense => (
                <Link
                  key={expense.id}
                  to={`/app/expenses/${expense.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-card-hover)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    {CATEGORY_ICONS[expense.category] || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>
                      {expense.merchant_name || expense.description || "Expense"}
                    </p>
                    <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                      {expense.category?.replace("_", " ")}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>
                      {formatCurrency(expense.amount, expense.currency_code)}
                    </p>
                    <span className={`badge ${getStatusBadge(expense.status)} capitalize`} style={{ fontSize: "10px" }}>
                      {expense.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Category Breakdown */}
        {stats?.by_category && Object.keys(stats.by_category).length > 0 && (
          <motion.div {...fadeIn(0.2)} className="card mt-6 p-6">
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)", marginBottom: "16px" }}>
              Expenses by Category
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(stats.by_category).map(([category, count]) => (
                <div key={category} className="p-3 text-center rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-xl mb-1">{CATEGORY_ICONS[category] || "📦"}</p>
                  <p className="font-bold text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>{count}</p>
                  <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{category.replace("_", " ")}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
