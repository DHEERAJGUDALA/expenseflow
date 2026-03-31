-- ═══════════════════════════════════════════════════════════════
-- MIGRATION V3: Remove manager relationship
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Null out all manager_id values in profiles
UPDATE profiles SET manager_id = NULL WHERE manager_id IS NOT NULL;

-- 2. Set is_manager_approver = false for all existing rules
UPDATE approval_rules SET is_manager_approver = false WHERE is_manager_approver = true;

-- ═══════════════════════════════════════════════════════════════
-- DONE. manager_id column is kept but unused. 
-- is_manager_approver column is kept but always false.
-- ═══════════════════════════════════════════════════════════════
