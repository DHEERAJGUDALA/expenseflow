# 🗄️ Database Migration Guide

## Overview

This migration transforms the legacy approval system into a flexible, multi-step workflow engine.

### What Changes

**Before (Legacy):**
- 3 separate tables: `manager_approvals`, `admin_approvals`, `individual_approvals`
- Limited to single-step manager approval
- No support for parallel or percentage-based approvals

**After (New System):**
- Single unified table: `approval_logs`
- Configurable workflows via `approval_rules`
- Supports sequential, parallel, and percentage-based approvals
- Special approver override capability
- Full audit trail

---

## Migration Phases

### Phase 1: Add New Tables (Non-Destructive) ✅
- Creates 7 new tables
- Adds missing columns to existing tables
- Migrates manager_approvals data to approval_logs
- **No data is deleted**

**Run:** `database_migration_phase1.sql` in Supabase SQL Editor

### Phase 2: Data Migration & Verification ✅
- Creates default approval rule from admin_approvals config
- Verifies data integrity
- Creates audit log entry

**Run:** `database_migration_phase2.sql` after Phase 1 succeeds

### Phase 3: Cleanup (Destructive) ⚠️
- Archives old tables to `archive` schema (safe)
- Does NOT permanently delete (unless you uncomment that section)

**Run:** `database_migration_phase3.sql` after testing new system

---

## Step-by-Step Instructions

### 1. Backup Your Database ⚠️

Before running ANY migration, create a backup:

1. Go to Supabase Dashboard → Settings → Database
2. Click "Create Backup" or export your data

### 2. Run Phase 1

```sql
-- Copy entire contents of database_migration_phase1.sql
-- Paste into Supabase SQL Editor
-- Click "Run"
```

**Expected output:**
```
✅ Created 7 new tables
✅ Added columns to profiles
✅ Added columns to expenses
✅ Migrated N records from manager_approvals
```

### 3. Verify Phase 1

Run verification script:
```bash
cd ReimbursementManagement-main/backend
node verify-migration.js
```

### 4. Run Phase 2

```sql
-- Copy entire contents of database_migration_phase2.sql
-- Paste into Supabase SQL Editor
-- Click "Run"
```

**Expected output:**
```
✅ Phase 1 verified - All 7 tables exist
✅ Created default approval rule with ID: ...
📊 Migration Summary:
   Old manager_approvals: X
   New approval_logs: X
```

### 5. Test New System

```bash
# Test workflow engine
node test-workflows.js

# Start backend
$env:PORT = 3000; npm run dev

# Test API endpoints
curl http://localhost:3000/api/workflows
```

### 6. Run Phase 3 (After Testing) ⚠️

Only run this after confirming the new system works:

```sql
-- Copy entire contents of database_migration_phase3.sql
-- Paste into Supabase SQL Editor
-- Click "Run"
```

This moves old tables to `archive` schema (safe, reversible).

---

## New Table Reference

### `companies`
- Stores company/organization info
- One default company created: `Default Company` (INR)

### `approval_rules`
- Defines approval workflow configuration
- Links to company
- Specifies threshold, category filters, percentage requirements

### `approval_rule_steps`
- Sequential approvers for a rule
- Ordered by `step_order` (1, 2, 3...)
- Marks if approver is required

### `approval_rule_parallel_approvers`
- Parallel approvers (CFO, CEO) who can override
- Not bound to step order

### `approval_logs`
- Single source of truth for ALL approvals
- Replaces: manager_approvals, admin_approvals, individual_approvals
- Tracks: PENDING → APPROVED/REJECTED/SKIPPED

### `payment_cycles`
- Batches approved expenses for payment processing
- Linked to approved expenses

### `audit_logs`
- Tracks all significant actions
- Stores old/new values as JSONB
- Immutable audit trail

---

## Rollback Instructions

If something goes wrong:

### After Phase 1 or 2:
Old tables still exist, just run:
```sql
-- Delete new tables
DROP TABLE IF EXISTS approval_logs CASCADE;
DROP TABLE IF EXISTS approval_rule_parallel_approvers CASCADE;
DROP TABLE IF EXISTS approval_rule_steps CASCADE;
DROP TABLE IF EXISTS approval_rules CASCADE;
DROP TABLE IF EXISTS payment_cycles CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- Remove added columns (optional)
ALTER TABLE profiles DROP COLUMN IF EXISTS job_title;
ALTER TABLE profiles DROP COLUMN IF EXISTS company_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS employee_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS company_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS converted_amount;
ALTER TABLE expenses DROP COLUMN IF EXISTS currency;
ALTER TABLE expenses DROP COLUMN IF EXISTS current_step;
```

### After Phase 3:
Restore from archive:
```sql
ALTER TABLE archive.manager_approvals SET SCHEMA public;
ALTER TABLE archive.admin_approvals SET SCHEMA public;
ALTER TABLE archive.individual_approvals SET SCHEMA public;
```

---

## Verification Checklist

After each phase, verify:

### Phase 1
- [ ] 7 new tables exist
- [ ] `profiles` has `company_id`, `job_title` columns
- [ ] `expenses` has `employee_id`, `company_id`, `currency` columns
- [ ] Default company record exists
- [ ] approval_logs contains migrated manager_approvals data

### Phase 2
- [ ] At least 1 approval_rule exists
- [ ] approval_rule_steps contains approvers (if any were configured)
- [ ] audit_logs has migration entry

### Phase 3
- [ ] Old tables moved to `archive` schema
- [ ] `public.manager_approvals` does NOT exist
- [ ] Backend still works with new tables

---

## Troubleshooting

### "ERROR: relation already exists"
**Safe to ignore** - Phase 1 is idempotent (can run multiple times)

### "ERROR: type already exists"
**Safe to ignore** - ENUMs wrapped in exception handlers

### "ERROR: column already exists"
**Safe to ignore** - Uses `ADD COLUMN IF NOT EXISTS`

### Migration script fails midway
1. Check Supabase logs for exact error
2. Fix the issue
3. Re-run the same phase (safe to retry)

### Data looks wrong after migration
1. Check `approval_logs` record count
2. Run verification script
3. If needed, restore from backup and investigate

---

## Need Help?

1. Run verification script: `node verify-migration.js`
2. Check Supabase logs: Dashboard → Database → Logs
3. Inspect data: `node inspect-schema.js`
4. Check this summary for context
