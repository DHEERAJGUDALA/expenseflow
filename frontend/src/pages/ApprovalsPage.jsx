import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { DashboardLayout } from "../components/DashboardLayout";
import { managerApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Clock, CheckCircle, XCircle, Search, Star, Calendar,
  DollarSign, ArrowRight, ShieldCheck, X, AlertCircle, Loader2
} from "lucide-react";

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
  
  // Modal State
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [comment, setComment] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true); setError(null);
    try {
      const [pendingData, specialData] = await Promise.all([
        managerApi.getQueue(),
        managerApi.getSpecialQueue().catch(() => ({ expenses: [] }))
      ]);
      setPendingExpenses(pendingData.expenses || []);
      setSpecialApproverQueue(specialData.expenses || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (amount, currency = "INR") => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount || 0); }
    catch { return `${currency} ${parseFloat(amount || 0).toFixed(2)}`; }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  const getWaitingTime = (createdAt) => {
    const diffMs = new Date() - new Date(createdAt);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
    if (diffHours > 0) return `${diffHours}h`;
    return "Just now";
  };

  const openApprovalModal = (expense, action) => {
    setSelectedExpense(expense);
    setActionType(action);
    setComment("");
    setShowModal(true);
  };

  const handleApproval = async () => {
    if (!selectedExpense || !actionType) return;
    if (actionType === "rejected" && comment.trim().length < 20) {
      setError("Rejection reason must be at least 20 characters"); return;
    }

    setProcessingId(selectedExpense.id);
    try {
      const isSpecial = selectedExpense.is_special_approver;
      if (actionType === "approved") {
        if (isSpecial) await managerApi.specialApprove(selectedExpense.id, comment);
        else await managerApi.approve(selectedExpense.id, comment);
      } else {
        if (isSpecial) await managerApi.specialReject(selectedExpense.id, comment.trim());
        else await managerApi.reject(selectedExpense.id, comment.trim());
      }
      
      await loadData();
      setShowModal(false);
    } catch (err) { setError(err.message); }
    finally { setProcessingId(null); }
  };

  const pendingCount = pendingExpenses.length;
  const specialCount = specialApproverQueue.length;
  const totalPendingAmount = pendingExpenses.reduce((sum, e) => sum + parseFloat(e.converted_amount || e.amount || 0), 0);

  const renderExpenseRow = (expense, isSpecial = false) => (
    <div key={expense.id} className="p-4 hover:bg-slate-50 transition-colors border-b last:border-0 border-slate-100 group">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="avatar avatar-lg rounded-xl flex items-center justify-center text-2xl shadow-sm border border-slate-100 bg-white">
            {CATEGORY_ICONS[expense.category] || "📦"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-slate-900 truncate" style={{ fontFamily: "var(--font-heading)" }}>
                {expense.employee_name || expense.user_email || "Employee"}
              </h3>
              {isSpecial && <span className="badge badge-accent text-[10px] py-0"><Star size={10} className="mr-1 inline"/> Special</span>}
            </div>
            <p className="text-sm text-slate-600 truncate mb-1">
              <span className="font-medium text-slate-800">{expense.description || "Expense"}</span>
              <span className="mx-2 text-slate-300">•</span>
              {expense.category?.replace(/_/g, " ")}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(expense.expense_date)}</span>
              <span className="flex items-center gap-1 text-amber-600"><Clock size={12} /> Waiting: {getWaitingTime(expense.created_at)}</span>
            </div>
          </div>
        </div>
        
        <div className="text-right sm:min-w-[120px]">
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
            {formatCurrency(expense.amount, expense.currency_code)}
          </p>
          {expense.converted_amount && expense.currency_code !== expense.company_currency_code && (
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              ≈ {formatCurrency(expense.converted_amount, expense.company_currency_code)}
            </p>
          )}
        </div>

        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => openApprovalModal(expense, "approved")} className="btn btn-success btn-sm flex-1 sm:flex-none">Approve</button>
          <button onClick={() => openApprovalModal(expense, "rejected")} className="btn btn-danger btn-sm flex-1 sm:flex-none">Reject</button>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <motion.div {...fadeIn(0)} className="page-header">
          <h1 className="page-title flex items-center gap-2">
            <ShieldCheck size={28} style={{ color: "var(--accent)" }} /> Approvals
          </h1>
          <p className="page-subtitle">Review and process expense requests from your team</p>
        </motion.div>

        {/* Stats */}
        <motion.div {...fadeIn(0.05)} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "My Queue", value: pendingCount, icon: Clock, color: "var(--warning)" },
            { label: "Special Queue", value: specialCount, icon: Star, color: "var(--purple)" },
            { label: "Pending Value", value: formatCurrency(totalPendingAmount), icon: DollarSign, color: "var(--accent)" },
            { label: "Processed Today", value: approvalHistory.filter(a => new Date(a.created_at).toDateString() === new Date().toDateString()).length, icon: CheckCircle, color: "var(--success)" }
          ].map(stat => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <stat.icon size={16} style={{ color: stat.color }} />
                <span className="stat-label" style={{ margin: 0 }}>{stat.label}</span>
              </div>
              <p className="stat-value" style={{ color: stat.color, fontSize: typeof stat.value === "number" ? "24px" : "18px" }}>{stat.value}</p>
            </div>
          ))}
        </motion.div>

        <motion.div {...fadeIn(0.1)} className="tabs mb-6">
          <button onClick={() => setActiveTab("pending")} className={`tab ${activeTab === "pending" ? "tab-active" : ""}`}>
            My Queue {pendingCount > 0 && <span className="ml-2 badge badge-warning py-0.5">{pendingCount}</span>}
          </button>
          <button onClick={() => setActiveTab("special")} className={`tab ${activeTab === "special" ? "tab-active" : ""}`}>
            Special Queue {specialCount > 0 && <span className="ml-2 badge badge-accent py-0.5" style={{ background: "var(--purple-subtle)", color: "var(--purple)" }}>{specialCount}</span>}
          </button>
          <button onClick={() => setActiveTab("history")} className={`tab ${activeTab === "history" ? "tab-active" : ""}`}>
            History
          </button>
        </motion.div>

        {error && <div className="alert alert-danger mb-4"><span className="flex-1">{error}</span><button onClick={()=>setError(null)}><X size={16}/></button></div>}

        <motion.div {...fadeIn(0.15)} className="card overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-slate-400" /></div>
          ) : activeTab === "pending" ? (
            pendingCount === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon text-green-500">🎉</div>
                <div className="empty-state-title">All caught up!</div>
                <div className="empty-state-text">No pending expenses in your approval queue.</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 text-sm" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold text-slate-800">{pendingCount} items</span> waiting for your approval
                </div>
                {pendingExpenses.map(e => renderExpenseRow(e, false))}
              </div>
            )
          ) : activeTab === "special" ? (
             specialCount === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon text-purple-500">⭐</div>
                <div className="empty-state-title">No special approvals</div>
                <div className="empty-state-text">Parallel queue for executives/directors is clear.</div>
              </div>
            ) : (
              <div className="divide-y divide-purple-100">
                <div className="px-5 py-3 border-b text-sm bg-purple-50/50 border-purple-100" style={{ color: "var(--purple)" }}>
                  <span className="font-bold">{specialCount} items</span> in your special approver queue
                </div>
                {specialApproverQueue.map(e => renderExpenseRow(e, true))}
              </div>
            )
          ) : (
             approvalHistory.length === 0 ? (
               <div className="empty-state">
                 <div className="empty-state-icon">📭</div>
                 <div className="empty-state-title">No history yet</div>
               </div>
             ) : (
               <div className="p-8 text-center text-slate-500">History UI pending implementation</div>
             )
          )}
        </motion.div>
      </div>

      {/* Approval Modal (Radix) */}
      <Dialog.Root open={showModal} onOpenChange={setShowModal}>
        <AnimatePresence>
          {showModal && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" asChild>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </Dialog.Overlay>
              <Dialog.Content className="fixed z-50 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-lg focus:outline-none" asChild>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                  <div className="bg-white rounded-2xl shadow-xl overflow-hidden p-6">
                    <div className="flex justify-between items-center mb-5">
                      <Dialog.Title className="text-xl font-bold font-heading flex items-center gap-2">
                        {actionType === "approved" ? <CheckCircle className="text-green-500" /> : <XCircle className="text-red-500" />}
                        {actionType === "approved" ? "Approve Expense" : "Reject Expense"}
                      </Dialog.Title>
                      <Dialog.Close asChild><button className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X size={20}/></button></Dialog.Close>
                    </div>

                    {selectedExpense && (
                      <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-slate-900">{selectedExpense.employee_name}</p>
                            <p className="text-sm font-medium text-slate-600">{selectedExpense.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-slate-900">{formatCurrency(selectedExpense.amount, selectedExpense.currency_code)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mb-6">
                      <label className="label">
                        {actionType === "approved" ? "Comment (Optional)" : "Rejection Reason *"}
                      </label>
                      <textarea
                        value={comment} onChange={(e) => setComment(e.target.value)}
                        placeholder={actionType === "approved" ? "Add an optional note..." : "Please provide a detailed reason (min 20 chars)..."}
                        className="input min-h-[100px] py-3 resize-none"
                      />
                      {actionType === "rejected" && (
                        <p className={`text-xs mt-1.5 font-medium ${comment.trim().length < 20 ? "text-red-500" : "text-green-600"}`}>
                          {comment.trim().length}/20 characters
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Dialog.Close asChild>
                        <button className="btn btn-secondary flex-1">Cancel</button>
                      </Dialog.Close>
                      <button
                        onClick={handleApproval}
                        disabled={processingId || (actionType === "rejected" && comment.trim().length < 20)}
                        className={`btn flex-1 ${actionType === "approved" ? "btn-success" : "btn-danger"}`}
                      >
                        {processingId ? <Loader2 size={18} className="animate-spin" /> : (actionType === "approved" ? "Approve" : "Reject")}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

    </DashboardLayout>
  );
}
