import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-blue-100 text-blue-700",
  partially_approved: "bg-purple-100 text-purple-700"
};

const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  partially_approved: "Partial"
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

  const formatCurrency = (amount, currency = "INR") => {
    // Use safe fallback for currencies
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "INR"
      }).format(amount);
    } catch (error) {
      // Fallback if currency code is invalid
      return `${currency} ${Number(amount).toFixed(2)}`;
    }
  };

  const getCurrencySymbol = (currency) => {
    const symbols = {
      'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£', 'AUD': 'A$',
      'CAD': 'C$', 'SGD': 'S$', 'AED': 'د.إ', 'JPY': '¥', 'CNY': '¥'
    };
    return symbols[currency] || currency;
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
          {["all", "pending", "approved", "rejected", "paid"].map(status => (
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Date</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Description</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Original Amount</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Converted Amount</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Current Step</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map(expense => (
                    <tr
                      key={expense.id}
                      onClick={() => navigate(`/app/expenses/${expense.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatDate(expense.expense_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{CATEGORY_ICONS[expense.category] || "📦"}</span>
                          <span className="text-sm text-slate-700 capitalize">
                            {expense.category?.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900 truncate max-w-xs">
                          {expense.merchant_name || expense.description || "Expense"}
                        </p>
                        {expense.receipt_url && (
                          <span className="text-slate-400 text-xs">📎 Receipt attached</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-sm">
                          <p className="font-semibold text-slate-900">
                            {getCurrencySymbol(expense.original_currency || expense.currency || 'INR')}
                            {(expense.original_amount || expense.amount || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {expense.original_currency || expense.currency || 'INR'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {expense.original_currency !== expense.company_currency && expense.converted_amount ? (
                          <div className="text-sm">
                            <p className="font-medium text-indigo-700">
                              {getCurrencySymbol(expense.company_currency || 'INR')}
                              {expense.converted_amount.toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {expense.company_currency || 'INR'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Same currency</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${STATUS_COLORS[expense.status]}`}>
                          {STATUS_LABELS[expense.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {expense.status === "pending" && expense.current_approver_name ? (
                          <div>
                            <p className="text-sm text-slate-700">
                              Waiting on: <span className="font-medium text-indigo-600">{expense.current_approver_name}</span>
                            </p>
                            {expense.current_approver_job_title && (
                              <p className="text-xs text-slate-500">{expense.current_approver_job_title}</p>
                            )}
                          </div>
                        ) : expense.status === "approved" ? (
                          <span className="text-sm text-green-600 font-medium">Fully Approved</span>
                        ) : expense.status === "rejected" ? (
                          <span className="text-sm text-red-600 font-medium">Rejected</span>
                        ) : expense.status === "paid" ? (
                          <span className="text-sm text-blue-600 font-medium">Payment Complete</span>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
