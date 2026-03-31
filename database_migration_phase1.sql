-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1: ADD MISSING COLUMNS & CREATE NEW TABLES
-- ═══════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor
-- This is NON-DESTRUCTIVE - keeps all existing data
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- STEP 1: CREATE ENUMS (Must come first)
-- ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE expense_status AS ENUM (
    'DRAFT',
    'PENDING',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'PAYMENT_QUEUED',
    'PAID'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_action AS ENUM (
    'PENDING',
    'LOCKED',
    'APPROVED',
    'REJECTED',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approver_type AS ENUM (
    'SEQUENTIAL',
    'PARALLEL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_cycle_status AS ENUM (
    'UPCOMING',
    'PROCESSING',
    'COMPLETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'USER_CREATED',
    'USER_ROLE_CHANGED',
    'USER_MANAGER_CHANGED',
    'USER_DELETED',
    'EXPENSE_SUBMITTED',
    'EXPENSE_APPROVED',
    'EXPENSE_REJECTED',
    'EXPENSE_OVERRIDDEN',
    'RULE_CREATED',
    'RULE_MODIFIED',
    'RULE_DELETED',
    'PAYMENT_PROCESSED',
    'APPROVAL_REASSIGNED',
    'REMINDER_SENT',
    'SETTINGS_CHANGED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- STEP 2: CREATE COMPANIES TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  country              TEXT NOT NULL,
  currency             TEXT NOT NULL,  -- e.g. INR, USD
  stale_threshold_days INT DEFAULT 3,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default company for existing data migration
INSERT INTO companies (id, name, country, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Company', 'India', 'INR')
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- STEP 3: ADD MISSING COLUMNS TO PROFILES
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Note: manager_id already exists, so we skip it

-- ───────────────────────────────────────────────────────────────────
-- STEP 4: ADD MISSING COLUMNS TO EXPENSES
-- ───────────────────────────────────────────────────────────────────

-- Add employee_id as alias to user_id (keep both for compatibility)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id),
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS converted_amount FLOAT,
ADD COLUMN IF NOT EXISTS company_currency TEXT DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS current_step INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_cycle_id UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill employee_id from user_id
UPDATE expenses SET employee_id = user_id WHERE employee_id IS NULL;

-- Backfill converted_amount (assume same as amount for now)
UPDATE expenses SET converted_amount = amount WHERE converted_amount IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- STEP 5: CREATE APPROVAL_RULES TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id),
  name                     TEXT NOT NULL,
  is_default               BOOLEAN DEFAULT FALSE,
  category                 TEXT,          -- NULL means all categories
  threshold_amount         FLOAT,         -- NULL means all amounts
  is_manager_approver      BOOLEAN DEFAULT FALSE,
  min_approval_percentage  FLOAT,         -- e.g. 60.0 for 60%
  specific_approver_id     UUID REFERENCES profiles(id),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────
-- STEP 6: CREATE APPROVAL_RULE_STEPS TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_rule_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      UUID NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
  approver_id  UUID NOT NULL REFERENCES profiles(id),
  step_order   INT NOT NULL,     -- 1, 2, 3...
  is_required  BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────
-- STEP 7: CREATE APPROVAL_RULE_PARALLEL_APPROVERS
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_rule_parallel_approvers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      UUID NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
  approver_id  UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────
-- STEP 8: CREATE APPROVAL_LOGS TABLE (Replaces 3 old tables)
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES expenses(id),
  approver_id  UUID NOT NULL REFERENCES profiles(id),
  step_order   INT,                         -- NULL for PARALLEL type
  type         approver_type DEFAULT 'SEQUENTIAL',
  is_required  BOOLEAN DEFAULT TRUE,
  action       approval_action DEFAULT 'PENDING',
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────
-- STEP 9: CREATE PAYMENT_CYCLES TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_cycles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  process_date TIMESTAMPTZ NOT NULL,
  status       payment_cycle_status DEFAULT 'UPCOMING',
  total_amount FLOAT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to expenses
ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS fk_expenses_payment_cycle,
ADD CONSTRAINT fk_expenses_payment_cycle
FOREIGN KEY (payment_cycle_id) REFERENCES payment_cycles(id);

-- ───────────────────────────────────────────────────────────────────
-- STEP 10: CREATE AUDIT_LOGS TABLE
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES profiles(id),
  action      audit_action_type NOT NULL,
  target_id   UUID NOT NULL,
  target_type TEXT NOT NULL,    -- 'USER','EXPENSE','RULE','PAYMENT'
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  ip_address  TEXT,
  company_id  UUID NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────
-- STEP 11: CREATE INDEXES FOR PERFORMANCE
-- ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_employee 
  ON expenses(employee_id);

CREATE INDEX IF NOT EXISTS idx_expenses_company 
  ON expenses(company_id);

CREATE INDEX IF NOT EXISTS idx_expenses_status 
  ON expenses(status);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id 
  ON expenses(user_id);

CREATE INDEX IF NOT EXISTS idx_approval_logs_expense 
  ON approval_logs(expense_id);

CREATE INDEX IF NOT EXISTS idx_approval_logs_approver 
  ON approval_logs(approver_id);

CREATE INDEX IF NOT EXISTS idx_approval_logs_action 
  ON approval_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company 
  ON audit_logs(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor 
  ON audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_profiles_company 
  ON profiles(company_id);

CREATE INDEX IF NOT EXISTS idx_profiles_manager 
  ON profiles(manager_id);

-- ───────────────────────────────────────────────────────────────────
-- STEP 12: MIGRATE EXISTING APPROVAL DATA TO NEW STRUCTURE
-- ───────────────────────────────────────────────────────────────────

-- Migrate manager_approvals to approval_logs
INSERT INTO approval_logs (expense_id, approver_id, step_order, type, action, comment, created_at)
SELECT 
  ticket_id,
  manager_id,
  1,  -- First step in sequential flow
  'SEQUENTIAL'::approver_type,
  CASE 
    WHEN status = 'approved' THEN 'APPROVED'::approval_action
    WHEN status = 'rejected' THEN 'REJECTED'::approval_action
    ELSE 'PENDING'::approval_action
  END,
  request_status,  -- Use request_status as comment
  created_at
FROM manager_approvals
ON CONFLICT DO NOTHING;

-- Note: admin_approvals and individual_approvals will be handled in Phase 2
-- after we understand their usage patterns better

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1 COMPLETE ✅
-- ═══════════════════════════════════════════════════════════════════
-- Next: Verify tables created correctly before Phase 2
-- ═══════════════════════════════════════════════════════════════════
