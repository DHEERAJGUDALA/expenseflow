import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

export function TeamExpensesPage() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    totalAmount: 0,
    pendingAmount: 0
  });

  useEffect(() => {
    loadTeamExpenses();
  }, [filter]);

  const loadTeamExpenses = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (filter !== "all") {
        params.status = filter;
      }
      const data = await expenseApi.getTeamExpenses(params);
      const expenseList = data.expenses || [];
      setExpenses(expenseList);
      
      // Calculate stats
      const allExpenses = filter === "all" ? expenseList : (await expenseApi.getTeamExpenses({})).expenses || [];
      setStats({
        total: allExpenses.length,
        pending: allExpenses.filter(e => e.status === "pending").length,
        approved: allExpenses.filter(e => e.status === "approved").length,
        rejected: allExpenses.filter(e => e.status === "rejected").length,
        totalAmount: allExpenses.reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0),
        pendingAmount: allExpenses.filter(e => e.status === "pending").reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0)
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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

  const getWaitingTime = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    }
    return `${diffHours}h`;
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Team Expenses</h1>
          <p className="text-slate-600">View all expenses from your direct reports (read-only)</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-xl">
                📊
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Expenses</p>
                <p className="text-xl font-bold text-slate-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center text-xl">
                ⏳
              </div>
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">
                ✅
              </div>
              <div>
                <p className="text-sm text-slate-500">Approved</p>
                <p className="text-xl font-bold text-green-600">{stats.approved}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl">
                💰
              </div>
              <div>
                <p className="text-sm text-slate-500">Pending Amount</p>
                <p className="text-xl font-bold text-indigo-600">{formatCurrency(stats.pendingAmount)}</p>
              </div>
            </div>
          </div>
        </div>

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
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
        )}

        {/* Team Expenses Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <span className="animate-spin inline-block text-2xl mb-2">⏳</span>
              <p>Loading team expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-4xl mb-2 block">📭</span>
              <p className="font-medium">No team expenses found</p>
              <p className="text-sm">Expenses from your direct reports will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Employee</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Date</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Description</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Amount</th>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-medium text-indigo-600">
                            {(expense.employee_name || expense.user_email || "U")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">
                              {expense.employee_name || "Unknown"}
                            </p>
                            <p className="text-xs text-slate-500">{expense.job_title || "Employee"}</p>
                          </div>
                        </div>
                      </td>
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
                        <p className="text-sm text-slate-900 truncate max-w-xs">
                          {expense.description || expense.merchant_name || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(expense.amount, expense.currency_code || "USD")}
                        </p>
                        {expense.converted_amount && expense.currency_code !== expense.company_currency_code && (
                          <p className="text-xs text-slate-500">
                            ~ {formatCurrency(expense.converted_amount, expense.company_currency_code)}
                          </p>
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
                              Waiting on: <span className="font-medium">{expense.current_approver_name}</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              {getWaitingTime(expense.created_at)} ago
                            </p>
                          </div>
                        ) : expense.status === "approved" ? (
                          <span className="text-sm text-green-600">Completed</span>
                        ) : expense.status === "rejected" ? (
                          <span className="text-sm text-red-600">Rejected</span>
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

        {/* Note */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <span className="font-medium">Note:</span> This is a read-only view of your team's expenses. 
            To approve or reject expenses, use the <a href="/app/approvals" className="underline hover:text-blue-800">Approvals</a> page.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
