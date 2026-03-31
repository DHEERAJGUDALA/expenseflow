-- ═══════════════════════════════════════════════════════════════════
-- APPROVAL ESCALATION & MANAGER LEAVE HANDLING - DATABASE MIGRATION
-- ═══════════════════════════════════════════════════════════════════
-- Features:
-- 1. Auto-escalation after 15 days
-- 2. Manager leave status
-- 3. Escalation history tracking
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- PART 1: ADD LEAVE STATUS TO PROFILES
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS on_leave BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS leave_start_date DATE;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS leave_end_date DATE;

COMMENT ON COLUMN profiles.on_leave IS 'Manager is currently on leave (approvals auto-escalate to admin)';
COMMENT ON COLUMN profiles.leave_start_date IS 'Leave period start date';
COMMENT ON COLUMN profiles.leave_end_date IS 'Leave period end date';

-- ───────────────────────────────────────────────────────────────────
-- PART 2: ADD ESCALATION TRACKING TO APPROVAL_LOGS
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE approval_logs 
ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE;

ALTER TABLE approval_logs 
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

ALTER TABLE approval_logs 
ADD COLUMN IF NOT EXISTS escalated_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE approval_logs 
ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

ALTER TABLE approval_logs 
ADD COLUMN IF NOT EXISTS original_approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN approval_logs.escalated IS 'Whether this approval was escalated';
COMMENT ON COLUMN approval_logs.escalated_at IS 'When escalation occurred';
COMMENT ON COLUMN approval_logs.escalated_to IS 'Admin who received escalated approval';
COMMENT ON COLUMN approval_logs.escalation_reason IS 'Why escalation happened (timeout/leave)';
COMMENT ON COLUMN approval_logs.original_approver_id IS 'Original approver before escalation';

-- ───────────────────────────────────────────────────────────────────
-- PART 3: ADD ESCALATION SETTINGS TO COMPANIES
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS escalation_timeout_days INTEGER DEFAULT 15;

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS auto_escalation_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN companies.escalation_timeout_days IS 'Days before auto-escalation (default: 15)';
COMMENT ON COLUMN companies.auto_escalation_enabled IS 'Enable/disable auto-escalation globally';

-- ───────────────────────────────────────────────────────────────────
-- PART 4: CREATE ESCALATION HISTORY TABLE (AUDIT TRAIL)
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approval_log_id UUID REFERENCES approval_logs(id) ON DELETE SET NULL,
  
  original_approver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  escalated_to_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  reason TEXT NOT NULL, -- 'timeout' or 'manager_on_leave'
  days_pending INTEGER, -- How many days it was pending before escalation
  
  escalated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalation_history_expense ON escalation_history(expense_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_original_approver ON escalation_history(original_approver_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_escalated_to ON escalation_history(escalated_to_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_escalated_at ON escalation_history(escalated_at DESC);

COMMENT ON TABLE escalation_history IS 'Audit trail of all approval escalations';

-- ───────────────────────────────────────────────────────────────────
-- PART 5: CREATE FUNCTION TO AUTO-EXPIRE LEAVE STATUS
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_expire_leave_status()
RETURNS void AS $$
BEGIN
  -- Automatically set on_leave to FALSE when leave_end_date has passed
  UPDATE profiles
  SET on_leave = FALSE,
      leave_start_date = NULL,
      leave_end_date = NULL
  WHERE on_leave = TRUE
    AND leave_end_date IS NOT NULL
    AND leave_end_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_expire_leave_status() IS 'Auto-expire leave status when end date passes';

-- ───────────────────────────────────────────────────────────────────
-- PART 6: ADD INDEXES FOR ESCALATION QUERIES
-- ───────────────────────────────────────────────────────────────────

-- Index for finding pending approvals that need escalation
CREATE INDEX IF NOT EXISTS idx_approval_logs_pending_escalation 
ON approval_logs(action, created_at) 
WHERE action = 'PENDING' AND escalated = FALSE;

-- Index for finding managers on leave
CREATE INDEX IF NOT EXISTS idx_profiles_on_leave 
ON profiles(on_leave, leave_end_date) 
WHERE on_leave = TRUE;

-- ───────────────────────────────────────────────────────────────────
-- PART 7: HELPER VIEW - APPROVALS NEEDING ESCALATION
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW approvals_needing_escalation AS
SELECT 
  al.id as approval_log_id,
  al.expense_id,
  al.approver_id,
  al.step_order,
  al.created_at as pending_since,
  EXTRACT(DAY FROM (NOW() - al.created_at)) as days_pending,
  e.amount,
  e.converted_amount,
  e.category,
  e.company_id,
  p.email as approver_email,
  p.on_leave as approver_on_leave,
  c.escalation_timeout_days,
  c.auto_escalation_enabled,
  CASE 
    WHEN p.on_leave THEN 'manager_on_leave'
    WHEN EXTRACT(DAY FROM (NOW() - al.created_at)) >= c.escalation_timeout_days THEN 'timeout'
    ELSE NULL
  END as escalation_reason
FROM approval_logs al
JOIN expenses e ON al.expense_id = e.id
JOIN profiles p ON al.approver_id = p.id
JOIN companies c ON e.company_id = c.id
WHERE al.action = 'PENDING'
  AND al.escalated = FALSE
  AND c.auto_escalation_enabled = TRUE
  AND (
    p.on_leave = TRUE -- Manager is on leave
    OR EXTRACT(DAY FROM (NOW() - al.created_at)) >= c.escalation_timeout_days -- Timeout
  );

COMMENT ON VIEW approvals_needing_escalation IS 'Real-time view of approvals that need escalation';

-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ───────────────────────────────────────────────────────────────────

SELECT 'profiles leave columns' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('on_leave', 'leave_start_date', 'leave_end_date')

UNION ALL

SELECT 'approval_logs escalation columns' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'approval_logs' 
AND column_name IN ('escalated', 'escalated_at', 'escalated_to', 'escalation_reason', 'original_approver_id')

UNION ALL

SELECT 'companies escalation settings' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'companies' 
AND column_name IN ('escalation_timeout_days', 'auto_escalation_enabled')

UNION ALL

SELECT 'escalation_history table' as check_type, 'table_exists', 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'escalation_history') 
    THEN 'YES' ELSE 'NO' END;
