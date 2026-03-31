import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [specialApproverQueue, setSpecialApproverQueue] = useState([]);
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
      const [pendingData, specialData, historyData] = await Promise.all([
        approvalApi.getPendingApprovals(),
        approvalApi.getSpecialApproverQueue().catch(() => ({ expenses: [] })),
        approvalApi.getApprovalHistory()
      ]);
      setPendingExpenses(pendingData.expenses || []);
      setSpecialApproverQueue(specialData.expenses || []);
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

  const getWaitingTime = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    }
    if (diffHours > 0) {
      return `${diffHours}h`;
    }
    return "Just now";
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
    
    // Validate rejection comment (minimum 20 characters)
    if (actionType === "rejected" && comment.trim().length < 20) {
      setError("Rejection reason must be at least 20 characters");
      return;
    }

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
  const specialCount = specialApproverQueue.length;
  const totalPendingAmount = pendingExpenses.reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0);

  const renderExpenseRow = (expense, isSpecial = false) => (
    <div
      key={expense.id}
      className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
    >
      <div className="flex items-start gap-4">
        {/* Category Icon */}
        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
          {CATEGORY_ICONS[expense.category] || "📦"}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-slate-900">
              {expense.description || "Expense"}
            </h3>
            <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS.pending}`}>
              {STATUS_LABELS.pending}
            </span>
            {isSpecial && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                Special Approval
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-medium">{expense.employee_name || expense.user_email || "Employee"}</span>
            {expense.job_title && <span className="text-slate-400"> • {expense.job_title}</span>}
          </p>
          <p className="text-sm text-slate-500">
            {expense.category?.replace("_", " ")} • {formatDate(expense.expense_date)}
          </p>
        </div>

        {/* Amount & Timing */}
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-slate-900 text-lg">
            {formatCurrency(expense.amount, expense.currency_code || "INR")}
          </p>
          {expense.converted_amount && expense.currency_code !== expense.company_currency_code && (
            <p className="text-xs text-slate-500 mb-1">
              ~ {formatCurrency(expense.converted_amount, expense.company_currency_code)}
            </p>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-500 justify-end">
            <span className="text-amber-500">⏱️</span>
            Waiting: {getWaitingTime(expense.created_at)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mt-4 ml-16 flex-wrap">
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
          onClick={() => navigate(`/app/expenses/${expense.id}`)}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          View Full Details
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-slate-600">Review and process expense requests from your team</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center text-2xl">
                ⏳
              </div>
              <div>
                <p className="text-sm text-slate-500">My Queue</p>
                <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">
                ⭐
              </div>
              <div>
                <p className="text-sm text-slate-500">Special Queue</p>
                <p className="text-2xl font-bold text-purple-600">{specialCount}</p>
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
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "pending"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            My Approval Queue
            {pendingCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === "pending" ? "bg-yellow-500 text-white" : "bg-yellow-100 text-yellow-700"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("special")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "special"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Special Approver Queue
            {specialCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === "special" ? "bg-purple-500 text-white" : "bg-purple-100 text-purple-700"
              }`}>
                {specialCount}
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
            // Pending Approvals - My Queue
            pendingExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <span className="text-4xl mb-2 block">🎉</span>
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No pending expenses in your approval queue</p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">{pendingCount} expense{pendingCount !== 1 ? 's' : ''}</span> waiting for your approval
                  </p>
                </div>
                {pendingExpenses.map(expense => renderExpenseRow(expense, false))}
              </div>
            )
          ) : activeTab === "special" ? (
            // Special Approver Queue
            specialApproverQueue.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <span className="text-4xl mb-2 block">⭐</span>
                <p className="font-medium">No special approvals</p>
                <p className="text-sm">Expenses requiring your special approval will appear here</p>
                <p className="text-xs text-slate-400 mt-2">
                  (CFO, CEO, or other designated parallel approvers)
                </p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                  <p className="text-sm text-purple-700">
                    <span className="font-medium">{specialCount} expense{specialCount !== 1 ? 's' : ''}</span> requiring your special approval
                  </p>
                  <p className="text-xs text-purple-600 mt-1">
                    As a special approver, you can approve/reject these at any time (parallel to regular workflow)
                  </p>
                </div>
                {specialApproverQueue.map(expense => renderExpenseRow(expense, true))}
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
                    onClick={() => approval.expense_id && navigate(`/app/expenses/${approval.expense_id}`)}
                    className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 cursor-pointer"
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
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {actionType === "approved" ? "Approve Expense" : "Reject Expense"}
            </h2>
            
            {/* Expense Summary */}
            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-slate-900">{selectedExpense.description}</p>
                  <p className="text-sm text-slate-500">{selectedExpense.employee_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatCurrency(selectedExpense.amount, selectedExpense.currency_code)}</p>
                  {selectedExpense.converted_amount && selectedExpense.currency_code !== selectedExpense.company_currency_code && (
                    <p className="text-xs text-slate-500">
                      ~ {formatCurrency(selectedExpense.converted_amount, selectedExpense.company_currency_code)}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Category:</span>{" "}
                  <span className="font-medium capitalize">{selectedExpense.category?.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-slate-500">Date:</span>{" "}
                  <span className="font-medium">{formatDate(selectedExpense.expense_date)}</span>
                </div>
              </div>
            </div>

            {/* Comment Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {actionType === "approved" ? "Comment (optional)" : "Rejection Reason"} 
                {actionType === "rejected" && <span className="text-red-500">* (min 20 characters)</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === "approved" ? "Add an optional comment..." : "Please provide a detailed reason for rejection..."}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={3}
              />
              {actionType === "rejected" && (
                <p className={`text-xs mt-1 ${comment.trim().length < 20 ? "text-red-500" : "text-green-500"}`}>
                  {comment.trim().length}/20 characters minimum
                </p>
              )}
            </div>

            {/* Warning for rejection */}
            {actionType === "rejected" && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  <span className="font-medium">Warning:</span> Rejecting this expense will notify the employee and may require them to resubmit.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApproval}
                disabled={processingId || (actionType === "rejected" && comment.trim().length < 20)}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
