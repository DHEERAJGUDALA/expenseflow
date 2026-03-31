import { supabase } from "../config/supabaseClient.js";

/**
 * Data Validation Utilities
 * Handles edge cases and validates data integrity
 */

/**
 * Ensure user has required profile fields
 */
export async function ensureValidProfile(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, role, company_id, manager_id")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new Error("User profile not found");
  }

  const issues = [];
  const warnings = [];

  // Check company_id
  if (!profile.company_id) {
    warnings.push("User has no company assigned - will use default company");
    
    // Auto-fix: Assign default company
    await supabase
      .from("profiles")
      .update({ company_id: '00000000-0000-0000-0000-000000000001' })
      .eq("id", userId);
    
    profile.company_id = '00000000-0000-0000-0000-000000000001';
  }

  // Check manager_id for non-admin roles
  if (profile.role === 'employee' && !profile.manager_id) {
    warnings.push("Employee has no manager assigned - some workflows may not work");
  }

  return {
    profile,
    valid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Validate company exists
 */
export async function validateCompany(companyId) {
  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(`Company ${companyId} not found`);
  }

  return company;
}

/**
 * Validate approver is valid and active
 */
export async function validateApprover(approverId) {
  const { data: approver, error } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", approverId)
    .single();

  if (error || !approver) {
    throw new Error(`Approver ${approverId} not found`);
  }

  if (approver.role === 'employee') {
    throw new Error("Employees cannot be approvers - must be manager or admin");
  }

  return approver;
}

/**
 * Check if expense exists and is in valid state
 */
export async function validateExpenseForApproval(expenseId) {
  const { data: expense, error } = await supabase
    .from("expenses")
    .select(`
      *,
      employee:employee_id(id, email, company_id)
    `)
    .eq("id", expenseId)
    .single();

  if (error || !expense) {
    throw new Error("Expense not found");
  }

  if (!expense.employee_id) {
    throw new Error("Expense has no employee assigned");
  }

  if (!expense.company_id) {
    throw new Error("Expense has no company assigned");
  }

  if (expense.status === 'approved') {
    throw new Error("Expense is already approved");
  }

  if (expense.status === 'rejected') {
    throw new Error("Expense is already rejected");
  }

  return expense;
}

/**
 * Check for duplicate approval logs
 */
export async function checkDuplicateApproval(expenseId, approverId) {
  const { data: existingLog } = await supabase
    .from("approval_logs")
    .select("id, action")
    .eq("expense_id", expenseId)
    .eq("approver_id", approverId)
    .in("action", ['APPROVED', 'REJECTED'])
    .maybeSingle();

  if (existingLog) {
    throw new Error(`You have already ${existingLog.action.toLowerCase()} this expense`);
  }

  return false;
}

/**
 * Validate approval rule configuration
 */
export async function validateApprovalRule(ruleData) {
  const errors = [];

  if (!ruleData.name || ruleData.name.trim().length === 0) {
    errors.push("Rule name is required");
  }

  if (ruleData.min_approval_percentage) {
    const percentage = parseFloat(ruleData.min_approval_percentage);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      errors.push("Approval percentage must be between 1 and 100");
    }
  }

  if (ruleData.threshold_amount) {
    const amount = parseFloat(ruleData.threshold_amount);
    if (isNaN(amount) || amount < 0) {
      errors.push("Threshold amount must be a positive number");
    }
  }

  // Validate sequential approvers
  if (ruleData.sequential_approvers && Array.isArray(ruleData.sequential_approvers)) {
    const stepOrders = new Set();
    
    for (const approver of ruleData.sequential_approvers) {
      if (!approver.approver_id) {
        errors.push("All sequential approvers must have approver_id");
        break;
      }

      if (approver.step_order) {
        if (stepOrders.has(approver.step_order)) {
          errors.push(`Duplicate step_order ${approver.step_order} found`);
        }
        stepOrders.add(approver.step_order);
      }
    }
  }

  // Validate parallel approvers
  if (ruleData.parallel_approvers && Array.isArray(ruleData.parallel_approvers)) {
    for (const approver of ruleData.parallel_approvers) {
      if (!approver.approver_id) {
        errors.push("All parallel approvers must have approver_id");
        break;
      }
    }
  }

  // Must have at least one approver source
  const hasManager = ruleData.is_manager_approver;
  const hasSequential = ruleData.sequential_approvers?.length > 0;
  const hasParallel = ruleData.parallel_approvers?.length > 0;
  const hasSpecific = ruleData.specific_approver_id;

  if (!hasManager && !hasSequential && !hasParallel && !hasSpecific) {
    errors.push("Rule must have at least one approver (manager, sequential, parallel, or specific)");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Auto-fix common data issues
 */
export async function autoFixDataIssues() {
  const fixes = [];

  try {
    // Fix 1: Ensure all profiles have company_id
    const { data: profilesWithoutCompany } = await supabase
      .from("profiles")
      .select("id, email")
      .is("company_id", null);

    if (profilesWithoutCompany && profilesWithoutCompany.length > 0) {
      await supabase
        .from("profiles")
        .update({ company_id: '00000000-0000-0000-0000-000000000001' })
        .is("company_id", null);

      fixes.push(`Fixed ${profilesWithoutCompany.length} profiles without company`);
    }

    // Fix 2: Ensure all expenses have employee_id from user_id
    const { data: expensesWithoutEmployee } = await supabase
      .from("expenses")
      .select("id, user_id")
      .is("employee_id", null);

    if (expensesWithoutEmployee && expensesWithoutEmployee.length > 0) {
      for (const expense of expensesWithoutEmployee) {
        await supabase
          .from("expenses")
          .update({ employee_id: expense.user_id })
          .eq("id", expense.id);
      }

      fixes.push(`Fixed ${expensesWithoutEmployee.length} expenses without employee_id`);
    }

    // Fix 3: Ensure all expenses have company_id
    const { data: expensesWithoutCompany } = await supabase
      .from("expenses")
      .select("id, employee_id")
      .is("company_id", null);

    if (expensesWithoutCompany && expensesWithoutCompany.length > 0) {
      for (const expense of expensesWithoutCompany) {
        // Get employee's company
        const { data: employee } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", expense.employee_id)
          .single();

        const companyId = employee?.company_id || '00000000-0000-0000-0000-000000000001';

        await supabase
          .from("expenses")
          .update({ company_id: companyId })
          .eq("id", expense.id);
      }

      fixes.push(`Fixed ${expensesWithoutCompany.length} expenses without company_id`);
    }

    // Fix 4: Ensure converted_amount is set
    const { data: expensesWithoutConversion } = await supabase
      .from("expenses")
      .select("id, amount")
      .is("converted_amount", null);

    if (expensesWithoutConversion && expensesWithoutConversion.length > 0) {
      for (const expense of expensesWithoutConversion) {
        await supabase
          .from("expenses")
          .update({ 
            converted_amount: expense.amount,
            currency: 'INR',
            company_currency: 'INR'
          })
          .eq("id", expense.id);
      }

      fixes.push(`Fixed ${expensesWithoutConversion.length} expenses without converted_amount`);
    }

    return {
      success: true,
      fixes,
      totalFixed: fixes.length
    };
  } catch (error) {
    console.error("Error in autoFixDataIssues:", error);
    return {
      success: false,
      error: error.message,
      fixes
    };
  }
}

export default {
  ensureValidProfile,
  validateCompany,
  validateApprover,
  validateExpenseForApproval,
  checkDuplicateApproval,
  validateApprovalRule,
  autoFixDataIssues
};
