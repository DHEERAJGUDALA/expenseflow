-- Notifications table for in-app notifications
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'general', -- approval_needed, expense_approved, expense_rejected, expense_paid, step_approved, special_approval
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Add RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- System can insert notifications for any user (service role)
CREATE POLICY "Service can insert notifications" ON notifications
  FOR INSERT WITH CHECK (TRUE);

-- Users can update (mark as read) their own notifications  
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT INSERT ON notifications TO service_role;

-- Add comments
COMMENT ON TABLE notifications IS 'In-app notifications for expense workflow events';
COMMENT ON COLUMN notifications.type IS 'Type of notification: approval_needed, expense_approved, expense_rejected, expense_paid, step_approved, special_approval';
