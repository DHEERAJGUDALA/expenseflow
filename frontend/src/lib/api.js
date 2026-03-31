import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/**
 * Helper to get auth token
 */
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`
  };
}

/**
 * Generic API request handler
 */
async function apiRequest(endpoint, options = {}) {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || "API request failed");
  }
  
  return data;
}

// ===================
// EMPLOYEE API
// ===================

export const employeeApi = {
  // Get all employees (Admin)
  getAll: () => apiRequest("/employees"),
  
  // Get single employee
  getById: (id) => apiRequest(`/employees/${id}`),
  
  // Get current user's profile
  getMyProfile: () => apiRequest("/employees/me"),
  
  // Get user's team (Manager)
  getMyTeam: () => apiRequest("/employees/my-team"),
  
  // Get all managers (for dropdown)
  getManagers: () => apiRequest("/employees/managers"),
  
  // Create employee (Admin)
  create: (data) => apiRequest("/employees", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  // Update employee (Admin)
  update: (id, data) => apiRequest(`/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  }),
  
  // Delete employee (Admin)
  delete: (id) => apiRequest(`/employees/${id}`, {
    method: "DELETE"
  }),
  
  // Assign manager (Admin)
  assignManager: (employeeId, managerId) => apiRequest("/employees/assign-manager", {
    method: "POST",
    body: JSON.stringify({ employee_id: employeeId, manager_id: managerId })
  }),
  
  // Resend password reset email (Admin)
  resendPasswordReset: (id) => apiRequest(`/employees/${id}/resend-password-reset`, {
    method: "POST"
  })
};

// ===================
// EXPENSE API
// ===================

export const expenseApi = {
  // Create expense
  create: (data) => apiRequest("/expenses", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  // Get all expenses (Admin/Manager)
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/expenses${query ? `?${query}` : ""}`);
  },
  
  // Get my expenses (Employee)
  getMyExpenses: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/expenses/my-expenses${query ? `?${query}` : ""}`);
  },
  
  // Get team expenses (Manager)
  getTeamExpenses: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/expenses/team${query ? `?${query}` : ""}`);
  },
  
  // Get single expense with approval chain
  getById: (id) => apiRequest(`/expenses/${id}`),
  
  // Update expense
  update: (id, data) => apiRequest(`/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  }),
  
  // Delete expense
  delete: (id) => apiRequest(`/expenses/${id}`, {
    method: "DELETE"
  }),
  
  // Get stats
  getStats: () => apiRequest("/expenses/stats"),
  
  // Get categories
  getCategories: () => apiRequest("/expenses/categories"),
  
  // Get available currencies
  getCurrencies: () => apiRequest("/expenses/currencies"),
  
  // Get currency conversion
  getConversion: (from, to, amount) => 
    apiRequest(`/expenses/convert?from=${from}&to=${to}${amount ? `&amount=${amount}` : ""}`)
};

// ===================
// OCR API
// ===================

export const ocrApi = {
  // Scan receipt from base64 image
  scan: (imageBase64) => apiRequest("/ocr/scan", {
    method: "POST",
    body: JSON.stringify({ image_base64: imageBase64 })
  }),
  
  // Upload and scan receipt
  uploadAndScan: (imageBase64, filename) => apiRequest("/ocr/upload-scan", {
    method: "POST",
    body: JSON.stringify({ image_base64: imageBase64, filename })
  }),
  
  // Get supported currencies and categories
  getSupported: () => fetch(`${API_BASE_URL}/ocr/supported`).then(r => r.json())
};

// ===================
// APPROVAL API
// ===================

export const approvalApi = {
  // Get pending approvals for manager/admin (sequential)
  getPendingApprovals: () => apiRequest("/approvals/pending"),
  
  // Get special approver queue (parallel approvers)
  getSpecialApproverQueue: () => apiRequest("/approvals/special"),
  
  // Get approval history
  getApprovalHistory: () => apiRequest("/approvals/history"),
  
  // Approve/Reject expense
  process: (expenseId, approverId, status, comments) => apiRequest("/approvals", {
    method: "POST",
    body: JSON.stringify({
      expense_id: expenseId,
      approver_id: approverId,
      status,
      comments
    })
  })
};

// ===================
// COMPANY API
// ===================

export const companyApi = {
  // Get available currencies (public)
  getCurrencies: () => fetch(`${API_BASE_URL}/companies/currencies`).then(r => r.json()),
  
  // Get my company
  getMyCompany: () => apiRequest("/companies/me"),
  
  // Update company settings
  update: (data) => apiRequest("/companies/me", {
    method: "PUT",
    body: JSON.stringify(data)
  }),
  
  // Setup company on signup
  setup: (organizationName, currency) => apiRequest("/companies/setup", {
    method: "POST",
    body: JSON.stringify({ organizationName, currency })
  })
};

