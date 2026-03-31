import { useState, useEffect } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { employeeApi } from "../lib/api";

const ROLE_COLORS = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  employee: "bg-slate-100 text-slate-700"
};

export function EmployeeManagementPage() {
  const [employees, setEmployees] = useState([]);
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create or edit
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  // Form state - matches database schema
  const [formData, setFormData] = useState({
    email: "",
    role: "employee",
    manager_id: "",
    full_name: "",
    job_title: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [empData, mgrData] = await Promise.all([
        employeeApi.getAll(),
        employeeApi.getManagers()
      ]);
      setEmployees(empData.employees || []);
      setManagers(mgrData.managers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData({
      email: "",
      role: "employee",
      manager_id: "",
      full_name: "",
      job_title: ""
    });
    setModalMode("create");
    setShowModal(true);
    setError(null);
  };

  const openEditModal = (employee) => {
    setFormData({
      email: employee.email,
      role: employee.role,
      manager_id: employee.manager_id || "",
      full_name: employee.full_name || "",
      job_title: employee.job_title || ""
    });
    setSelectedEmployee(employee);
    setModalMode("edit");
    setShowModal(true);
    setError(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (modalMode === "create") {
        const result = await employeeApi.create({
          email: formData.email,
          role: formData.role,
          manager_id: formData.manager_id || null,
          full_name: formData.full_name || null,
          job_title: formData.job_title || null
        });
        
        if (result.resetEmailSent) {
          setSuccess(`Employee created! A password reset link has been sent to ${formData.email}`);
        } else {
          setSuccess("Employee created! Please send them a password reset link manually.");
        }
      } else {
        await employeeApi.update(selectedEmployee.id, {
          role: formData.role,
          manager_id: formData.manager_id || null
        });
        setSuccess("Employee updated successfully!");
      }
      closeModal();
      loadData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendPasswordReset = async (employee) => {
    setResendingId(employee.id);
    try {
      await employeeApi.resendPasswordReset(employee.id);
      setSuccess(`Password reset link sent to ${employee.email}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (employee) => {
    if (!confirm(`Are you sure you want to remove ${employee.email}?`)) {
      return;
    }

    try {
      await employeeApi.delete(employee.id);
      setSuccess("Employee removed successfully!");
      loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper to get display name
  const getDisplayName = (employee) => {
    if (employee.full_name) return employee.full_name;
    return employee.email?.split("@")[0] || "Unknown";
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Employee Management</h1>
            <p className="text-slate-600">Manage team members, roles, and reporting structure</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            + Add Employee
          </button>
        </div>

        {/* Alerts */}
        {error && !showModal && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">x</button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex justify-between items-center">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">x</button>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <span className="font-medium">How onboarding works:</span> When you add an employee, they'll receive an email with a link to set their password. 
            If they didn't receive it, use the "Resend Password" button.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">Total Employees</p>
            <p className="text-2xl font-bold text-slate-900">{employees.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">Admins</p>
            <p className="text-2xl font-bold text-purple-600">
              {employees.filter(e => e.role === "admin").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">Managers</p>
            <p className="text-2xl font-bold text-blue-600">
              {employees.filter(e => e.role === "manager").length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500">Employees</p>
            <p className="text-2xl font-bold text-slate-600">
              {employees.filter(e => e.role === "employee").length}
            </p>
          </div>
        </div>

        {/* Employee List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <span className="animate-spin inline-block text-2xl mb-2">...</span>
              <p>Loading employees...</p>
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-4xl mb-2 block">👥</span>
              <p>No employees found. Add your first team member!</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Employee</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Manager</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map(employee => (
                  <tr key={employee.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-medium text-slate-600">
                          {getDisplayName(employee)?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{getDisplayName(employee)}</p>
                          <p className="text-sm text-slate-500">{employee.email}</p>
                          {employee.job_title && (
                            <p className="text-xs text-slate-400">{employee.job_title}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${ROLE_COLORS[employee.role]}`}>
                        {employee.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {employee.manager?.email ? getDisplayName(employee.manager) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">
                      {new Date(employee.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleResendPasswordReset(employee)}
                          disabled={resendingId === employee.id}
                          className="text-amber-600 hover:text-amber-700 text-sm font-medium disabled:opacity-50"
                          title="Resend password reset email"
                        >
                          {resendingId === employee.id ? "Sending..." : "Reset Pwd"}
                        </button>
                        <button
                          onClick={() => openEditModal(employee)}
                          className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(employee)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">
                {modalMode === "create" ? "Add New Employee" : "Edit Employee"}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {modalMode === "create" 
                  ? "A password reset link will be sent to the new employee" 
                  : "Update employee role and manager assignment"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {modalMode === "create" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      placeholder="John Doe"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Job Title
                    </label>
                    <input
                      type="text"
                      name="job_title"
                      value={formData.job_title}
                      onChange={handleInputChange}
                      placeholder="Software Engineer"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={modalMode === "edit"}
                  placeholder="employee@company.com"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500"
                  required
                />
                {modalMode === "edit" && (
                  <p className="text-xs text-slate-500 mt-1">Email cannot be changed after creation</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Role *
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {formData.role === "admin" && "Admins can manage all employees and expenses"}
                  {formData.role === "manager" && "Managers can approve their team's expenses"}
                  {formData.role === "employee" && "Employees can submit and track their expenses"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reports To (Manager)
                </label>
                <select
                  name="manager_id"
                  value={formData.manager_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">No manager assigned</option>
                  {managers
                    .filter(mgr => modalMode === "create" || mgr.id !== selectedEmployee?.id)
                    .map(mgr => (
                      <option key={mgr.id} value={mgr.id}>
                        {mgr.full_name || mgr.email?.split("@")[0]} ({mgr.role})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting 
                    ? "Processing..." 
                    : modalMode === "create" 
                      ? "Add & Send Invite" 
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
