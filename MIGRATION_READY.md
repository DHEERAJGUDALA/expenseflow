# 🎯 Database Migration - Ready to Execute

## What I Created

### Migration Files (3-Phase Approach)

1. **`database_migration_phase1.sql`** - Non-destructive setup
   - Creates 7 new tables (companies, approval_rules, approval_rule_steps, etc.)
   - Adds missing columns to existing tables
   - Creates default company
   - Migrates manager_approvals → approval_logs
   - **Safe to run** - doesn't delete anything

2. **`database_migration_phase2.sql`** - Data migration
   - Creates default approval rule from admin_approvals
   - Verifies data integrity
   - Creates audit log entries

3. **`database_migration_phase3.sql`** - Cleanup (optional)
   - Moves old tables to `archive` schema (NOT deleted)
   - Reversible if needed

### Helper Scripts

4. **`verify-migration.js`** - Verification tool
   - Checks which phase you're in
   - Shows table counts
   - Validates column additions
   - Tells you what to do next

5. **`MIGRATION_GUIDE.md`** - Complete documentation
   - Step-by-step instructions
   - Rollback procedures
   - Troubleshooting guide

---

## Execute Migration Now

### Step 1: Verify Current State

```bash
cd ReimbursementManagement-main/backend
node verify-migration.js
```

This will show you:
- Which tables exist
- How many records are in each
- What phase you're in
- What to do next

### Step 2: Run Phase 1 in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Copy **entire contents** of `database_migration_phase1.sql`
3. Paste and click **Run**

**Expected result:**
```
✅ Created companies table
✅ Created approval_rules table
✅ Migrated X records from manager_approvals
... (more success messages)
```

### Step 3: Verify Phase 1

```bash
node verify-migration.js
```

Should show:
```
✅ Phase 1: COMPLETE
🆕 NEW TABLES:
   ✅ companies (1 record)
   ✅ approval_logs (X records)
   ... all 7 tables
```

### Step 4: Run Phase 2 (Optional but Recommended)

1. Copy `database_migration_phase2.sql` to Supabase SQL Editor
2. Run it

This creates default approval rules based on your existing admin_approvals config.

### Step 5: Test the System

```bash
# Test workflow engine
node test-workflows.js

# Start backend
$env:PORT = 3000; npm run dev
```

### Step 6: Phase 3 (Later, After Confirmation)

Once you've verified everything works for a few days:

1. Copy `database_migration_phase3.sql` to Supabase SQL Editor
2. Run it to move old tables to archive

---

## What Gets Migrated

### Automatic Migrations

✅ **manager_approvals** → **approval_logs**
- All approval records preserved
- Status mapped: approved → APPROVED, rejected → REJECTED
- Marked as step 1 in sequential flow

✅ **admin_approvals** → **approval_rules**
- Approver list → approval_rule_steps (sequential)
- minimum_approval → min_approval_percentage
- is_manager_approve → is_manager_approver flag

✅ **Profiles**
- Added: company_id (links to default company)
- Added: job_title (NULL initially)
- Existing: manager_id already exists

✅ **Expenses**
- Added: employee_id (backfilled from user_id)
- Added: company_id (default company)
- Added: currency, converted_amount (defaults applied)
- Added: current_step, payment_cycle_id (for workflow tracking)

### What Stays the Same

✅ All existing data preserved
✅ Auth users unchanged
✅ Existing expenses still visible
✅ No downtime required

---

## Safety Features

### Built-in Safety

1. **Idempotent** - Can run multiple times safely
2. **Non-destructive** - Old tables kept until Phase 3
3. **Archived not deleted** - Phase 3 moves to archive schema
4. **Rollback ready** - Instructions in MIGRATION_GUIDE.md

### Verification Checks

- Counts old vs new records
- Validates table existence
- Checks column additions
- Provides clear next steps

---

## After Migration: Backend Code Changes Needed

The migration creates the tables, but you'll need to update backend code:

### 1. Update Expense Controller

```javascript
// OLD: Uses user_id
const { user_id, amount, category } = req.body;

// NEW: Uses employee_id + company_id
const { employee_id, company_id, amount, currency, category } = req.body;
```

### 2. Use New Approval System

```javascript
// OLD: Direct manager_approvals insert
await supabase.from('manager_approvals').insert({...});

// NEW: Use approval workflow engine
const { initializeWorkflow, processApproval } = require('./services/approvalWorkflowEngine');
await initializeWorkflow(expenseId);
```

### 3. Query Approval Logs

```javascript
// OLD: Multiple queries
const { data: managerApprovals } = await supabase.from('manager_approvals')...
const { data: adminApprovals } = await supabase.from('admin_approvals')...

// NEW: Single query
const { data: approvals } = await supabase
  .from('approval_logs')
  .select('*')
  .eq('expense_id', expenseId)
  .order('step_order');
```

---

## Need Help?

Run verification anytime:
```bash
node verify-migration.js
```

Check migration guide:
```bash
cat MIGRATION_GUIDE.md
```

Inspect current data:
```bash
node inspect-schema.js
```

---

## Ready to Proceed?

**Run this command to start:**

```bash
cd ReimbursementManagement-main/backend
node verify-migration.js
```

Then follow the instructions it provides.