// ===================
// NOTIFICATION API
// ===================

export const notificationApi = {
  // Get my notifications
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/notifications${query ? `?${query}` : ""}`);
  },
  
  // Get unread count
  getUnreadCount: () => apiRequest("/notifications/unread-count"),
  
  // Mark as read
  markAsRead: (notificationId) => apiRequest(`/notifications/${notificationId}/read`, {
    method: "PUT"
  }),
  
  // Mark all as read
  markAllAsRead: () => apiRequest("/notifications/read-all", {
    method: "PUT"
  })
};

// ===================
// ANALYTICS API
// ===================

export const analyticsApi = {
  // Get dashboard summary
  getDashboard: () => apiRequest("/analytics/dashboard"),
  
  // Get spending trends
  getSpendingTrends: (months = 6) => apiRequest(`/analytics/spending-trends?months=${months}`),
  
  // Get bottleneck report
  getBottlenecks: () => apiRequest("/analytics/bottlenecks"),
  
  // Get approval metrics
  getApprovalMetrics: (days = 30) => apiRequest(`/analytics/approval-metrics?days=${days}`)
};

// ===================
// APPROVAL PREVIEW API
// ===================

export const approvalPreviewApi = {
  // Get approval preview (shows workflow before submission)
  getPreview: (amount, category) => {
    const params = new URLSearchParams();
    if (amount) params.append("amount", amount);
    if (category) params.append("category", category);
    return apiRequest(`/approvals/preview?${params.toString()}`);
  },
  
  // Check if user can submit expenses
  canSubmit: () => apiRequest("/approvals/can-submit")
};

// ===================
// ESCALATION API
// ===================

export const escalationApi = {
  // Set manager on leave (Admin only)
  setManagerLeave: (managerId, startDate, endDate) => apiRequest(
    `/escalation/manager/${managerId}/set-leave`, 
    {
      method: "POST",
      body: JSON.stringify({ 
        leave_start_date: startDate, 
        leave_end_date: endDate 
      })
    }
  ),
  
  // Remove manager from leave (Admin only)
  removeManagerLeave: (managerId) => apiRequest(
    `/escalation/manager/${managerId}/remove-leave`,
    { method: "POST" }
  ),
  
  // Get escalation statistics (Admin/Manager)
  getStats: () => apiRequest("/escalation/stats"),
  
  // Get managers currently on leave (Admin only)
  getManagersOnLeave: () => apiRequest("/escalation/managers-on-leave")
};

// ===================
// APPROVAL RULE API (Admin)
// ===================

export const approvalRuleApi = {
  // Get all rules
  getAll: () => apiRequest("/approval-rules"),
  
  // Create rule with steps
  create: (data) => apiRequest("/approval-rules", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  
  // Update rule
  update: (id, data) => apiRequest(`/approval-rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  }),
  
  // Delete rule
  delete: (id) => apiRequest(`/approval-rules/${id}`, {
    method: "DELETE"
  }),
  
  // Get eligible approvers (managers + admins)
  getEligibleApprovers: () => apiRequest("/approval-rules/eligible-approvers")
};

// ===================
// MANAGER API
// ===================

export const managerApi = {
  // Get sequential approval queue
  getQueue: () => apiRequest("/manager/queue"),
  
  // Get special approver queue
  getSpecialQueue: () => apiRequest("/manager/special-queue"),
  
  // Approve expense (sequential)
  approve: (expenseId, comment) => apiRequest(`/manager/expenses/${expenseId}/approve`, {
    method: "POST",
    body: JSON.stringify({ comment })
  }),
  
  // Reject expense (sequential)
  reject: (expenseId, comment) => apiRequest(`/manager/expenses/${expenseId}/reject`, {
    method: "POST",
    body: JSON.stringify({ comment })
  }),
  
  // Special approve
  specialApprove: (expenseId, comment) => apiRequest(`/manager/expenses/${expenseId}/special-approve`, {
    method: "POST",
    body: JSON.stringify({ comment })
  }),
  
  // Special reject
  specialReject: (expenseId, comment) => apiRequest(`/manager/expenses/${expenseId}/special-reject`, {
    method: "POST",
    body: JSON.stringify({ comment })
  }),

  // Get team expenses
  getTeamExpenses: () => apiRequest("/manager/team-expenses")
};

