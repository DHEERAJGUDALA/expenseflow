import { useState, useEffect } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { escalationApi, employeeApi } from "../lib/api";
import { Calendar, AlertCircle, CheckCircle, UserX, UserCheck } from "lucide-react";

export function ManagerLeaveManagementPage() {
  const [managers, setManagers] = useState([]);
  const [managersOnLeave, setManagersOnLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Leave form state
  const [selectedManager, setSelectedManager] = useState(null);
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allEmployees, onLeave] = await Promise.all([
        employeeApi.getAll(),
        escalationApi.getManagersOnLeave()
      ]);

      // Filter to only managers
      const managersList = allEmployees.employees?.filter(e => e.role === "manager") || [];
      setManagers(managersList);
      setManagersOnLeave(onLeave.managers || []);
    } catch (err) {
      console.error("Failed to fetch manager data:", err);
      setError(err.message || "Failed to load manager data");
    } finally {
      setLoading(false);
    }
  };

  const handleSetLeave = async (e) => {
    e.preventDefault();
    
    if (!selectedManager) {
      setError("Please select a manager");
      return;
    }

    if (!leaveStartDate || !leaveEndDate) {
      setError("Please select both start and end dates");
      return;
    }

    const start = new Date(leaveStartDate);
    const end = new Date(leaveEndDate);

    if (end <= start) {
      setError("End date must be after start date");
      return;
    }

    setSubmittingLeave(true);
    setError(null);
    setSuccess(null);

    try {
      await escalationApi.setManagerLeave(
        selectedManager,
        leaveStartDate,
        leaveEndDate
      );

      setSuccess(`Manager marked on leave successfully. Pending approvals have been escalated to admin.`);
      
      // Reset form
      setSelectedManager(null);
      setLeaveStartDate("");
      setLeaveEndDate("");

      // Refresh data
      await fetchData();
    } catch (err) {
      console.error("Failed to set manager on leave:", err);
      setError(err.message || "Failed to set manager on leave");
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleRemoveLeave = async (managerId) => {
    if (!confirm("Remove this manager from leave status?")) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await escalationApi.removeManagerLeave(managerId);
      setSuccess("Manager leave status removed successfully");
      await fetchData();
    } catch (err) {
      console.error("Failed to remove manager from leave:", err);
      setError(err.message || "Failed to remove manager from leave");
    }
  };

  // Get managers NOT currently on leave
  const availableManagers = managers.filter(
    m => !managersOnLeave.some(mol => mol.id === m.id)
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Manager Leave Management</h1>
          <p className="text-gray-600">
            Set managers on leave to automatically escalate their pending approvals to admin
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading managers...</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Set Manager on Leave Form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserX className="w-6 h-6 text-orange-600" />
                <h2 className="text-xl font-semibold text-gray-900">Set Manager on Leave</h2>
              </div>

              {availableManagers.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  All managers are currently on leave or there are no managers in the system.
                </p>
              ) : (
                <form onSubmit={handleSetLeave} className="space-y-4">
                  {/* Manager Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Manager
                    </label>
                    <select
                      value={selectedManager || ""}
                      onChange={(e) => setSelectedManager(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">-- Select a manager --</option>
                      {availableManagers.map(manager => (
                        <option key={manager.id} value={manager.id}>
                          {manager.full_name || manager.email} ({manager.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Leave Start Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Leave Start Date
                    </label>
                    <input
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Leave End Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Leave End Date
                    </label>
                    <input
                      type="date"
                      value={leaveEndDate}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      min={leaveStartDate || new Date().toISOString().split("T")[0]}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submittingLeave}
                    className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-orange-300 transition-colors"
                  >
                    {submittingLeave ? "Setting Leave..." : "Set Manager on Leave"}
                  </button>

                  <p className="text-xs text-gray-500 mt-2">
                    <strong>Note:</strong> All pending approvals assigned to this manager will be 
                    immediately escalated to an admin.
                  </p>
                </form>
              )}
            </div>

            {/* Managers Currently on Leave */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Managers on Leave</h2>
              </div>

              {managersOnLeave.length === 0 ? (
                <div className="text-center py-8">
                  <UserCheck className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-gray-600 font-medium">No managers on leave</p>
                  <p className="text-sm text-gray-500 mt-1">All managers are available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {managersOnLeave.map(manager => {
                    const endDate = new Date(manager.leave_end_date);
                    const today = new Date();
                    const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

                    return (
                      <div
                        key={manager.id}
                        className="border border-orange-200 bg-orange-50 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {manager.full_name || manager.email}
                            </h3>
                            <p className="text-sm text-gray-600">{manager.email}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveLeave(manager.id)}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                          >
                            Return from Leave
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-gray-500">Start:</span>
                            <p className="font-medium text-gray-900">
                              {new Date(manager.leave_start_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">End:</span>
                            <p className="font-medium text-gray-900">
                              {endDate.toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 text-sm">
                          {daysRemaining > 0 ? (
                            <span className="text-orange-700">
                              🗓️ {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
                            </span>
                          ) : (
                            <span className="text-red-700 font-medium">
                              ⚠️ Leave period ended (will auto-expire)
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
        )}
      </div>
    </DashboardLayout>
  );
}
