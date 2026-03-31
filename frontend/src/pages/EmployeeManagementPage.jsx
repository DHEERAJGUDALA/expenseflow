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

  // Form state
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    role: "employee",
    department: "",
    manager_id: "",
    is_manager_approver: false
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
      full_name: "",
      role: "employee",
      department: "",
      manager_id: "",
      is_manager_approver: false
    });
    setModalMode("create");
    setShowModal(true);
    setError(null);
  };

  const openEditModal = (employee) => {
    setFormData({
      email: employee.email,
      full_name: employee.full_name,
      role: employee.role,
      department: employee.department || "",
      manager_id: employee.manager_id || "",
      is_manager_approver: employee.is_manager_approver || false
    });
    setSelectedEmployee(employee);
    setModalMode("edit");
    setShowModal(true);
    setError(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (modalMode === "create") {
        await employeeApi.create(formData);
        setSuccess("Employee created and invite sent!");
      } else {
        await employeeApi.update(selectedEmployee.id, formData);
        setSuccess("Employee updated successfully!");
      }
      closeModal();
      loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (employee) => {
    if (!confirm(`Are you sure you want to remove ${employee.full_name}?`)) {
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
            ➕ Add Employee
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

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
              <span className="animate-spin inline-block text-2xl mb-2">⏳</span>
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
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Department</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Manager</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Approver</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map(employee => (
                  <tr key={employee.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-medium text-slate-600">
                          {employee.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{employee.full_name}</p>
                          <p className="text-sm text-slate-500">{employee.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${ROLE_COLORS[employee.role]}`}>
                        {employee.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {employee.department || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {employee.manager?.full_name || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {employee.is_manager_approver ? (
                        <span className="text-green-600">✅</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditModal(employee)}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-medium mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(employee)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Remove
                      </button>
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
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
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
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    placeholder="e.g., Engineering"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Manager
                </label>
                <select
                  name="manager_id"
                  value={formData.manager_id}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">No manager</option>
                  {managers.map(mgr => (
                    <option key={mgr.id} value={mgr.id}>
                      {mgr.full_name} ({mgr.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_manager_approver"
                  id="is_manager_approver"
                  checked={formData.is_manager_approver}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="is_manager_approver" className="text-sm text-slate-700">
                  Manager must approve this employee's expenses first
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {modalMode === "create" ? "Send Invite" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
