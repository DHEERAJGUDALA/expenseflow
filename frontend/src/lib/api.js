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
  
  // Get single expense
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
  // Get pending approvals for manager/admin
  getPendingApprovals: () => apiRequest("/approvals/pending"),
  
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
