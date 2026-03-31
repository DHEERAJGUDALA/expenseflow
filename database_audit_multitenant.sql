-- ============================================================================
-- MULTI-TENANCY DATABASE AUDIT
-- ============================================================================
-- Run these queries in Supabase SQL Editor to diagnose data corruption
-- DO NOT run the fixes yet - just gather information first
-- ============================================================================

-- ============================================================================
-- CHECK 1: Find profiles with NULL company_id (orphaned users)
-- ============================================================================
SELECT 
  id, 
  email, 
  role, 
  company_id,
  full_name,
  created_at
FROM profiles 
WHERE company_id IS NULL 
ORDER BY created_at DESC;

-- Expected: Should be ZERO rows (all users must belong to a company)
-- If rows exist: Manually assign correct company_id based on who created them

-- ============================================================================
-- CHECK 2: Find duplicate company names
-- ============================================================================
SELECT 
  name, 
  COUNT(*) as duplicate_count,
  array_agg(id) as company_ids,
  array_agg(created_at) as created_dates
FROM companies 
GROUP BY name 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Expected: Should be ZERO rows (company names must be unique)
-- If duplicates exist:
--   1. Keep the oldest company (earliest created_at)
--   2. Reassign all profiles from duplicate companies to the oldest one
--   3. Delete the duplicate company records

-- ============================================================================
-- CHECK 3: Count users per company
-- ============================================================================
SELECT 
  c.id as company_id,
  c.name as company_name,
  COUNT(p.id) as user_count,
  COUNT(CASE WHEN p.role = 'admin' THEN 1 END) as admin_count,
  COUNT(CASE WHEN p.role = 'manager' THEN 1 END) as manager_count,
  COUNT(CASE WHEN p.role = 'employee' THEN 1 END) as employee_count
FROM companies c
LEFT JOIN profiles p ON p.company_id = c.id
GROUP BY c.id, c.name
ORDER BY user_count DESC;

-- This shows the distribution of users across companies
-- Verify each company has at least 1 admin

-- ============================================================================
-- CHECK 4: Find expenses without company_id
-- ============================================================================
SELECT 
  id,
  employee_id,
  amount,
  status,
  created_at
FROM expenses
WHERE company_id IS NULL
LIMIT 20;

-- Expected: Should be ZERO rows
-- If rows exist: Need to backfill from employee's company_id

-- ============================================================================
-- CHECK 5: Find approval rules without company_id
-- ============================================================================
SELECT 
  id,
  name,
  company_id,
  created_at
FROM approval_rules
WHERE company_id IS NULL
LIMIT 20;

-- Expected: Should be ZERO rows
-- If rows exist: Need to backfill or delete orphaned rules

-- ============================================================================
-- CHECK 6: Verify foreign key integrity
-- ============================================================================
-- Find expenses where employee doesn't exist in profiles
SELECT e.id, e.employee_id, e.amount
FROM expenses e
LEFT JOIN profiles p ON e.employee_id = p.id
WHERE p.id IS NULL
LIMIT 10;

-- Find expenses where employee's company_id doesn't match expense's company_id
SELECT 
  e.id as expense_id,
  e.company_id as expense_company_id,
  e.employee_id,
  p.company_id as employee_company_id,
  p.email as employee_email
FROM expenses e
JOIN profiles p ON e.employee_id = p.id
WHERE e.company_id != p.company_id
LIMIT 20;

-- Expected: Should be ZERO rows for both queries

-- ============================================================================
-- CHECK 7: Current RLS status
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'expenses', 'companies', 'approval_rules', 
                    'notifications', 'approval_logs', 'escalation_history')
ORDER BY tablename;

-- rowsecurity should be FALSE for all (RLS not yet enabled)
-- After fixes, we'll enable RLS and create policies

-- ============================================================================
-- AFTER REVIEWING RESULTS ABOVE, PROCEED WITH FIXES BELOW
-- ============================================================================

-- ============================================================================
-- FIX 1: Add unique constraint on company name (ALWAYS RUN THIS)
-- ============================================================================
-- First resolve any duplicates found in CHECK 2, then run:

ALTER TABLE companies 
ADD CONSTRAINT unique_company_name UNIQUE (name);

-- This prevents future duplicate company names at database level

-- ============================================================================
-- FIX 2: Backfill NULL company_ids (ONLY IF CHECK 1 FOUND ORPHANS)
-- ============================================================================
-- Manual fix required - example:
-- UPDATE profiles 
-- SET company_id = 'actual-company-uuid-here'
-- WHERE id IN ('orphaned-user-uuid-1', 'orphaned-user-uuid-2');

-- ============================================================================
-- FIX 3: Backfill expense company_ids (ONLY IF CHECK 4 FOUND NULLS)
-- ============================================================================
-- UPDATE expenses e
-- SET company_id = p.company_id
-- FROM profiles p
-- WHERE e.employee_id = p.id
--   AND e.company_id IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES (Run after fixes)
-- ============================================================================
-- Re-run CHECK 1, 2, 4, 5 to verify all NULLs are fixed
-- Re-run CHECK 6 to verify referential integrity

-- ============================================================================
-- END OF AUDIT
-- ============================================================================
