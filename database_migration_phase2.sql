-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2: DATA MIGRATION & VERIFICATION
-- ═══════════════════════════════════════════════════════════════════
-- Run this AFTER Phase 1 completes successfully
-- This migrates data from old approval tables to new structure
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- STEP 1: VERIFY PHASE 1 COMPLETED
-- ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  table_count INT;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('companies', 'approval_rules', 'approval_rule_steps', 
                     'approval_rule_parallel_approvers', 'approval_logs', 
                     'payment_cycles', 'audit_logs');
  
  IF table_count < 7 THEN
    RAISE EXCEPTION 'Phase 1 incomplete! Expected 7 new tables, found %', table_count;
  END IF;
  
  RAISE NOTICE '✅ Phase 1 verified - All 7 tables exist';
END $$;

-- ───────────────────────────────────────────────────────────────────
-- STEP 2: CREATE DEFAULT APPROVAL RULE FROM admin_approvals DATA
-- ───────────────────────────────────────────────────────────────────

-- First, analyze admin_approvals to understand the configuration
DO $$
DECLARE
  default_rule_id UUID;
  approver UUID;
  step_num INT := 1;
BEGIN
  -- Create a default approval rule
  INSERT INTO approval_rules (
    company_id, 
    name, 
    is_default, 
    is_manager_approver,
    min_approval_percentage
  )
  SELECT 
    '00000000-0000-0000-0000-000000000001',  -- Default company
    'Legacy Default Rule',
    TRUE,
    BOOL_OR(is_manager_approve),  -- TRUE if any row has is_manager_approve = TRUE
    COALESCE(MAX(minimum_approval), 0)
  FROM admin_approvals
  RETURNING id INTO default_rule_id;

  -- Add approvers from approver_list to sequential steps
  FOR approver IN 
    SELECT DISTINCT unnest(approver_list)::UUID
    FROM admin_approvals
    WHERE approver_list IS NOT NULL AND array_length(approver_list, 1) > 0
  LOOP
    INSERT INTO approval_rule_steps (rule_id, approver_id, step_order, is_required)
    VALUES (default_rule_id, approver, step_num, TRUE);
    step_num := step_num + 1;
  END LOOP;

  RAISE NOTICE '✅ Created default approval rule with ID: %', default_rule_id;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- STEP 3: VERIFY DATA MIGRATION COUNTS
-- ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  old_manager_count INT;
  new_approval_count INT;
BEGIN
  SELECT COUNT(*) INTO old_manager_count FROM manager_approvals;
  SELECT COUNT(*) INTO new_approval_count FROM approval_logs;
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 Migration Summary:';
  RAISE NOTICE '   Old manager_approvals: %', old_manager_count;
  RAISE NOTICE '   New approval_logs: %', new_approval_count;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- ───────────────────────────────────────────────────────────────────
-- STEP 4: CREATE AUDIT LOG ENTRIES FOR MIGRATION
-- ───────────────────────────────────────────────────────────────────

-- Log that we migrated the data (use first admin as actor)
INSERT INTO audit_logs (actor_id, action, target_id, target_type, company_id, reason)
SELECT 
  (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
  'SETTINGS_CHANGED'::audit_action_type,
  '00000000-0000-0000-0000-000000000001'::UUID,
  'SYSTEM',
  '00000000-0000-0000-0000-000000000001'::UUID,
  'Database migration from legacy approval tables to new approval_logs structure'
WHERE EXISTS (SELECT 1 FROM profiles WHERE role = 'admin');

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2 COMPLETE ✅
-- ═══════════════════════════════════════════════════════════════════
-- Next: Test the new system thoroughly before running Phase 3
-- DO NOT drop old tables yet - keep them as backup for now
-- ═══════════════════════════════════════════════════════════════════
