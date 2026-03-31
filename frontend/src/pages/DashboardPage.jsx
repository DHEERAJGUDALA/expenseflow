import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../context/AuthContext";
import { expenseApi, employeeApi } from "../lib/api";

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const role = user?.user_metadata?.role || "employee";
  const fullName = user?.user_metadata?.full_name || user?.email;

  useEffect(() => {
    loadDashboardData();
  }, []);

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
      setProfile(profileData?.employee);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency
    }).format(amount || 0);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <span className="animate-spin inline-block text-4xl mb-4">⏳</span>
            <p className="text-slate-600">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            {getGreeting()}, {fullName?.split(" ")[0]}!
          </h1>
          <p className="text-slate-600 mt-1">
            {profile?.company?.name && `${profile.company.name} • `}
            Here's your expense overview
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Link
            to="/app/expenses/new"
            className="p-6 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            <div className="text-3xl mb-3">📷</div>
            <h3 className="font-semibold text-lg">Submit Expense</h3>
            <p className="text-indigo-100 text-sm mt-1">Scan receipt with OCR</p>
          </Link>

          <Link
            to="/app/expenses"
            className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-3">📋</div>
            <h3 className="font-semibold text-lg text-slate-900">View Expenses</h3>
            <p className="text-slate-500 text-sm mt-1">Track your submissions</p>
          </Link>

          {(role === "admin" || role === "manager") && (
            <Link
              to="/app/approvals"
              className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">✅</div>
              <h3 className="font-semibold text-lg text-slate-900">Approvals</h3>
              <p className="text-slate-500 text-sm mt-1">Review pending requests</p>
            </Link>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">📊</span>
              <span className="text-xs text-slate-400">Total</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats?.total_count || 0}</p>
            <p className="text-sm text-slate-500">Expenses submitted</p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">⏳</span>
              <span className="text-xs text-yellow-500 font-medium">Pending</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">
              {formatCurrency(stats?.pending_amount, stats?.currency)}
            </p>
            <p className="text-sm text-slate-500">Awaiting approval</p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">✅</span>
              <span className="text-xs text-green-500 font-medium">Approved</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.approved_amount, stats?.currency)}
            </p>
            <p className="text-sm text-slate-500">Reimbursement ready</p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">💰</span>
              <span className="text-xs text-slate-400">Total Value</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats?.total_amount, stats?.currency)}
            </p>
            <p className="text-sm text-slate-500">All time</p>
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-semibold text-slate-900">Recent Expenses</h2>
            <Link to="/app/expenses" className="text-sm text-indigo-600 hover:text-indigo-700">
              View all →
            </Link>
          </div>

          {recentExpenses.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-4xl mb-2 block">📭</span>
              <p>No expenses yet</p>
              <Link
                to="/app/expenses/new"
                className="inline-block mt-3 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Submit your first expense →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentExpenses.map(expense => (
                <div key={expense.id} className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                    {expense.category === "meals" && "🍽️"}
                    {expense.category === "travel" && "✈️"}
                    {expense.category === "transport" && "🚗"}
                    {!["meals", "travel", "transport"].includes(expense.category) && "📦"}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {expense.merchant_name || expense.description || "Expense"}
                    </p>
                    <p className="text-sm text-slate-500">{expense.category?.replace("_", " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(expense.amount, expense.currency_code)}</p>
                    <p className={`text-xs ${
                      expense.status === "approved" ? "text-green-600" :
                      expense.status === "pending" ? "text-yellow-600" :
                      expense.status === "rejected" ? "text-red-600" : "text-slate-500"
                    }`}>
                      {expense.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        {stats?.by_category && Object.keys(stats.by_category).length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Expenses by Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(stats.by_category).map(([category, count]) => (
                <div key={category} className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-2xl mb-1">
                    {category === "meals" && "🍽️"}
                    {category === "travel" && "✈️"}
                    {category === "transport" && "🚗"}
                    {category === "accommodation" && "🏨"}
                    {category === "office_supplies" && "📎"}
                    {!["meals", "travel", "transport", "accommodation", "office_supplies"].includes(category) && "📦"}
                  </p>
                  <p className="font-semibold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500 capitalize">{category.replace("_", " ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
