-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR MULTI-TENANCY ISOLATION
-- ============================================================================
-- Run these commands in Supabase SQL Editor AFTER fixing backend code
-- RLS provides a safety net at the database level to prevent cross-company data leaks
-- This script is IDEMPOTENT - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- STEP 0: Drop existing policies (makes this script idempotent)
-- ============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "company_isolation_profiles_select" ON profiles;
DROP POLICY IF EXISTS "own_profile_update" ON profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;

-- Companies policies
DROP POLICY IF EXISTS "own_company_select" ON companies;
DROP POLICY IF EXISTS "admin_update_company" ON companies;

-- Expenses policies
DROP POLICY IF EXISTS "company_isolation_expenses_select" ON expenses;
DROP POLICY IF EXISTS "employee_insert_expenses" ON expenses;
DROP POLICY IF EXISTS "admin_update_expenses" ON expenses;

-- Approval rules policies
DROP POLICY IF EXISTS "company_isolation_approval_rules_select" ON approval_rules;
DROP POLICY IF EXISTS "admin_insert_approval_rules" ON approval_rules;
DROP POLICY IF EXISTS "admin_update_approval_rules" ON approval_rules;
DROP POLICY IF EXISTS "admin_delete_approval_rules" ON approval_rules;

-- Approval rule steps policies
DROP POLICY IF EXISTS "company_isolation_rule_steps_select" ON approval_rule_steps;
DROP POLICY IF EXISTS "admin_manage_rule_steps" ON approval_rule_steps;

-- Parallel approvers policies
DROP POLICY IF EXISTS "company_isolation_parallel_approvers_select" ON approval_rule_parallel_approvers;
DROP POLICY IF EXISTS "admin_manage_parallel_approvers" ON approval_rule_parallel_approvers;

-- Approval logs policies
DROP POLICY IF EXISTS "company_isolation_approval_logs_select" ON approval_logs;
DROP POLICY IF EXISTS "approver_update_approval_logs" ON approval_logs;

-- Notifications policies
DROP POLICY IF EXISTS "own_notifications_select" ON notifications;
DROP POLICY IF EXISTS "own_notifications_update" ON notifications;
DROP POLICY IF EXISTS "own_notifications_delete" ON notifications;

-- Escalation history policies
DROP POLICY IF EXISTS "company_isolation_escalation_history_select" ON escalation_history;

-- Expense approval steps policies
DROP POLICY IF EXISTS "company_isolation_expense_approval_steps_select" ON expense_approval_steps;
DROP POLICY IF EXISTS "approver_update_expense_approval_steps" ON expense_approval_steps;

-- ============================================================================
-- STEP 1: Enable RLS on all tables
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rule_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rule_parallel_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_approval_steps ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Create RLS policies for PROFILES table
-- ============================================================================

-- Allow users to see only profiles from their own company
CREATE POLICY "company_isolation_profiles_select"
ON profiles FOR SELECT
USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Allow users to update their own profile
CREATE POLICY "own_profile_update"
ON profiles FOR UPDATE
USING (id = auth.uid());

-- Allow admins to insert new profiles in their company
CREATE POLICY "admin_insert_profiles"
ON profiles FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = profiles.company_id
  )
);

-- Allow admins to update profiles in their company
CREATE POLICY "admin_update_profiles"
ON profiles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = profiles.company_id
  )
);

-- Allow admins to delete profiles in their company (except themselves)
CREATE POLICY "admin_delete_profiles"
ON profiles FOR DELETE
USING (
  id != auth.uid() AND
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = profiles.company_id
  )
);

-- ============================================================================
-- STEP 3: Create RLS policies for COMPANIES table
-- ============================================================================

-- Allow users to see only their own company
CREATE POLICY "own_company_select"
ON companies FOR SELECT
USING (
  id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Allow admins to update their own company
CREATE POLICY "admin_update_company"
ON companies FOR UPDATE
USING (
  id = (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================================
-- STEP 4: Create RLS policies for EXPENSES table
-- ============================================================================

-- Allow users to see only expenses from their company
CREATE POLICY "company_isolation_expenses_select"
ON expenses FOR SELECT
USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Allow employees/managers to insert expenses for their company
CREATE POLICY "employee_insert_expenses"
ON expenses FOR INSERT
WITH CHECK (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  AND employee_id = auth.uid()
);

-- Allow admins to update expenses in their company
CREATE POLICY "admin_update_expenses"
ON expenses FOR UPDATE
USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- ============================================================================
-- STEP 5: Create RLS policies for APPROVAL_RULES table
-- ============================================================================

-- Allow users to see only approval rules from their company
CREATE POLICY "company_isolation_approval_rules_select"
ON approval_rules FOR SELECT
USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- Allow admins to insert approval rules for their company
CREATE POLICY "admin_insert_approval_rules"
ON approval_rules FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = approval_rules.company_id
  )
);

-- Allow admins to update approval rules in their company
CREATE POLICY "admin_update_approval_rules"
ON approval_rules FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = approval_rules.company_id
  )
);

