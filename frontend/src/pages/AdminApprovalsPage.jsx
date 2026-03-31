import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { managerApi } from "../lib/api";
import { CheckCircle, XCircle, Clock, X, Star, Zap } from "lucide-react";

const CATEGORY_ICONS = {
  meals: "🍽️", travel: "✈️", accommodation: "🏨", transport: "🚗",
  office_supplies: "📎", entertainment: "🎬", communication: "📱",
  software: "💻", equipment: "🖥️", other: "📦"
};

export function AdminApprovalsPage() {
  const [expenses, setExpenses] = useState([]);
  const [specialExpenses, setSpecialExpenses] = useState([]);
  const [activeTab, setActiveTab] = useState("sequential");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState({ open: false, expense: null, action: null, type: null });
  const [comment, setComment] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [q, sq] = await Promise.all([
        managerApi.getQueue().catch(() => ({ expenses: [] })),
        managerApi.getSpecialQueue().catch(() => ({ expenses: [] })),
      ]);
      setExpenses(q.expenses || []);
      setSpecialExpenses(sq.expenses || []);
    } catch (err) { setError(err.message); }
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

  const openModal = (expense, action, type) => { setModal({ open: true, expense, action, type }); setComment(""); setError(null); };
  const closeModal = () => { setModal({ open: false, expense: null, action: null, type: null }); setComment(""); };

  const handleAction = async () => {
    if (!modal.expense || !modal.action) return;
    if (modal.action === "reject" && comment.trim().length < 20) { setError("Rejection reason must be at least 20 characters"); return; }
    setIsProcessing(true); setError(null);
    try {
      if (modal.type === "special") {
        if (modal.action === "approve") await managerApi.specialApprove(modal.expense.id, comment || null);
        else await managerApi.specialReject(modal.expense.id, comment.trim());
      } else {
        if (modal.action === "approve") await managerApi.approve(modal.expense.id, comment || null);
        else await managerApi.reject(modal.expense.id, comment.trim());
      }
      setToast(`Expense ${modal.action === "approve" ? "approved" : "rejected"} successfully`);
      closeModal(); loadAll();
      setTimeout(() => setToast(null), 4000);
    } catch (err) { setError(err.message); }
    finally { setIsProcessing(false); }
  };

  const currentExpenses = activeTab === "sequential" ? expenses : specialExpenses;
  const totalPending = expenses.length + specialExpenses.length;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <h1 className="page-title">Pending Approvals</h1>
          <p className="page-subtitle">{totalPending} expense{totalPending !== 1 ? "s" : ""} assigned to you for review</p>
        </motion.div>

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="toast mb-4">
              <CheckCircle size={16} style={{ color: "var(--success)" }} /> {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {error && !modal.open && <div className="alert alert-danger mb-4">{error}</div>}

        {/* Tabs */}
        <div className="tabs">
          <button onClick={() => setActiveTab("sequential")} className={`tab ${activeTab === "sequential" ? "tab-active" : ""}`}>
            Sequential
            {expenses.length > 0 && <span className="badge badge-accent ml-2" style={{ fontSize: "10px" }}>{expenses.length}</span>}
          </button>
          <button onClick={() => setActiveTab("special")} className={`tab ${activeTab === "special" ? "tab-active" : ""}`} style={{ ...(activeTab === "special" ? { color: "var(--purple)", borderBottomColor: "var(--purple)" } : {}) }}>
            <Star size={13} className="inline mr-1" />
            Special
            {specialExpenses.length > 0 && <span className="badge badge-purple ml-2" style={{ fontSize: "10px" }}>{specialExpenses.length}</span>}
          </button>
        </div>

        {activeTab === "special" && specialExpenses.length > 0 && (
          <div className="alert mb-4" style={{ background: "var(--purple-subtle)", color: "var(--purple)", border: "1px solid rgba(168,85,247,0.2)" }}>
            <Zap size={16} />
            <span>Your decision instantly resolves the expense — bypassing the sequential chain.</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="text-center"><div className="spinner spinner-lg mx-auto mb-3" /><p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading approvals...</p></div></div>
        ) : currentExpenses.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🎉</div><div className="empty-state-title">No pending approvals</div><div className="empty-state-text">You're all caught up!</div></div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Employee</th><th>Category</th><th>Amount</th><th>Submitted</th><th>Waiting</th><th>Type</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {currentExpenses.map((exp) => (
                    <tr key={exp.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-sm">{(exp.employee_name || "E")[0]}</div>
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
                      <td>{activeTab === "special" ? <span className="badge badge-purple"><Star size={10} />Special</span> : <span className="badge badge-accent">Sequential</span>}</td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openModal(exp, "approve", activeTab)} className={`btn btn-sm ${activeTab === "special" ? "" : "btn-success"}`}
                            style={activeTab === "special" ? { background: "var(--purple)", color: "white", borderColor: "var(--purple)" } : {}}>
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button onClick={() => openModal(exp, "reject", activeTab)} className="btn btn-danger btn-sm"><XCircle size={14} /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {modal.open && (
            <div className="modal-overlay" onClick={closeModal}>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="modal-title">{modal.action === "approve" ? "Approve Expense" : "Reject Expense"}</h3>
                    <p className="modal-description">{modal.expense?.description} — {formatCurrency(modal.expense?.converted_amount || modal.expense?.amount, modal.expense?.company_currency || modal.expense?.currency)}</p>
                  </div>
                  <button onClick={closeModal} className="btn btn-ghost" style={{ padding: 6 }}><X size={18} /></button>
                </div>
                {error && <div className="alert alert-danger mb-4 text-sm">{error}</div>}
                <div className="mb-5">
                  <label className="label">{modal.action === "reject" ? "Reason for rejection *" : "Comment (optional)"}</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={modal.action === "reject" ? "Explain why..." : "Add a comment..."} rows={3} className="input resize-none" />
                  {modal.action === "reject" && <p className="text-xs mt-1" style={{ color: comment.trim().length < 20 ? "var(--danger)" : "var(--success)" }}>{comment.trim().length}/20 minimum</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                  <button onClick={handleAction} disabled={isProcessing || (modal.action === "reject" && comment.trim().length < 20)}
                    className={`btn ${modal.action === "approve" ? "btn-success" : "btn-danger"}`}>
                    {isProcessing && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                    {isProcessing ? "Processing..." : modal.action === "approve" ? "Confirm Approve" : "Confirm Reject"}
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
