import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  partially_approved: "bg-blue-100 text-blue-700"
};

const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  partially_approved: "Partially Approved"
};

const CATEGORY_ICONS = {
  meals: "🍽️",
  travel: "✈️",
  accommodation: "🏨",
  transport: "🚗",
  office_supplies: "📎",
  entertainment: "🎬",
  communication: "📱",
  software: "💻",
  equipment: "🖥️",
  other: "📦"
};

export function ExpenseListPage() {
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
      const params = {};
      if (filter !== "all") {
        params.status = filter;
      }
      const data = await expenseApi.getMyExpenses(params);
      setExpenses(data.expenses || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await expenseApi.getStats();
      setStats(data.stats);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Expenses</h1>
            <p className="text-slate-600">Track and manage your expense submissions</p>
          </div>
          <Link
            to="/app/expenses/new"
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            ➕ New Expense
          </Link>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500">Total Expenses</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total_count}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500">Pending Amount</p>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(stats.pending_amount, stats.currency)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500">Approved Amount</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.approved_amount, stats.currency)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500">Total Submitted</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.total_amount, stats.currency)}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {["all", "pending", "approved", "rejected"].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {status === "all" ? "All" : STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Expense List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <span className="animate-spin inline-block text-2xl mb-2">⏳</span>
              <p>Loading expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-4xl mb-2 block">📭</span>
              <p className="mb-4">No expenses found</p>
              <Link
                to="/app/expenses/new"
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Submit your first expense →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expenses.map(expense => (
                <div
                  key={expense.id}
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4"
                >
                  {/* Category Icon */}
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl">
                    {CATEGORY_ICONS[expense.category] || "📦"}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900 truncate">
                        {expense.merchant_name || expense.description || "Expense"}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[expense.status]}`}>
                        {STATUS_LABELS[expense.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {expense.category?.replace("_", " ")} • {formatDate(expense.expense_date)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(expense.amount, expense.currency_code)}
                    </p>
                    {expense.converted_amount && expense.currency_code !== expense.company_currency_code && (
                      <p className="text-xs text-slate-500">
                        ≈ {formatCurrency(expense.converted_amount, expense.company_currency_code)}
                      </p>
                    )}
                  </div>

                  {/* Receipt indicator */}
                  {expense.receipt_url && (
                    <div className="text-slate-400" title="Has receipt">
                      📎
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
