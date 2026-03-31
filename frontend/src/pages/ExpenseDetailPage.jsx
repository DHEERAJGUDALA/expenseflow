import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi } from "../lib/api";
import {
  ArrowLeft, Clock, CheckCircle, XCircle, DollarSign, Calendar,
  CreditCard, FileText, Check, X, ShieldAlert, Star, Paperclip, Loader2
} from "lucide-react";

const STATUS_ICONS = {
  pending: { icon: Clock, color: "var(--warning)", bg: "var(--warning-subtle)", badge: "badge-warning" },
  approved: { icon: CheckCircle, color: "var(--success)", bg: "var(--success-subtle)", badge: "badge-success" },
  rejected: { icon: XCircle, color: "var(--danger)", bg: "var(--danger-subtle)", badge: "badge-danger" },
  paid: { icon: DollarSign, color: "var(--accent)", bg: "var(--accent-subtle)", badge: "badge-accent" },
  locked: { icon: ShieldAlert, color: "var(--text-muted)", bg: "var(--bg-elevated)", badge: "badge-neutral" },
  skipped: { icon: ArrowLeft, color: "var(--text-muted)", bg: "var(--bg-elevated)", badge: "badge-neutral" }
};

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

export function ExpenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [approvalChain, setApprovalChain] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadExpense(); }, [id]);

  const loadExpense = async () => {
    setIsLoading(true); setError(null);
    try {
      const data = await expenseApi.getById(id);
      setExpense(data.expense);
      setApprovalChain(data.approval_chain);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
    catch { return `${currency} ${amount}`; }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  const formatDateTime = (dateStr) => new Date(dateStr).toLocaleString("en-IN", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: "var(--accent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Loading expense details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !expense) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="alert alert-danger">{error || "Expense not found"}</div>
          <button onClick={() => navigate(-1)} className="btn btn-secondary mt-4"><ArrowLeft size={16} /> Back</button>
        </div>
      </DashboardLayout>
    );
  }

  const statusInfo = STATUS_ICONS[expense.status] || STATUS_ICONS.pending;
  const StatusIcon = statusInfo.icon;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div {...fadeIn(0)} className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            onMouseOver={(e) => { e.currentTarget.style.background = "var(--border-subtle)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="page-title mb-0.5">Expense Details</h1>
            <p className="page-subtitle text-xs">Submitted on {formatDate(expense.created_at)}</p>
          </div>
          <span className={`badge ${statusInfo.badge} flex items-center gap-1.5 px-3 py-1.5 text-sm`}>
            <StatusIcon size={14} /> {expense.status?.charAt(0).toUpperCase() + expense.status?.slice(1)}
          </span>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
          <div className="space-y-6">
            {/* Overview Card */}
            <motion.div {...fadeIn(0.1)} className="card p-6 md:p-8">
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm flex-shrink-0" style={{ background: "var(--bg-elevated)" }}>
                  {CATEGORY_ICONS[expense.category] || "📦"}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="text-xl font-bold truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                    {expense.description || "Expense"}
                  </h2>
                  <p className="text-sm capitalize mt-1" style={{ color: "var(--text-muted)" }}>
                    {expense.category?.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="text-right pt-1 flex-shrink-0">
                  <p className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                    {formatCurrency(expense.amount, expense.currency)}
                  </p>
                  {expense.converted_amount && expense.currency !== expense.company_currency && (
                    <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-muted)" }}>
                      ≈ {formatCurrency(expense.converted_amount, expense.company_currency)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Merchant</p>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{expense.paid_by || expense.merchant_name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Date</p>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{formatDate(expense.expense_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Currency</p>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{expense.currency}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Submitted</p>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{formatDate(expense.created_at)}</p>
                </div>
              </div>

              {expense.remarks && (
                <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <FileText size={14} /> Remarks
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{expense.remarks}</p>
                </div>
              )}

              {expense.status === 'paid' && expense.payment_cycle && (
                <div className="mt-6 alert" style={{ background: "var(--accent-subtle)", color: "var(--accent)", border: "none" }}>
                  <DollarSign size={18} />
                  <div>
                    <p className="font-semibold text-sm">Payment Processed</p>
                    <p className="text-xs mt-0.5 opacity-80">Paid on {formatDate(expense.payment_cycle.process_date)}</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Receipt Image */}
            {expense.receipt_url && (
              <motion.div {...fadeIn(0.15)} className="card p-6 text-center">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 justify-center" style={{ color: "var(--text-primary)" }}>
                  <Paperclip size={16} /> Attached Receipt
                </h3>
                <div className="bg-slate-50 border rounded-xl overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
                  <img src={expense.receipt_url} alt="Receipt" className="w-full max-h-96 object-contain" />
                </div>
                <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-4 w-full">View Full Size</a>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            {/* Approval Tracking */}
            {approvalChain && (
              <motion.div {...fadeIn(0.2)} className="card p-6">
                <h3 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Approval Progress</h3>
                {approvalChain.applied_rule_name && (
                  <p className="text-xs font-semibold mb-5" style={{ color: "var(--text-muted)" }}>Rule: {approvalChain.applied_rule_name}</p>
                )}

                {approvalChain.steps && approvalChain.steps.length > 0 && (
                  <div className="mb-8">
                    <div className="flex justify-between text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                      <span>Step {approvalChain.summary.completed_steps} of {approvalChain.summary.total_steps}</span>
                      <span>{approvalChain.summary.total_steps > 0 ? Math.round((approvalChain.summary.completed_steps / approvalChain.summary.total_steps) * 100) : 0}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${approvalChain.summary.total_steps > 0 ? (approvalChain.summary.completed_steps / approvalChain.summary.total_steps) * 100 : 0}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    </div>
                  </div>
                )}

                {/* Vertical Timeline */}
                {approvalChain.steps && approvalChain.steps.length > 0 && (
                  <div className="relative pt-2">
                    <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: "var(--border-subtle)" }} />
                    <div className="space-y-6 relative">
                      {approvalChain.steps.map((step, idx) => {
                        const sInfo = STATUS_ICONS[step.status] || STATUS_ICONS.locked;
                        const SIcon = sInfo.icon;
                        return (
                          <div key={idx} className="relative flex gap-4 items-start">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                              style={{ background: step.status === "pending" ? "var(--bg-card)" : sInfo.bg, color: sInfo.color, border: step.status === "pending" ? `2px solid ${sInfo.color}` : "none" }}>
                              <SIcon size={14} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <div className="flex justify-between items-start mb-1">
                                <div>
                                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{step.approver.name || step.approver.email?.split('@')[0]}</p>
                                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{step.approver.job_title || 'Approver'}</p>
                                </div>
                                <span className={`badge ${sInfo.badge} text-[10px]`}>{step.status}</span>
                              </div>
                              {step.actioned_at && (
                                <div className="mt-2 p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                                  <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>{formatDateTime(step.actioned_at)}</p>
                                  {step.comment && <p className="text-xs italic" style={{ color: "var(--text-secondary)" }}>"{step.comment}"</p>}
                                </div>
                              )}
                              {step.status === 'pending' && (
                                <p className="text-xs font-medium mt-2 flex items-center gap-1.5" style={{ color: "var(--warning)" }}>
                                  <Clock size={12} className="animate-spin-slow" /> Waiting for review
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {approvalChain.special_approver && (
                  <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <Star size={14} /> Special Approver <span className="text-[10px] font-medium opacity-70">(Can resolve anytime)</span>
                    </p>
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ border: "1px solid rgba(168,85,247,0.2)", background: "var(--purple-subtle)" }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, var(--purple), #c084fc)" }}>
                        <Star size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--purple)" }}>{approvalChain.special_approver.name || approvalChain.special_approver.email?.split('@')[0]}</p>
                        <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--purple)", opacity: 0.8 }}>{approvalChain.special_approver.job_title || 'Special Approver'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
