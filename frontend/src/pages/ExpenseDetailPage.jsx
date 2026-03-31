import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  paid: "bg-blue-100 text-blue-700 border-blue-300",
  locked: "bg-slate-100 text-slate-500 border-slate-300",
  skipped: "bg-slate-100 text-slate-400 border-slate-200"
};

const STATUS_ICONS = {
  pending: "⏳",
  approved: "✅",
  rejected: "❌",
  paid: "💰",
  locked: "🔒",
  skipped: "⏭️"
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

export function ExpenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [approvalChain, setApprovalChain] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadExpense();
  }, [id]);

  const loadExpense = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await expenseApi.getById(id);
      setExpense(data.expense);
      setApprovalChain(data.approval_chain);
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center text-slate-500">
            <span className="animate-spin inline-block text-4xl mb-4">⏳</span>
            <p>Loading expense details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !expense) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
            {error || "Expense not found"}
          </div>
          <Link to="/app/expenses" className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
            ← Back to expenses
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">Expense Details</h1>
            <p className="text-slate-600">
              Submitted on {formatDate(expense.created_at)}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium border ${STATUS_COLORS[expense.status]}`}>
            {STATUS_ICONS[expense.status]} {expense.status?.charAt(0).toUpperCase() + expense.status?.slice(1)}
          </span>
        </div>

        {/* Expense Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-3xl">
              {CATEGORY_ICONS[expense.category] || "📦"}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-900">
                {expense.description || "Expense"}
              </h2>
              <p className="text-slate-500 capitalize">
                {expense.category?.replace(/_/g, " ")} • {formatDate(expense.expense_date)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(expense.amount, expense.currency)}
              </p>
              {expense.converted_amount && expense.currency !== expense.company_currency && (
                <p className="text-sm text-slate-500">
                  ≈ {formatCurrency(expense.converted_amount, expense.company_currency)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
            <div>
              <p className="text-sm text-slate-500">Merchant/Vendor</p>
              <p className="font-medium">{expense.paid_by || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Expense Date</p>
              <p className="font-medium">{formatDate(expense.expense_date)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Currency</p>
              <p className="font-medium">{expense.currency}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <p className="font-medium capitalize">{expense.status}</p>
            </div>
          </div>

          {expense.remarks && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 mb-1">Remarks</p>
              <p className="text-slate-700">{expense.remarks}</p>
            </div>
          )}

          {/* Payment Info (if paid) */}
          {expense.status === 'paid' && expense.payment_cycle && (
            <div className="mt-4 pt-4 border-t border-slate-100 bg-blue-50 -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
              <div className="flex items-center gap-2 text-blue-700">
                <span className="text-xl">💰</span>
                <div>
                  <p className="font-medium">Paid</p>
                  <p className="text-sm">
                    Payment processed on {formatDate(expense.payment_cycle.process_date)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Approval Chain Tracker */}
        {approvalChain && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Approval Progress
            </h3>

            {/* Progress Bar */}
            {approvalChain.sequential && approvalChain.sequential.length > 0 && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Step {approvalChain.summary.completed_steps} of {approvalChain.summary.total_steps}</span>
                  <span>
                    {Math.round((approvalChain.summary.completed_steps / approvalChain.summary.total_steps) * 100)}% complete
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-500"
                    style={{ 
                      width: `${(approvalChain.summary.completed_steps / approvalChain.summary.total_steps) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Sequential Approvers */}
            {approvalChain.sequential && approvalChain.sequential.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-slate-700">Approval Chain</h4>
                <div className="relative">
                  {/* Vertical line connecting steps */}
                  <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-200"></div>
                  
                  {approvalChain.sequential.map((step, index) => (
                    <div key={index} className="relative flex items-start gap-4 pb-6 last:pb-0">
                      {/* Step indicator */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl z-10 ${
                        step.status === 'approved' ? 'bg-green-100' :
                        step.status === 'rejected' ? 'bg-red-100' :
                        step.status === 'pending' ? 'bg-yellow-100' :
                        step.status === 'locked' ? 'bg-slate-100' :
                        'bg-slate-100'
                      }`}>
                        {STATUS_ICONS[step.status] || '🔒'}
                      </div>

                      {/* Step content */}
                      <div className="flex-1 bg-slate-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-slate-900">
                              Step {step.step}: {step.approver.name || step.approver.email?.split('@')[0]}
                            </p>
                            <p className="text-sm text-slate-500">
                              {step.approver.job_title || 'Approver'}
                              {step.is_required && (
                                <span className="ml-2 text-xs bg-slate-200 px-2 py-0.5 rounded">Required</span>
                              )}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[step.status]}`}>
                            {step.status?.charAt(0).toUpperCase() + step.status?.slice(1)}
                          </span>
                        </div>

                        {/* Show comment and timestamp if decided */}
                        {step.decided_at && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-slate-400">
                              {formatDateTime(step.decided_at)}
                            </p>
                            {step.comment && (
                              <p className="text-sm text-slate-600 mt-1 italic">
                                "{step.comment}"
                              </p>
                            )}
                          </div>
                        )}

                        {/* Show "Waiting" indicator for pending */}
                        {step.status === 'pending' && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-sm text-yellow-600 flex items-center gap-1">
                              <span className="animate-pulse">⏳</span>
                              Waiting for approval
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Approvers */}
            {approvalChain.parallel && approvalChain.parallel.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-medium text-slate-700 mb-4 flex items-center gap-2">
                  <span>⭐</span> Special Approvers
                  <span className="text-xs text-slate-400 font-normal">(Can approve/reject at any time)</span>
                </h4>
                <div className="grid gap-3">
                  {approvalChain.parallel.map((approver, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-3 bg-slate-50 rounded-lg p-3"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        approver.status === 'approved' ? 'bg-green-100' :
                        approver.status === 'rejected' ? 'bg-red-100' :
                        'bg-yellow-100'
                      }`}>
                        {STATUS_ICONS[approver.status] || '⭐'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {approver.approver.name || approver.approver.email?.split('@')[0]}
                        </p>
                        <p className="text-sm text-slate-500">{approver.approver.job_title}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[approver.status]}`}>
                        {approver.status?.charAt(0).toUpperCase() + approver.status?.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Approver Highlight */}
            {approvalChain.current_approver && expense.status === 'pending' && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 font-medium flex items-center gap-2">
                    <span>⏳</span>
                    Currently waiting on: {approvalChain.current_approver.approver.name || approvalChain.current_approver.approver.email?.split('@')[0]}
                  </p>
                  <p className="text-yellow-600 text-sm mt-1">
                    {approvalChain.current_approver.approver.job_title || 'Approver'} (Step {approvalChain.current_approver.step})
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
