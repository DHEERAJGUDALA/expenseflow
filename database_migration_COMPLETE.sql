-- ═══════════════════════════════════════════════════════════════════
-- COMPLETE MIGRATION - RUN THIS IN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════
-- This includes:
-- 1. Add full_name and job_title to profiles
-- 2. Create notifications table
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- PART 1: ADD COLUMNS TO PROFILES TABLE
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS job_title TEXT;

-- ───────────────────────────────────────────────────────────────────
-- PART 2: CREATE NOTIFICATIONS TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'general',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop if exist to avoid errors on re-run)
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- System can insert notifications for any user
CREATE POLICY "Service can insert notifications" ON notifications
  FOR INSERT WITH CHECK (TRUE);

-- Users can update (mark as read) their own notifications  
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT INSERT ON notifications TO service_role;

-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION - Check what was created
-- ───────────────────────────────────────────────────────────────────

SELECT 'profiles columns' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('full_name', 'job_title')

UNION ALL

SELECT 'notifications table' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notifications';
