-- ═══════════════════════════════════════════════════════════════
-- REIMBURSEMENT MANAGEMENT — DATABASE MIGRATION V2
-- Rebuilds approval pipeline from scratch
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. APPROVAL_RULES — ensure all required columns exist
-- ───────────────────────────────────────────────────────────────

ALTER TABLE approval_rules
  ADD COLUMN IF NOT EXISTS is_manager_approver BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_approval_percentage INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS specific_approver_id UUID DEFAULT NULL REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ───────────────────────────────────────────────────────────────
-- 2. APPROVAL_RULE_STEPS — ensure correct schema
-- ───────────────────────────────────────────────────────────────

-- Drop and recreate to guarantee clean schema
DROP TABLE IF EXISTS approval_rule_steps CASCADE;

CREATE TABLE approval_rule_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES profiles(id),
  step_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rule_id, step_order)
);

CREATE INDEX idx_rule_steps_rule_id ON approval_rule_steps(rule_id);

-- ───────────────────────────────────────────────────────────────
-- 3. EXPENSE_APPROVAL_STEPS — the single source of truth
--    Tracks the live approval chain for each submitted expense
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS expense_approval_steps CASCADE;

CREATE TABLE expense_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES profiles(id),
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WAITING', 'SKIPPED')),
  comment TEXT,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eas_expense_id ON expense_approval_steps(expense_id);
CREATE INDEX idx_eas_approver_id ON expense_approval_steps(approver_id);
CREATE INDEX idx_eas_status ON expense_approval_steps(status);
CREATE INDEX idx_eas_approver_pending ON expense_approval_steps(approver_id, status)
  WHERE status = 'PENDING';

-- ───────────────────────────────────────────────────────────────
-- 4. EXPENSES — add applied_rule_id column
-- ───────────────────────────────────────────────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS applied_rule_id UUID REFERENCES approval_rules(id);

-- ───────────────────────────────────────────────────────────────
-- 5. CLEAN UP — reset all pending/approved expenses to REJECTED
--    so employees can resubmit under the new approval system
-- ───────────────────────────────────────────────────────────────

UPDATE expenses
SET status = 'rejected'
WHERE status IN ('pending', 'approved')
  AND id NOT IN (
    SELECT DISTINCT expense_id FROM expense_approval_steps
  );

-- ───────────────────────────────────────────────────────────────
-- 6. DROP OLD APPROVAL TRACKING TABLES
--    All routing now goes through expense_approval_steps
-- ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS admin_approvals CASCADE;
DROP TABLE IF EXISTS manager_approvals CASCADE;
DROP TABLE IF EXISTS individual_approvals CASCADE;

-- Clean up old approval_logs data (keep table for reference but truncate)
-- If you want to fully drop it, uncomment the next line:
-- DROP TABLE IF EXISTS approval_logs CASCADE;
TRUNCATE TABLE escalation_history CASCADE;
TRUNCATE TABLE approval_logs CASCADE;

-- ───────────────────────────────────────────────────────────────
-- 7. NOTIFICATIONS — ensure correct schema
-- ───────────────────────────────────────────────────────────────

-- Notifications table should already exist, but ensure it has expense_id
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id);

-- ───────────────────────────────────────────────────────────────
-- 8. DISABLE RLS on approval tables
--    Backend uses service_role key — RLS with no policies
--    was silently blocking nested PostgREST joins
-- ───────────────────────────────────────────────────────────────

ALTER TABLE expense_approval_steps DISABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rule_steps DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- Next: Deploy backend code, then test approval flow
-- ═══════════════════════════════════════════════════════════════
