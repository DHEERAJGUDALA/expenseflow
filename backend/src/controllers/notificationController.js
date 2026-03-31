import { supabase } from "../config/supabaseClient.js";

/**
 * Notification Controller
 * Manages in-app notifications for employees and managers
 */

/**
 * Create a notification
 */
export async function createNotification(userId, message, expenseId = null, type = 'general') {
  try {
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        message,
        expense_id: expenseId,
        type, // 'approval_needed', 'expense_approved', 'expense_rejected', 'expense_paid', 'step_approved'
        is_read: false
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error creating notification:", error);
    return false;
  }
}

/**
 * Notify approver that an expense needs their approval
 */
export async function notifyApprover(approverId, expenseId, employeeName, amount, category) {
  const message = `New expense from ${employeeName}: ${category} - ${amount}. Waiting for your approval.`;
  return createNotification(approverId, message, expenseId, 'approval_needed');
}

/**
 * Notify employee about expense status change
 */
export async function notifyEmployee(employeeId, expenseId, status, approverName = null, reason = null) {
  let message = '';
  let type = 'general';

  switch (status) {
    case 'step_approved':
      message = `Your expense was approved by ${approverName}. Waiting for next approver.`;
      type = 'step_approved';
      break;
    case 'approved':
      message = `Your expense has been fully approved!`;
      type = 'expense_approved';
      break;
    case 'rejected':
      message = `Your expense was rejected${approverName ? ` by ${approverName}` : ''}.${reason ? ` Reason: ${reason}` : ''}`;
      type = 'expense_rejected';
      break;
    case 'paid':
      message = `Your expense has been paid!`;
      type = 'expense_paid';
      break;
    default:
      message = `Your expense status changed to ${status}.`;
  }

  return createNotification(employeeId, message, expenseId, type);
}

/**
 * Notify special approver about new expense in their category
 */
export async function notifySpecialApprover(approverId, expenseId, employeeName, amount, category) {
  const message = `New ${category} expense from ${employeeName}: ${amount}. As a special approver, you can approve/reject this immediately.`;
  return createNotification(approverId, message, expenseId, 'special_approval');
}

/**
 * Get user's notifications
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, unread_only = false } = req.query;

    let query = supabase
      .from("notifications")
      .select(`
        *,
        expense:expense_id(
          id,
          description,
          amount,
          currency,
          category,
          status
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (unread_only === 'true') {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    res.json({
      notifications,
      unread_count: unreadCount || 0
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    res.json({ unread_count: count || 0 });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  createNotification,
  notifyApprover,
  notifyEmployee,
  notifySpecialApprover,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
};
