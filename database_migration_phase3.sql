-- ═══════════════════════════════════════════════════════════════════
-- PHASE 3: CLEANUP OLD TABLES (DESTRUCTIVE - RUN AFTER VERIFICATION)
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️  WARNING: This will permanently delete old approval tables
-- ⚠️  Only run this after thoroughly testing the new system
-- ⚠️  Make sure you have a backup before running this
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- SAFETY CHECK: Verify new system has data
-- ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  approval_logs_count INT;
  approval_rules_count INT;
BEGIN
  SELECT COUNT(*) INTO approval_logs_count FROM approval_logs;
  SELECT COUNT(*) INTO approval_rules_count FROM approval_rules;
  
  IF approval_logs_count = 0 THEN
    RAISE EXCEPTION '❌ approval_logs is empty! Migration may have failed.';
  END IF;
  
  IF approval_rules_count = 0 THEN
    RAISE EXCEPTION '❌ approval_rules is empty! No rules configured.';
  END IF;
  
  RAISE NOTICE '✅ Safety check passed:';
  RAISE NOTICE '   - approval_logs: % records', approval_logs_count;
  RAISE NOTICE '   - approval_rules: % rules', approval_rules_count;
END $$;

-- ───────────────────────────────────────────────────────────────────
-- BACKUP OLD TABLES TO ARCHIVE (OPTIONAL BUT RECOMMENDED)
-- ───────────────────────────────────────────────────────────────────

-- Create archive schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS archive;

-- Move old tables to archive instead of dropping
ALTER TABLE IF EXISTS manager_approvals SET SCHEMA archive;
ALTER TABLE IF EXISTS admin_approvals SET SCHEMA archive;
ALTER TABLE IF EXISTS individual_approvals SET SCHEMA archive;

RAISE NOTICE '✅ Old tables moved to "archive" schema';
RAISE NOTICE '   - archive.manager_approvals';
RAISE NOTICE '   - archive.admin_approvals';
RAISE NOTICE '   - archive.individual_approvals';
RAISE NOTICE '';
RAISE NOTICE '💡 To restore: ALTER TABLE archive.manager_approvals SET SCHEMA public;';
RAISE NOTICE '💡 To permanently delete: DROP SCHEMA archive CASCADE;';

-- ═══════════════════════════════════════════════════════════════════
-- ALTERNATIVE: PERMANENT DELETION (Uncomment if you're 100% sure)
-- ═══════════════════════════════════════════════════════════════════

-- DROP TABLE IF EXISTS manager_approvals CASCADE;
-- DROP TABLE IF EXISTS admin_approvals CASCADE;
-- DROP TABLE IF EXISTS individual_approvals CASCADE;
-- RAISE NOTICE '🗑️  Old tables permanently deleted';

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 3 COMPLETE ✅
-- ═══════════════════════════════════════════════════════════════════
-- Migration complete! Old tables archived for safety.
-- You can drop the archive schema after 30 days if everything works.
-- ═══════════════════════════════════════════════════════════════════
