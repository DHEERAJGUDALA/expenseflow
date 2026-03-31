import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { managerApi } from "../lib/api";
import { Star, CheckCircle, XCircle, Clock, X, Zap } from "lucide-react";

const CATEGORY_ICONS = {
  meals: "🍽️", travel: "✈️", accommodation: "🏨", transport: "🚗",
  office_supplies: "📎", entertainment: "🎬", communication: "📱",
  software: "💻", equipment: "🖥️", other: "📦"
};

export function ManagerSpecialQueuePage() {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ open: false, expense: null, action: null });
  const [comment, setComment] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => { loadQueue(); }, []);

  const loadQueue = async () => {
    setIsLoading(true);
    try { const data = await managerApi.getSpecialQueue(); setExpenses(data.expenses || []); }
    catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
    catch { return `${currency} ${parseFloat(amount).toFixed(2)}`; }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  const getWaitingTime = (createdAt) => {
    const ms = Date.now() - new Date(createdAt).getTime();
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "Just now";
  };

  const openModal = (expense, action) => { setModal({ open: true, expense, action }); setComment(""); setError(null); };
  const closeModal = () => { setModal({ open: false, expense: null, action: null }); setComment(""); };

  const handleAction = async () => {
    if (!modal.expense || !modal.action) return;
    if (modal.action === "reject" && comment.trim().length < 20) { setError("Rejection reason must be at least 20 characters"); return; }
    setIsProcessing(true); setError(null);
    try {
      if (modal.action === "approve") await managerApi.specialApprove(modal.expense.id, comment || null);
      else await managerApi.specialReject(modal.expense.id, comment.trim());
      setToast(`Special expense ${modal.action === "approve" ? "approved" : "rejected"} successfully`);
      closeModal(); loadQueue();
      setTimeout(() => setToast(null), 4000);
    } catch (err) { setError(err.message); }
    finally { setIsProcessing(false); }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <h1 className="page-title flex items-center gap-2">
            <Star size={22} style={{ color: "var(--purple)" }} />
            Special Approvals
          </h1>
          <p className="page-subtitle">{expenses.length} special expense{expenses.length !== 1 ? "s" : ""} waiting for your decision</p>
        </motion.div>

        {/* Banner */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="alert mb-6" style={{ background: "var(--purple-subtle)", color: "var(--purple)", border: "1px solid rgba(168,85,247,0.2)" }}
        >
          <Zap size={16} />
          <div>
            <p className="font-semibold mb-0.5" style={{ fontSize: "13px" }}>Special Approver Privileges</p>
            <p style={{ fontSize: "12px", opacity: 0.8 }}>Your approval or rejection instantly resolves the expense, bypassing any pending approvers.</p>
          </div>
        </motion.div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="toast mb-4">
              <CheckCircle size={16} style={{ color: "var(--success)" }} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {error && !modal.open && <div className="alert alert-danger mb-4">{error}</div>}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="text-center"><div className="spinner spinner-lg mx-auto mb-3" /><p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading special queue...</p></div></div>
        ) : expenses.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🙌</div><div className="empty-state-title">No special approvals pending</div><div className="empty-state-text">You have no items requiring special approval.</div></div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Employee</th><th>Category</th><th>Amount</th><th>Submitted</th><th>Waiting</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-sm" style={{ background: "linear-gradient(135deg, var(--purple), #c084fc)" }}>{(exp.employee_name || "E")[0]}</div>
                          <div>
                            <p className="font-medium" style={{ color: "var(--text-primary)" }}>{exp.employee_name || "Employee"}</p>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{exp.employee_job_title || exp.employee_email}</p>
                          </div>
                        </div>
                      </td>
                      <td><span className="inline-flex items-center gap-1.5"><span>{CATEGORY_ICONS[exp.category] || "📦"}</span><span className="capitalize">{exp.category?.replace(/_/g, " ")}</span></span></td>
                      <td>
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(exp.converted_amount || exp.amount, exp.company_currency || exp.currency)}</p>
                        {exp.converted_amount && exp.currency !== exp.company_currency && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{formatCurrency(exp.amount, exp.currency)}</p>}
                      </td>
                      <td>{formatDate(exp.expense_date || exp.created_at)}</td>
                      <td><span className="badge badge-warning"><Clock size={10} />{getWaitingTime(exp.created_at)}</span></td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openModal(exp, "approve")} className="btn btn-sm" style={{ background: "var(--purple)", color: "white", borderColor: "var(--purple)" }}><Star size={14} /> Approve</button>
                          <button onClick={() => openModal(exp, "reject")} className="btn btn-danger btn-sm"><XCircle size={14} /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Modal */}
        <AnimatePresence>
          {modal.open && (
            <div className="modal-overlay" onClick={closeModal}>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="modal-title">{modal.action === "approve" ? "Special Approve" : "Special Reject"}</h3>
                    <p className="modal-description">{modal.expense?.description} — {formatCurrency(modal.expense?.converted_amount || modal.expense?.amount, modal.expense?.company_currency || modal.expense?.currency)}</p>
                  </div>
                  <button onClick={closeModal} className="btn btn-ghost" style={{ padding: 6 }}><X size={18} /></button>
                </div>
                {error && <div className="alert alert-danger mb-4 text-sm">{error}</div>}
                <div className="mb-5">
                  <label className="label">{modal.action === "reject" ? "Reason for rejection *" : "Comment (optional)"}</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={modal.action === "reject" ? "Explain why this expense is being rejected..." : "Add a comment..."} rows={3} className="input resize-none" />
                  {modal.action === "reject" && <p className="text-xs mt-1" style={{ color: comment.trim().length < 20 ? "var(--danger)" : "var(--success)" }}>{comment.trim().length}/20 characters minimum</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button onClick={handleAction} disabled={isProcessing || (modal.action === "reject" && comment.trim().length < 20)}
                    className="btn" style={{ background: modal.action === "approve" ? "var(--purple)" : "var(--danger)", color: "white", borderColor: modal.action === "approve" ? "var(--purple)" : "var(--danger)" }}>
                    {isProcessing && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                    {isProcessing ? "Processing..." : modal.action === "approve" ? "Confirm Special Approval" : "Confirm Special Rejection"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
