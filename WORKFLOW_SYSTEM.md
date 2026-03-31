# Enhanced Approval Workflow System

## Overview
This system supports flexible approval workflows with:
- **Sequential** approval (A → B → C, all required in order)
- **Parallel** approval (A, B, C all approve independently)
- **Percentage-based** approval (e.g., 2 out of 3 = approved)
- **Special approver** override (CFO/CEO can approve/reject anytime)
- **Smart auto-rejection** (if mathematically impossible to reach threshold)

---

## Step 1: Run the Schema Migration

Run this SQL in your Supabase SQL Editor:

```sql
-- Copy the entire content from database_schema_enhanced.sql and run it
```

Or use the file directly:
```bash
cd backend
cat ../database_schema_enhanced.sql
# Copy and paste into Supabase SQL Editor
```

---

## Step 2: Test the Workflow System

### Test 1: Sequential Approval (Manager A → Manager B → Manager C)

```bash
node test-workflows.js sequential
```

**Expected:**
- Submit expense → Status: PENDING (waiting for Manager A)
- Manager A approves → Status: PENDING (waiting for Manager B)
- Manager B approves → Status: PENDING (waiting for Manager C)
- Manager C approves → Status: **APPROVED**

---

### Test 2: Special Approver Override

```bash
node test-workflows.js special-override
```

**Expected:**
- Submit expense → Manager A approves → Manager B still pending
- Special Approver (CFO) approves → Status: **APPROVED** immediately
- Manager B log = **SKIPPED**

---

### Test 3: Percentage-based (60% threshold, 3 approvers)

```bash
node test-workflows.js percentage
```

**Expected:**
- Submit expense → Pending
- Manager 1 approves → 33% (1/3) - Still pending
- Manager 2 approves → 66% (2/3) >= 60% → Status: **APPROVED**
- Manager 3 log = **SKIPPED** (threshold already reached)

---

### Test 4: Mathematical Impossibility (60% threshold, 3 approvers)

```bash
node test-workflows.js impossible
```

**Expected:**
- Submit expense → Pending
- Manager 1 rejects → 0% approved, max possible = 66% (2/3)
- Manager 2 rejects → 0% approved, max possible = 33% (1/3) < 60%
- Status: **AUTO-REJECTED** (Manager 3 doesn't need to vote)

---

### Test 5: Required Approver Rejection

```bash
node test-workflows.js required-rejection
```

**Expected:**
- Submit expense → Pending
- Manager A (required) rejects → Status: **REJECTED** immediately
- Manager B (optional) log = **SKIPPED**

---

## API Endpoints

### Create Workflow (Admin)

```bash
POST /api/workflows
```

**Body:**
```json
{
  "employee_id": "uuid-of-employee",
  "workflow_name": "Standard Manager Approval",
  "approval_type": "sequential",
  "approvers": [
    { "approver_id": "manager-a-uuid", "step_order": 1, "is_required": true },
    { "approver_id": "manager-b-uuid", "step_order": 2, "is_required": true }
  ]
}
```

**Approval Types:**
- `"sequential"` - Approvers must approve in order
- `"parallel"` - All approvers can approve independently
- `"percentage"` - X% of approvers must approve

**For Percentage:**
```json
{
  "approval_type": "percentage",
  "approval_threshold": 60,
  "approvers": [...]
}
```

**With Special Approver (CFO/CEO):**
```json
{
  "has_special_approver": true,
  "special_approver_id": "cfo-uuid",
  "approvers": [...]
}
```

---

### Get Workflows

```bash
GET /api/workflows
```

Returns all workflows.

---

### Get Workflow for Employee

```bash
GET /api/workflows/employee/:employeeId
```

---

### Get Expense Approval Status

```bash
GET /api/workflows/expense/:expenseId/status
```

**Response:**
```json
{
  "expense": {...},
  "logs": [
    {
      "approver": { "email": "manager@example.com" },
      "action": "approved",
      "comments": "Looks good",
      "created_at": "2026-03-29T10:00:00Z"
    }
  ],
  "evaluation": {
    "status": "pending",
    "reason": "Current: 50%, Need: 60%",
    "stats": {
      "approvals": 1,
      "rejections": 0,
      "pending": 1,
      "totalApprovers": 2
    }
  }
}
```

---

### Process Approval

```bash
POST /api/workflows/expense/:expenseId/process
```

**Body:**
```json
{
  "action": "approved",
  "comments": "Approved for reimbursement"
}
```

`action` can be `"approved"` or `"rejected"`.

---

## Frontend Integration

### 1. Workflow Configuration Page (Admin)

Create a page where admins can:
- Select an employee
- Choose approval type (sequential/parallel/percentage)
- Select approvers (managers/special approvers)
- Set threshold for percentage-based
- Assign special approver (optional)

### 2. Enhanced Approvals Page (Manager)

Update `ApprovalsPage.jsx` to:
- Show workflow progress (step 1 of 3, 2/3 approved, etc.)
- Display special approver badge
- Show if approval was skipped
- Display evaluation reason

### 3. Expense Details Modal

Show:
- Approval workflow diagram
- Current step/progress
- Who approved/rejected and when
- Comments from each approver

---

## Database Schema

### approval_workflows
- `employee_id` - Who this workflow applies to
- `approval_type` - sequential/parallel/percentage
- `approval_threshold` - % needed (for percentage type)
- `has_special_approver` - Boolean
- `special_approver_id` - UUID of special approver

### approval_steps
- `workflow_id` - Links to workflow
- `approver_id` - Who approves at this step
- `step_order` - Sequence number
- `is_required` - If false, can be skipped

### expense_approval_logs
- `expense_id` - Which expense
- `approver_id` - Who acted
- `action` - approved/rejected/skipped
- `comments` - Optional message
- `is_special_override` - If special approver did this

---

## Logic Flow

1. **Employee submits expense**
   - System checks for active workflow
   - Links workflow to expense
   - Sets status to PENDING

2. **Approver processes**
   - Log is created
   - Engine evaluates current state
   - Checks if threshold reached or impossible
   - Updates expense status if final decision

3. **Engine Evaluation:**
   - **Sequential**: Check if current step approved, move to next
   - **Parallel**: Check if all required approved
   - **Percentage**: Calculate %, check if reached or impossible
   - **Special Override**: Immediate approval/rejection

4. **Auto-skip remaining**
   - If approved via threshold or special approver
   - Mark pending approvers as SKIPPED
   - Prevents unnecessary waiting

---

## Example Workflow Configurations

### CEO/CFO Override
```json
{
  "employee_id": "employee-uuid",
  "workflow_name": "Standard with CEO Override",
  "approval_type": "sequential",
  "has_special_approver": true,
  "special_approver_id": "ceo-uuid",
  "approvers": [
    { "approver_id": "manager-uuid", "step_order": 1, "is_required": true },
    { "approver_id": "finance-uuid", "step_order": 2, "is_required": true }
  ]
}
```

### 2-of-3 Manager Vote
```json
{
  "employee_id": "employee-uuid",
  "workflow_name": "Department Managers Vote",
  "approval_type": "percentage",
  "approval_threshold": 67,
  "approvers": [
    { "approver_id": "manager1-uuid", "step_order": 1, "is_required": false },
    { "approver_id": "manager2-uuid", "step_order": 1, "is_required": false },
    { "approver_id": "manager3-uuid", "step_order": 1, "is_required": false }
  ]
}
```

---

## Restart Backend & Test

```bash
cd backend
npm run dev
```

Then test endpoints using Postman or the frontend!
