import { useState, useEffect } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { approvalApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700"
};

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
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

export function ApprovalsPage() {
  const { user } = useAuth();
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [processingId, setProcessingId] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [comment, setComment] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [pendingData, historyData] = await Promise.all([
        approvalApi.getPendingApprovals(),
        approvalApi.getApprovalHistory()
      ]);
      setPendingExpenses(pendingData.expenses || []);
      setApprovalHistory(historyData.approvals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount, currency = "INR") => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const openApprovalModal = (expense, action) => {
    setSelectedExpense(expense);
    setActionType(action);
    setComment("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedExpense(null);
    setActionType(null);
    setComment("");
  };

  const handleApproval = async () => {
    if (!selectedExpense || !actionType) return;

    setProcessingId(selectedExpense.id);
    try {
      await approvalApi.process(
        selectedExpense.id,
        user.id,
        actionType,
        comment
      );
      
      // Refresh data
      await loadData();
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = pendingExpenses.length;
  const totalPendingAmount = pendingExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-slate-600">Review and process expense requests from your team</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center text-2xl">
                ⏳
              </div>
              <div>
                <p className="text-sm text-slate-500">Pending Requests</p>
                <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center text-2xl">
                💰
              </div>
              <div>
                <p className="text-sm text-slate-500">Pending Amount</p>
                <p className="text-2xl font-bold text-indigo-600">{formatCurrency(totalPendingAmount)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-2xl">
                ✅
              </div>
              <div>
                <p className="text-sm text-slate-500">Processed Today</p>
                <p className="text-2xl font-bold text-green-600">
                  {approvalHistory.filter(a => 
                    new Date(a.created_at).toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "pending"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Pending
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            History
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
        )}

        {/* Content */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <span className="animate-spin inline-block text-2xl mb-2">⏳</span>
              <p>Loading approvals...</p>
            </div>
          ) : activeTab === "pending" ? (
            // Pending Approvals
            pendingExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <span className="text-4xl mb-2 block">🎉</span>
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No pending expenses to review</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingExpenses.map(expense => (
                  <div
                    key={expense.id}
                    className="p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Category Icon */}
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                        {CATEGORY_ICONS[expense.category] || "📦"}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-slate-900">
                            {expense.description || "Expense"}
                          </h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS.pending}`}>
                            {STATUS_LABELS.pending}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-1">
                          <span className="font-medium">{expense.employee_name || expense.user_email || "Employee"}</span>
                        </p>
                        <p className="text-sm text-slate-500">
                          {expense.category?.replace("_", " ")} • {formatDate(expense.expense_date)}
                          {expense.remarks && ` • ${expense.remarks}`}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-slate-900 text-lg">
                          {formatCurrency(expense.amount)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Submitted {formatDate(expense.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 ml-16">
                      <button
                        onClick={() => openApprovalModal(expense, "approved")}
                        disabled={processingId === expense.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => openApprovalModal(expense, "rejected")}
                        disabled={processingId === expense.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        ✕ Reject
                      </button>
                      <button
                        onClick={() => setSelectedExpense(selectedExpense?.id === expense.id ? null : expense)}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                      >
                        {selectedExpense?.id === expense.id ? "Hide Details" : "View Details"}
                      </button>
                    </div>

                    {/* Expanded Details */}
                    {selectedExpense?.id === expense.id && !showModal && (
                      <div className="mt-4 ml-16 p-4 bg-slate-50 rounded-lg">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500">Category</p>
                            <p className="font-medium">{expense.category?.replace("_", " ")}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Expense Date</p>
                            <p className="font-medium">{formatDate(expense.expense_date)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Paid By</p>
                            <p className="font-medium">{expense.paid_by || "Employee"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Amount</p>
                            <p className="font-medium">{formatCurrency(expense.amount)}</p>
                          </div>
                          {expense.remarks && (
                            <div className="col-span-2">
                              <p className="text-slate-500">Remarks</p>
                              <p className="font-medium">{expense.remarks}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            // Approval History
            approvalHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <span className="text-4xl mb-2 block">📭</span>
                <p>No approval history yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {approvalHistory.map(approval => (
                  <div
                    key={approval.id}
                    className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4"
                  >
                    {/* Status Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                      approval.status === "approved" ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {approval.status === "approved" ? "✓" : "✕"}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900">
                          {approval.expense_description || "Expense"}
                        </h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[approval.status]}`}>
                          {STATUS_LABELS[approval.status]}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        {approval.employee_name} • {formatDate(approval.created_at)}
                      </p>
                      {approval.comments && (
                        <p className="text-sm text-slate-600 mt-1 italic">"{approval.comments}"</p>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(approval.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Approval Modal */}
      {showModal && selectedExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {actionType === "approved" ? "Approve Expense" : "Reject Expense"}
            </h2>
            
            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-slate-900">{selectedExpense.description}</p>
                  <p className="text-sm text-slate-500">{selectedExpense.employee_name}</p>
                </div>
                <p className="font-bold text-lg">{formatCurrency(selectedExpense.amount)}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Comments {actionType === "rejected" && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === "approved" ? "Optional comment..." : "Reason for rejection..."}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApproval}
                disabled={processingId || (actionType === "rejected" && !comment.trim())}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  actionType === "approved" 
                    ? "bg-green-600 hover:bg-green-700" 
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {processingId ? "Processing..." : actionType === "approved" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
