import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { DashboardLayout } from "../components/DashboardLayout";
import { employeeApi } from "../lib/api";
import {
  Users, UserPlus, Settings, Shield, Edit3, Trash2, Mail, Copy, Loader2, X, CheckCircle, AlertCircle
} from "lucide-react";

const ROLE_COLORS = {
  admin: { bg: "var(--purple-subtle)", text: "var(--purple)", badge: "badge-accent" },
  manager: { bg: "var(--warning-subtle)", text: "var(--warning)", badge: "badge-warning" },
  employee: { bg: "var(--bg-elevated)", text: "var(--text-secondary)", badge: "badge-neutral" }
};

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function EmployeeManagementPage() {
  const [employees, setEmployees] = useState([]);
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    email: "", password: "", role: "employee", manager_id: "", full_name: "", job_title: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true); setError(null);
    try {
      const [empData, mgrData] = await Promise.all([
        employeeApi.getAll(),
        employeeApi.getManagers()
      ]);
      setEmployees(empData.employees || []);
      setManagers(mgrData.managers || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const openCreateModal = () => {
    setFormData({ email: "", password: "", role: "employee", manager_id: "", full_name: "", job_title: "" });
    setModalMode("create"); setShowModal(true); setError(null);
  };

  const openEditModal = (employee) => {
    setFormData({
      email: employee.email, role: employee.role,
      manager_id: employee.manager_id || "",
      full_name: employee.full_name || "",
      job_title: employee.job_title || ""
    });
    setSelectedEmployee(employee); setModalMode("edit"); setShowModal(true); setError(null);
  };

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null); setIsSubmitting(true);
    try {
      if (modalMode === "create") {
        const payload = {
          email: formData.email, role: formData.role,
          manager_id: formData.manager_id || null,
          full_name: formData.full_name || null,
          job_title: formData.job_title || null
        };
        if (formData.password.trim()) payload.password = formData.password;
        
        const result = await employeeApi.create(payload);
        if (result.passwordSetByAdmin) setSuccess(`Employee created! Password has been set.`);
        else if (result.resetEmailSent) setSuccess(`Employee created! Invite link sent to ${formData.email}`);
        else setSuccess("Employee created!");
      } else {
        await employeeApi.update(selectedEmployee.id, {
          role: formData.role, manager_id: formData.manager_id || null
        });
        setSuccess("Employee updated successfully!");
      }
      setShowModal(false); loadData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) { setError(err.message); }
    finally { setIsSubmitting(false); }
  };

  const handleResendPasswordReset = async (employee) => {
    setResendingId(employee.id);
    try {
      await employeeApi.resendPasswordReset(employee.id);
      setSuccess(`Password reset link sent to ${employee.email}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) { setError(err.message); }
    finally { setResendingId(null); }
  };

  const handleDelete = async (employee) => {
    if (!confirm(`Are you sure you want to remove ${employee.email}?`)) return;
    try {
      await employeeApi.delete(employee.id);
      setSuccess("Employee removed successfully!");
      loadData(); setTimeout(() => setSuccess(null), 3000);
    } catch (err) { setError(err.message); }
  };

  const getDisplayName = (employee) => employee.full_name || employee.email?.split("@")[0] || "Unknown";

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <motion.div {...fadeIn(0)} className="page-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Users size={24} style={{ color: "var(--accent)" }} /> Employee Management
            </h1>
            <p className="page-subtitle">Manage team members, roles, and reporting relationships.</p>
          </div>
          <button onClick={openCreateModal} className="btn btn-primary shadow-lg shadow-indigo-500/25">
            <UserPlus size={18} /> Add Employee
          </button>
        </motion.div>

        <AnimatePresence>
          {error && !showModal && (
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

        <motion.div {...fadeIn(0.05)} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Employees", value: employees.length, icon: Users, color: "var(--text-primary)" },
            { label: "Admins", value: employees.filter(e => e.role === "admin").length, icon: Shield, color: "var(--purple)" },
            { label: "Managers", value: employees.filter(e => e.role === "manager").length, icon: Settings, color: "var(--warning)" },
            { label: "Staff", value: employees.filter(e => e.role === "employee").length, icon: Users, color: "var(--text-secondary)" }
          ].map(stat => (
             <div key={stat.label} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <stat.icon size={16} style={{ color: stat.color }} />
                <span className="stat-label" style={{ margin: 0 }}>{stat.label}</span>
              </div>
              <p className="stat-value" style={{ color: stat.color, fontSize: "24px" }}>{stat.value}</p>
            </div>
          ))}
        </motion.div>

        <motion.div {...fadeIn(0.1)} className="table-container">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-slate-400" /></div>
          ) : employees.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">No employees found</div>
              <div className="empty-state-text">Add your first team member to get started.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Manager</th>
                    <th>Joined</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(employee => {
                    const rColor = ROLE_COLORS[employee.role] || ROLE_COLORS.employee;
                    return (
                      <tr key={employee.id} className="group">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="avatar avatar-sm">{getDisplayName(employee).charAt(0).toUpperCase()}</div>
                            <div>
                              <p className="font-bold text-[13px]" style={{ color: "var(--text-primary)" }}>{getDisplayName(employee)}</p>
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{employee.email}</p>
                              {employee.job_title && <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: "var(--text-placeholder)" }}>{employee.job_title}</p>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${rColor.badge} capitalize text-[10px]`}>{employee.role}</span>
                        </td>
                        <td>
                          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                            {employee.manager?.email ? getDisplayName(employee.manager) : <span className="text-slate-300">-</span>}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {new Date(employee.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleResendPasswordReset(employee)} disabled={resendingId === employee.id} className="btn btn-ghost btn-sm px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title="Resend password reset">
                              {resendingId === employee.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            </button>
                            <button onClick={() => openEditModal(employee)} className="btn btn-ghost btn-sm px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDelete(employee)} className="btn btn-ghost btn-sm px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Modal - Radix */}
      <Dialog.Root open={showModal} onOpenChange={setShowModal}>
        <AnimatePresence>
          {showModal && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" asChild>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </Dialog.Overlay>
              <Dialog.Content className="fixed z-50 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md focus:outline-none" asChild>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                  <div className="bg-white rounded-2xl shadow-xl overflow-hidden p-6 md:p-8">
                    <div className="flex justify-between items-center mb-6">
                      <Dialog.Title className="text-xl font-bold font-heading">
                        {modalMode === "create" ? "Add Team Member" : "Edit Employee"}
                      </Dialog.Title>
                      <Dialog.Close asChild><button className="text-slate-400 hover:text-slate-600"><X size={20}/></button></Dialog.Close>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      {error && <div className="alert alert-danger p-2 border-red-200 text-red-700"><AlertCircle size={14} /> <span className="text-xs">{error}</span></div>}
                      
                      {modalMode === "create" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label">Full Name</label>
                            <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="John Doe" className="input" />
                          </div>
                          <div>
                            <label className="label">Job Title</label>
                            <input type="text" name="job_title" value={formData.job_title} onChange={handleInputChange} placeholder="Engineer" className="input" />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="label">Email *</label>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} disabled={modalMode === "edit"} placeholder="employee@company.com" className="input disabled:bg-slate-50 disabled:text-slate-400" required />
                      </div>

                      {modalMode === "create" && (
                        <div>
                          <label className="label">Temporary Password</label>
                          <input type="password" name="password" value={formData.password} onChange={handleInputChange} placeholder="Leave blank for email invite" className="input" minLength={6} />
                          <p className="text-[10px] mt-1 text-slate-500">Leaving this blank sends a reset link to the user's email.</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Role *</label>
                          <select name="role" value={formData.role} onChange={handleInputChange} className="input px-3">
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Assigned Manager</label>
                          <select name="manager_id" value={formData.manager_id} onChange={handleInputChange} className="input px-3">
                            <option value="">None</option>
                            {managers.map(m => <option key={m.id} value={m.id}>{getDisplayName(m)}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6">
                        <Dialog.Close asChild>
                          <button type="button" className="btn btn-secondary flex-1">Cancel</button>
                        </Dialog.Close>
                        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
                          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (modalMode === "create" ? "Add Member" : "Save Changes")}
                        </button>
                      </div>
                    </form>
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
