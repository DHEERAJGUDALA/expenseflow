import React from "react";
import { CheckCircle, Clock, AlertCircle, User, ArrowRight } from "lucide-react";

/**
 * ApprovalLifecycleVisualizer
 * 
 * Shows approval workflow BEFORE user submits expense
 * Displays:
 * - Approval steps (sequential)
 * - Approver names and roles
 * - Estimated time per step
 * - Warning if approver is on leave (will escalate)
 * - Total estimated approval time
 */
const ApprovalLifecycleVisualizer = ({ preview, loading, error }) => {
  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-700">
          <Clock className="w-5 h-5 animate-spin" />
          <span className="font-medium">Loading approval preview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Unable to load approval preview</span>
        </div>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  const { can_submit, reason, approval_steps, total_steps, estimated_days } = preview;

  // User cannot submit
  if (!can_submit) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Cannot Submit Expense</span>
        </div>
        <p className="text-sm text-red-600 mt-2">{reason}</p>
      </div>
    );
  }

  // No approval steps (auto-approved or error)
  if (!approval_steps || approval_steps.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Expense will be auto-approved</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Approval Workflow Preview</h3>
          <p className="text-sm text-gray-600 mt-1">
            Your expense will go through {total_steps} approval {total_steps === 1 ? "step" : "steps"}
          </p>
        </div>
        <div className="bg-blue-100 px-3 py-1 rounded-full">
          <span className="text-sm font-medium text-blue-800">
            ~{estimated_days} {estimated_days === 1 ? "day" : "days"}
          </span>
        </div>
      </div>

      {/* Approval Steps */}
      <div className="space-y-3">
        {approval_steps.map((step, index) => {
          const isLast = index === approval_steps.length - 1;
          const willEscalate = step.will_escalate;

          return (
            <div key={index}>
              {/* Step Container */}
              <div
                className={`
                  relative bg-white rounded-lg p-4 border-2 transition-all
                  ${willEscalate 
                    ? "border-orange-300 bg-orange-50" 
                    : "border-blue-200 hover:border-blue-300"
                  }
                `}
              >
                {/* Step Number Badge */}
                <div className="absolute -left-3 -top-3 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                  {step.step_order}
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Approver Info */}
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold text-gray-900">
                        {step.approver_name || step.approver_email}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-700 uppercase">
                        {step.approver_role}
                      </span>
                    </div>

                    {/* Approver Email */}
                    {step.approver_name && (
                      <p className="text-sm text-gray-600 ml-6">{step.approver_email}</p>
                    )}

                    {/* Escalation Warning */}
                    {willEscalate && (
                      <div className="mt-2 ml-6 flex items-start gap-2 text-orange-800 bg-orange-100 border border-orange-200 rounded px-3 py-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <span className="font-semibold">Will escalate: </span>
                          {step.escalation_reason === "manager_on_leave" && (
                            <span>Manager is on leave until {new Date(step.approver_leave_end_date).toLocaleDateString()}</span>
                          )}
                          {step.escalation_reason === "timeout_risk" && (
                            <span>May escalate if not approved within 15 days</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Estimated Time */}
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">~{step.estimated_days}d</span>
                  </div>
                </div>
              </div>

              {/* Arrow Connector */}
              {!isLast && (
                <div className="flex justify-center my-2">
                  <ArrowRight className="w-5 h-5 text-blue-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Final Step - Approved */}
      <div className="mt-3 flex justify-center">
        <ArrowRight className="w-5 h-5 text-blue-400" />
      </div>
      <div className="mt-3 bg-green-100 border-2 border-green-300 rounded-lg p-4 flex items-center justify-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-700" />
        <span className="font-semibold text-green-800">Expense Approved & Processed</span>
      </div>

      {/* Info Footer */}
      <div className="mt-4 pt-4 border-t border-blue-200">
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong>Note:</strong> Approval times are estimates. If an approver doesn't respond within 15 days, 
          the approval will automatically escalate to an admin. Managers on leave will have their approvals 
          escalated immediately.
        </p>
      </div>
    </div>
  );
};

export default ApprovalLifecycleVisualizer;
