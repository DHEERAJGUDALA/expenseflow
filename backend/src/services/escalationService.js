/**
 * Escalation Service
 * Handles automatic escalation of pending approvals to admin
 * - After 15 days timeout
 * - When manager is on leave
 */

import { supabase } from "../config/supabaseClient.js";

/**
 * Process all pending approvals that need escalation
 * Should be called by a cron job every hour or daily
 */
export async function processEscalations() {
  console.log('[Escalation] Starting escalation check...');
  
  try {
    // Get all approvals needing escalation (using the database view)
    const { data: needsEscalation, error: viewError } = await supabase
      .from('approvals_needing_escalation')
      .select('*');

    if (viewError) {
      console.error('[Escalation] Error fetching escalations:', viewError);
      return { success: false, error: viewError.message };
    }

    if (!needsEscalation || needsEscalation.length === 0) {
      console.log('[Escalation] No approvals need escalation');
      return { success: true, escalated: 0 };
    }

    console.log(`[Escalation] Found ${needsEscalation.length} approvals needing escalation`);

    let escalatedCount = 0;
    const errors = [];

    for (const approval of needsEscalation) {
      try {
        await escalateApprovalToAdmin(
          approval.approval_log_id,
          approval.expense_id,
          approval.approver_id,
          approval.company_id,
          approval.escalation_reason,
          approval.days_pending
        );
        escalatedCount++;
      } catch (err) {
        console.error(`[Escalation] Failed to escalate approval ${approval.approval_log_id}:`, err);
        errors.push({ approval_log_id: approval.approval_log_id, error: err.message });
      }
    }

    console.log(`[Escalation] Successfully escalated ${escalatedCount}/${needsEscalation.length} approvals`);

    return {
      success: true,
      escalated: escalatedCount,
      total: needsEscalation.length,
      errors: errors.length > 0 ? errors : null
    };
  } catch (error) {
    console.error('[Escalation] Critical error in processEscalations:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Escalate a single approval to admin
 */
async function escalateApprovalToAdmin(
  approvalLogId,
  expenseId,
  originalApproverId,
  companyId,
  reason,
  daysPending
) {
  console.log(`[Escalation] Escalating approval ${approvalLogId} - Reason: ${reason}`);

  // Find an admin for this company
  const { data: admins, error: adminError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .limit(1);

  if (adminError || !admins || admins.length === 0) {
    throw new Error(`No admin found for company ${companyId}`);
  }

  const admin = admins[0];

  // Start transaction-like operations
  // 1. Update the original approval_log to mark as escalated
  const { error: updateError } = await supabase
    .from('approval_logs')
    .update({
      escalated: true,
      escalated_at: new Date().toISOString(),
      escalated_to: admin.id,
      escalation_reason: reason,
      original_approver_id: originalApproverId
    })
    .eq('id', approvalLogId);

  if (updateError) {
    throw new Error(`Failed to update approval_log: ${updateError.message}`);
  }

  // 2. Create new approval_log for admin
  const { error: createError } = await supabase
    .from('approval_logs')
    .insert({
      expense_id: expenseId,
      approver_id: admin.id,
      type: 'ESCALATED',
      step_order: 999, // Special step number for escalated approvals
      is_required: true,
      action: 'PENDING',
      comment: `Escalated from original approver due to: ${reason}`
    });

  if (createError) {
    throw new Error(`Failed to create admin approval: ${createError.message}`);
  }

  // 3. Record in escalation_history
  const { error: historyError } = await supabase
    .from('escalation_history')
    .insert({
      expense_id: expenseId,
      approval_log_id: approvalLogId,
      original_approver_id: originalApproverId,
      escalated_to_id: admin.id,
      reason: reason,
      days_pending: Math.floor(daysPending)
    });

  if (historyError) {
    console.error('[Escalation] Failed to record history (non-critical):', historyError);
  }

  // 4. Send notification to admin
  const { data: expense } = await supabase
    .from('expenses')
    .select('description, converted_amount, company_currency')
    .eq('id', expenseId)
    .single();

  await supabase
    .from('notifications')
    .insert({
      user_id: admin.id,
      expense_id: expenseId,
      type: 'escalation',
      message: `Expense escalated to you: ${expense?.description || 'Expense'} - ${expense?.company_currency} ${expense?.converted_amount}. Reason: ${reason}`
    });

  console.log(`[Escalation] Successfully escalated to admin ${admin.email}`);
}

/**
 * Set manager on leave (manual trigger by admin)
 * CRITICAL: companyId parameter ensures cross-company isolation
 */
export async function setManagerOnLeave(managerId, leaveStartDate, leaveEndDate, companyId) {
  // CRITICAL: Update ONLY if manager belongs to the specified company
  const { data: updatedProfile, error } = await supabase
    .from('profiles')
    .update({
      on_leave: true,
      leave_start_date: leaveStartDate,
      leave_end_date: leaveEndDate
    })
    .eq('id', managerId)
    .eq('company_id', companyId) // MULTI-TENANCY FILTER
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set manager on leave: ${error.message}`);
  }

  if (!updatedProfile) {
    throw new Error('Manager not found or not in your company');
  }

  // Immediately escalate all pending approvals for this manager
  // CRITICAL: Only escalate approvals where the expense belongs to same company
  const { data: pendingApprovals } = await supabase
    .from('approval_logs')
    .select(`
      id, 
      expense_id,
      expense:expense_id (company_id)
    `)
    .eq('approver_id', managerId)
    .eq('action', 'PENDING')
    .eq('escalated', false);

  // Filter to only approvals for expenses in the same company
  const companyApprovals = (pendingApprovals || []).filter(
    approval => approval.expense?.company_id === companyId
  );

  if (companyApprovals.length > 0) {
    console.log(`[Leave] Escalating ${companyApprovals.length} pending approvals for manager on leave`);
    
    for (const approval of companyApprovals) {
      try {
        await escalateApprovalToAdmin(
          approval.id,
          approval.expense_id,
          managerId,
          companyId,
          'manager_on_leave',
          0 // Not a timeout
        );
      } catch (err) {
        console.error(`[Leave] Failed to escalate approval ${approval.id}:`, err);
      }
    }
  }

  return { 
    success: true, 
    escalated: companyApprovals.length 
  };
}

/**
 * Remove manager from leave (manual trigger by admin)
 * CRITICAL: companyId parameter ensures cross-company isolation
 */
export async function removeManagerFromLeave(managerId, companyId) {
  // CRITICAL: Update ONLY if manager belongs to the specified company
  const { data: updatedProfile, error } = await supabase
    .from('profiles')
    .update({
      on_leave: false,
      leave_start_date: null,
      leave_end_date: null
    })
    .eq('id', managerId)
    .eq('company_id', companyId) // MULTI-TENANCY FILTER
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to remove manager from leave: ${error.message}`);
  }

  if (!updatedProfile) {
    throw new Error('Manager not found or not in your company');
  }

  return { success: true };
}

/**
 * Auto-expire leave status for managers whose leave period has ended
 * Should be called daily by cron
 */
export async function autoExpireLeaveStatus() {
  console.log('[Leave] Checking for expired leave periods...');

  const { data: expiredLeaves, error } = await supabase
    .from('profiles')
    .select('id, email, leave_end_date')
    .eq('on_leave', true)
    .not('leave_end_date', 'is', null)
    .lt('leave_end_date', new Date().toISOString().split('T')[0]);

  if (error) {
    console.error('[Leave] Error fetching expired leaves:', error);
    return { success: false, error: error.message };
  }

  if (!expiredLeaves || expiredLeaves.length === 0) {
    console.log('[Leave] No expired leave periods found');
    return { success: true, expired: 0 };
  }

  console.log(`[Leave] Found ${expiredLeaves.length} expired leave periods`);

  for (const manager of expiredLeaves) {
    await removeManagerFromLeave(manager.id);
    console.log(`[Leave] Auto-expired leave for ${manager.email}`);
  }

  return { success: true, expired: expiredLeaves.length };
}

/**
 * Get escalation statistics for a company
 */
export async function getEscalationStats(companyId) {
  const { data: stats, error } = await supabase
    .from('escalation_history')
    .select(`
      id,
      reason,
      days_pending,
      escalated_at,
      expense:expense_id (company_id)
    `)
    .eq('expense.company_id', companyId);

  if (error) {
    throw new Error(`Failed to get escalation stats: ${error.message}`);
  }

  const totalEscalations = stats?.length || 0;
  const timeoutEscalations = stats?.filter(s => s.reason === 'timeout').length || 0;
  const leaveEscalations = stats?.filter(s => s.reason === 'manager_on_leave').length || 0;
  const avgDaysPending = stats?.length > 0
    ? stats.reduce((sum, s) => sum + (s.days_pending || 0), 0) / stats.length
    : 0;

  return {
    total_escalations: totalEscalations,
    timeout_escalations: timeoutEscalations,
    leave_escalations: leaveEscalations,
    avg_days_pending: Math.round(avgDaysPending)
  };
}

export default {
  processEscalations,
  setManagerOnLeave,
  removeManagerFromLeave,
  autoExpireLeaveStatus,
  getEscalationStats
};
