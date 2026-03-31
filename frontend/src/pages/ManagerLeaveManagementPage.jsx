import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import { escalationApi, employeeApi } from "../lib/api";
import { 
  Calendar, AlertCircle, CheckCircle, UserX, UserCheck, 
  ArrowRight, Clock, ShieldAlert, X
} from "lucide-react";

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function ManagerLeaveManagementPage() {
  const [managers, setManagers] = useState([]);
  const [managersOnLeave, setManagersOnLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Leave form state
  const [selectedManager, setSelectedManager] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [allEmployees, onLeave] = await Promise.all([
        employeeApi.getAll(),
        escalationApi.getManagersOnLeave()
      ]);

      const managersList = allEmployees.employees?.filter(e => e.role === "manager") || [];
      setManagers(managersList);
      setManagersOnLeave(onLeave.managers || []);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load manager data");
    } finally { setLoading(false); }
  };

  const handleSetLeave = async (e) => {
    e.preventDefault();
    if (!selectedManager || !leaveStartDate || !leaveEndDate) {
      setError("Please fill all required fields"); return;
    }
    const start = new Date(leaveStartDate);
    const end = new Date(leaveEndDate);

    if (end <= start) {
      setError("End date must be after start date"); return;
    }

    setSubmittingLeave(true); setError(null); setSuccess(null);
    try {
      await escalationApi.setManagerLeave(selectedManager, leaveStartDate, leaveEndDate);
      setSuccess("Manager marked on leave. Approvals will be auto-escalated.");
      
      setSelectedManager(""); setLeaveStartDate(""); setLeaveEndDate("");
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to set manager on leave");
    } finally { setSubmittingLeave(false); }
  };

  const handleRemoveLeave = async (managerId) => {
    if (!confirm("Return manager from leave? They will resume standard approval duties.")) return;
    setError(null); setSuccess(null);
    try {
      await escalationApi.removeManagerLeave(managerId);
      setSuccess("Manager returned from leave successfully.");
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to return manager from leave");
    }
  };

  const availableManagers = managers.filter(m => !managersOnLeave.some(mol => mol.id === m.id));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <motion.div {...fadeIn(0)} className="page-header mb-8">
          <h1 className="page-title flex items-center gap-2">
            <Calendar size={24} style={{ color: "var(--accent)" }} /> Leave Management
          </h1>
          <p className="page-subtitle">Set managers on leave to automatically route approvals to admins.</p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-danger mb-6 flex justify-between">
              <span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span>
              <button onClick={() => setError(null)}><X size={16}/></button>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-success mb-6 flex justify-between">
              <span className="flex items-center gap-2"><CheckCircle size={16} />{success}</span>
              <button onClick={() => setSuccess(null)}><X size={16}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex justify-center py-20"><div className="spinner spinner-lg text-slate-400" /></div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
            {/* Setting Leave */}
            <motion.div {...fadeIn(0.1)} className="lg:col-span-2">
              <div className="card h-full">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                    <UserX size={18} className="text-orange-500" /> Schedule Manager Leave
                  </h2>
                </div>
                
                <div className="p-6">
                  {availableManagers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium text-slate-500">All managers are on leave or none exist.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSetLeave} className="space-y-5">
                      <div>
                        <label className="label">Select Manager</label>
                        <select value={selectedManager} onChange={e => setSelectedManager(e.target.value)} className="input" required>
                          <option value="">-- Choose --</option>
                          {availableManagers.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label">Start Date</label>
                          <input type="date" value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="input" required />
                        </div>
                        <div>
                          <label className="label">End Date</label>
                          <input type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} min={leaveStartDate || new Date().toISOString().split("T")[0]} className="input" required />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button type="submit" disabled={submittingLeave} className="btn w-full bg-orange-600 hover:bg-orange-700 text-white border-0 shadow-lg shadow-orange-500/20">
                          {submittingLeave ? "Processing..." : "Set Manager on Leave"}
                        </button>
                      </div>

                      <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg flex items-start gap-2">
                        <ShieldAlert className="text-orange-600 w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-orange-900 leading-tight font-medium">
                          Setting leave will immediately reroute any existing and new pending approvals for this manager to the Admin Queue.
                        </p>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Currently On Leave */}
            <motion.div {...fadeIn(0.2)} className="lg:col-span-3">
              <div className="card h-full">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h2 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                    <Calendar size={18} className="text-blue-500" /> Active Leaves
                  </h2>
                  <span className="badge bg-blue-100 text-blue-700 font-bold">{managersOnLeave.length}</span>
                </div>

                <div className="p-6">
                  {managersOnLeave.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon text-green-500"><UserCheck /></div>
                      <div className="empty-state-title">All Managers Available</div>
                      <div className="empty-state-text">No managers are currently scheduled for leave.</div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {managersOnLeave.map(manager => {
                        const endDate = new Date(manager.leave_end_date);
                        const today = new Date();
                        const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                        const isExpired = daysLeft <= 0;

                        return (
                          <div key={manager.id} className="relative p-5 rounded-xl border border-orange-200 bg-orange-50/30 overflow-hidden group">
                            {isExpired && <div className="absolute top-0 right-0 left-0 h-1 bg-red-500" />}
                            
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className="avatar avatar-sm bg-orange-100 text-orange-700 font-bold border border-orange-200">
                                  {(manager.full_name || manager.email)[0].toUpperCase()}
                                </div>
                                <div>
                                  <h3 className="font-bold text-sm text-slate-900">{manager.full_name || manager.email}</h3>
                                  <p className="text-xs text-slate-500">{manager.email}</p>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveLeave(manager.id)} className="btn btn-sm btn-ghost text-orange-700 hover:bg-orange-100">
                                Return
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 p-3 bg-white/60 rounded-lg border border-orange-100/50 mb-3">
                              <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Start Date</p>
                                <p className="text-sm font-semibold text-slate-800">{new Date(manager.leave_start_date).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">End Date</p>
                                <p className="text-sm font-semibold text-slate-800">{endDate.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</p>
                              </div>
                            </div>

                            <div className="flex items-center">
                              {isExpired ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-100 text-red-700 text-xs font-bold">
                                  <AlertCircle size={12} /> Leave period ended
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-100 text-orange-800 text-xs font-bold">
                                  <Clock size={12} /> {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