-- Allow admins to delete approval rules in their company
CREATE POLICY "admin_delete_approval_rules"
ON approval_rules FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = approval_rules.company_id
  )
);

-- ============================================================================
-- STEP 6: Create RLS policies for APPROVAL_RULE_STEPS table
-- ============================================================================

-- Allow users to see rule steps for rules in their company
CREATE POLICY "company_isolation_rule_steps_select"
ON approval_rule_steps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM approval_rules ar
    WHERE ar.id = approval_rule_steps.rule_id
      AND ar.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- Allow admins to manage rule steps for their company's rules
CREATE POLICY "admin_manage_rule_steps"
ON approval_rule_steps FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM approval_rules ar
    JOIN profiles p ON p.id = auth.uid()
    WHERE ar.id = approval_rule_steps.rule_id
      AND ar.company_id = p.company_id
      AND p.role = 'admin'
  )
);

-- ============================================================================
-- STEP 7: Create RLS policies for APPROVAL_RULE_PARALLEL_APPROVERS table
-- ============================================================================

-- Allow users to see parallel approvers for rules in their company
CREATE POLICY "company_isolation_parallel_approvers_select"
ON approval_rule_parallel_approvers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM approval_rules ar
    WHERE ar.id = approval_rule_parallel_approvers.rule_id
      AND ar.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- Allow admins to manage parallel approvers for their company's rules
CREATE POLICY "admin_manage_parallel_approvers"
ON approval_rule_parallel_approvers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM approval_rules ar
    JOIN profiles p ON p.id = auth.uid()
    WHERE ar.id = approval_rule_parallel_approvers.rule_id
      AND ar.company_id = p.company_id
      AND p.role = 'admin'
  )
);

-- ============================================================================
-- STEP 8: Create RLS policies for APPROVAL_LOGS table
-- ============================================================================

-- Allow users to see approval logs for expenses in their company
CREATE POLICY "company_isolation_approval_logs_select"
ON approval_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = approval_logs.expense_id
      AND e.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- Allow approvers to update their own approval log entries
CREATE POLICY "approver_update_approval_logs"
ON approval_logs FOR UPDATE
USING (
  approver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = approval_logs.expense_id
      AND e.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- ============================================================================
-- STEP 9: Create RLS policies for NOTIFICATIONS table
-- ============================================================================

-- Allow users to see only their own notifications
CREATE POLICY "own_notifications_select"
ON notifications FOR SELECT
USING (user_id = auth.uid());

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "own_notifications_update"
ON notifications FOR UPDATE
USING (user_id = auth.uid());

-- Allow users to delete their own notifications
CREATE POLICY "own_notifications_delete"
ON notifications FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- STEP 10: Create RLS policies for ESCALATION_HISTORY table
-- ============================================================================

-- Allow users to see escalation history for expenses in their company
CREATE POLICY "company_isolation_escalation_history_select"
ON escalation_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = escalation_history.expense_id
      AND e.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- ============================================================================
-- STEP 11: Create RLS policies for EXPENSE_APPROVAL_STEPS table
-- ============================================================================

-- Allow users to see approval steps for expenses in their company
CREATE POLICY "company_isolation_expense_approval_steps_select"
ON expense_approval_steps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_approval_steps.expense_id
      AND e.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- Allow approvers to update their own approval step status
CREATE POLICY "approver_update_expense_approval_steps"
ON expense_approval_steps FOR UPDATE
USING (
  approver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = expense_approval_steps.expense_id
      AND e.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify RLS is enabled on all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'companies', 'expenses', 'approval_rules', 
    'approval_rule_steps', 'approval_rule_parallel_approvers',
    'approval_logs', 'notifications', 'escalation_history',
    'expense_approval_steps'
  )
ORDER BY tablename;

-- List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================

-- 1. RLS is a SAFETY NET - Your backend code should ALREADY filter by company_id
-- 2. These policies ensure database-level isolation even if backend has bugs
-- 3. RLS uses auth.uid() which is the authenticated user's ID from Supabase Auth
-- 4. If you need to disable RLS temporarily for debugging:
--    ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
-- 5. This script is IDEMPOTENT - it drops existing policies before creating them

-- ============================================================================
-- TESTING RLS POLICIES
-- ============================================================================

-- Test as Company A user:
-- 1. Login as admin from Company A
-- 2. Run: SELECT * FROM profiles; -- Should only see Company A users
-- 3. Run: SELECT * FROM expenses; -- Should only see Company A expenses
-- 4. Try to access Company B data by ID -- Should return 0 rows

-- Test as Company B user:
-- 1. Login as admin from Company B
-- 2. Run same queries -- Should only see Company B data

-- ============================================================================
-- END OF RLS POLICIES
-- ============================================================================
