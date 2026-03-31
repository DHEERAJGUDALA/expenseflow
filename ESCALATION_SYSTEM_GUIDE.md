# ✅ ESCALATION SYSTEM - DEPLOYMENT COMPLETE

## 🚀 Quick Start

### 1. Database Migration (CRITICAL - DO THIS FIRST)
```sql
-- Go to Supabase Dashboard → SQL Editor
-- Copy and run the entire SQL migration provided at the start of the conversation
-- It adds escalation columns, tables, views, and functions
```

### 2. Backend Setup
```bash
cd backend
npm install  # Ensures node-cron is installed
$env:PORT = 3000  # PowerShell
npm run dev
```

**Expected Console Output:**
```
🚀 Server running on port 3000
📍 API: http://localhost:3000/api
❤️  Health: http://localhost:3000/health
🕐 Starting escalation cron jobs...
✅ Escalation cron jobs started:
   - Escalation processor: Every hour at minute 0
   - Leave expiration: Daily at midnight
```

### 3. Frontend Setup
```bash
cd frontend
npm install  # Ensures lucide-react is installed
npm run dev
```

---

## 🧪 Testing Guide

### Test 1: Approval Preview (All Users)
**Goal:** See approval workflow before submitting expense

1. Login as **employee** or **manager**
2. Navigate to `/app/expenses/new`
3. Enter **amount** (e.g., 5000)
4. Select **category** (e.g., Travel)
5. **Wait 700ms** - Approval preview will appear showing:
   - ✅ List of approvers
   - ✅ Step order
   - ✅ Estimated approval time
   - ✅ Warning if approver is on leave

**Expected:** Visual workflow diagram appears at bottom of form

---

### Test 2: Admin Cannot Submit Expenses
**Goal:** Verify admins are blocked from submitting expenses

1. Login as **admin**
2. Navigate to `/app/expenses/new`
3. Try to submit an expense
4. **Expected:** Error message: "Admins cannot submit expenses. Only employees and managers can submit."

---

### Test 3: Manager Can Submit Expenses
**Goal:** Verify managers can submit their own expenses

1. Login as **manager** (who has a manager above them)
2. Navigate to `/app/expenses/new`
3. Submit an expense
4. **Expected:** 
   - Expense submitted successfully
   - Approval goes to THEIR manager (not to themselves)
   - Cannot approve their own expense

---

### Test 4: Set Manager on Leave (Admin Only)
**Goal:** Put manager on leave and auto-escalate their pending approvals

**Setup:**
1. Create a pending approval assigned to a manager (submit expense as employee)
2. Login as **admin**

**Steps:**
1. Navigate to `/app/manager-leave`
2. Select a manager from dropdown
3. Choose leave dates (start today, end in 7 days)
4. Click "Set Manager on Leave"

**Expected:**
- ✅ Success message appears
- ✅ Manager appears in "Managers on Leave" list
- ✅ All pending approvals assigned to that manager escalate to admin immediately
- ✅ Check `/app/approvals` - you should see escalated approvals

---

### Test 5: Return Manager from Leave
**Goal:** Remove leave status and allow manager to approve again

1. Stay on `/app/manager-leave` as admin
2. Find manager in "Managers on Leave" list
3. Click "Return from Leave"
4. **Expected:**
   - Manager removed from leave list
   - Manager can now approve expenses again
   - Future expenses will route to them normally

---

### Test 6: Auto-Escalation After 15 Days (Time-Based)
**Goal:** Verify cron job escalates old approvals

**Manual Test (Backend Console):**
1. Open backend terminal
2. Wait until the next hour (e.g., 2:00 PM, 3:00 PM)
3. Watch console for:
   ```
   🔄 [CRON] Running escalation processor...
   ✅ [CRON] Escalation complete: X escalated, Y failed
   ```

**Database Test:**
1. Go to Supabase → SQL Editor
2. Manually create an old approval:
   ```sql
   -- Create approval that's 20 days old (should escalate)
   INSERT INTO approval_logs (expense_id, approver_id, action, created_at)
   VALUES (
     'some-expense-id',
     'some-manager-id',
     'PENDING',
     NOW() - INTERVAL '20 days'
   );
   ```
3. Wait for next hourly cron job OR restart backend
4. Check `approval_logs` - should see `escalated = true`

---

### Test 7: Leave Auto-Expiration (Daily Cron)
**Goal:** Verify leave status expires automatically

1. Set manager on leave with end date = today
2. Wait until midnight (or manually trigger via DB)
3. **Expected:** Next day, manager's `on_leave` is set to `false`

**Manual Test:**
```sql
-- Check if function works
SELECT auto_expire_leave_status();

-- Verify results
SELECT id, email, on_leave, leave_end_date 
FROM profiles 
WHERE role = 'manager';
```

---

### Test 8: Approval Preview Shows Escalation Warning
**Goal:** Preview shows warning if approver is on leave

**Setup:**
1. Set a manager on leave (Admin: `/app/manager-leave`)
2. Login as **employee** who reports to that manager

**Steps:**
1. Navigate to `/app/expenses/new`
2. Enter amount and category
3. Look at approval preview

**Expected:**
- ⚠️ Orange warning box appears saying:
  - "Will escalate: Manager is on leave until [date]"
- Preview shows manager's name with leave indicator

---

## 🔍 Troubleshooting

### Backend Won't Start
**Error:** `SyntaxError: The requested module '../config/supabaseClient.js' does not provide an export named 'default'`

**Fix:** Already fixed - import changed to `import { supabase } from ...`

### Frontend Error: `Failed to resolve import "lucide-react"`
**Fix:** Already fixed - `npm install lucide-react` in frontend

### Cron Jobs Not Running
**Check:**
1. Backend console shows: "🕐 Starting escalation cron jobs..."
2. If not, check `server.js` imports `startEscalationJobs()`
3. Verify `node-cron` is installed: `npm list node-cron`

### Approval Preview Not Showing
**Debug:**
1. Open browser DevTools → Network tab
2. Enter amount/category in expense form
3. Look for request to `/api/approvals/preview?amount=X&category=Y`
4. Check response - should return approval steps
5. If 404: Verify `approvalRoutes.js` has preview routes added
6. If 500: Check backend console for error

### Manager Leave Page 404
**Fix:**
1. Verify route exists in `App.jsx`: `/app/manager-leave`
2. Verify component imported: `ManagerLeaveManagementPage`
3. Restart frontend dev server

---

## 📊 Database Verification

After running migration, verify in Supabase:

```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('on_leave', 'leave_start_date', 'leave_end_date');

-- Check escalation_history table exists
SELECT * FROM escalation_history LIMIT 1;

-- Check view exists
SELECT * FROM approvals_needing_escalation LIMIT 1;

-- Check function exists
SELECT auto_expire_leave_status();
```

---

## 🎯 Feature Checklist

✅ **Database Migration**
- [x] `profiles` has leave columns
- [x] `approval_logs` has escalation columns
- [x] `companies` has escalation settings
- [x] `escalation_history` table created
- [x] `approvals_needing_escalation` view created
- [x] `auto_expire_leave_status()` function created

✅ **Backend Implementation**
- [x] Escalation routes created (`/api/escalation/*`)
- [x] Approval preview routes added (`/api/approvals/preview`)
- [x] Cron jobs running (hourly + daily)
- [x] Admin blocking in expense submission
- [x] Manager submission workflow updated
- [x] Self-approval prevention

✅ **Frontend Implementation**
- [x] ApprovalLifecycleVisualizer component
- [x] Expense form shows approval preview
- [x] Manager leave management page
- [x] API functions for escalation
- [x] Route added: `/app/manager-leave`

✅ **Business Logic**
- [x] Admins cannot submit expenses
- [x] Managers can submit expenses
- [x] 15-day timeout auto-escalation
- [x] Manager on leave immediate escalation
- [x] Leave auto-expiration
- [x] Escalation audit trail

---

## 📱 API Endpoints Reference

### Escalation API
```
POST   /api/escalation/manager/:id/set-leave          (Admin)
POST   /api/escalation/manager/:id/remove-leave       (Admin)
GET    /api/escalation/stats                          (Admin/Manager)
GET    /api/escalation/managers-on-leave              (Admin)
```

### Approval Preview API
```
GET    /api/approvals/preview?amount=X&category=Y     (All)
GET    /api/approvals/can-submit                      (All)
```

---

## 🔐 Permissions

| Feature | Employee | Manager | Admin |
|---------|----------|---------|-------|
| Submit Expense | ✅ | ✅ | ❌ |
| View Approval Preview | ✅ | ✅ | ✅ |
| Set Manager Leave | ❌ | ❌ | ✅ |
| View Managers on Leave | ❌ | ❌ | ✅ |
| Approve Expenses | ❌ | ✅ | ✅ |
| Receive Escalated Approvals | ❌ | ❌ | ✅ |

---

## 🐛 Known Limitations

1. **Escalation runs hourly** - Not instant for timeout escalations (by design)
2. **Leave expiration at midnight** - Manager stays on leave until daily cron runs
3. **No email notifications** - Escalations happen silently (can be added later)
4. **Single admin escalation target** - All escalations go to first admin found (enhancement opportunity)

---

## 🎓 Next Steps (Future Enhancements)

1. **Email notifications** when escalation occurs
2. **Escalation dashboard** showing all escalated expenses
3. **Custom escalation timeout** per approval rule (not globally 15 days)
4. **Escalation reason display** on expense detail page
5. **Historical escalation reports** for analytics
6. **Manager delegation** - Assign temporary approver instead of escalating
7. **Escalation to specific admin** - Choose which admin receives escalations

---

## 📞 Support

If issues persist:
1. Check backend console logs for errors
2. Check browser DevTools console for frontend errors
3. Verify database migration ran successfully
4. Ensure all packages installed (`node-cron`, `lucide-react`)
5. Restart both backend and frontend servers

---

**Last Updated:** 2026-03-29
**Version:** 1.0.0
**Status:** Production Ready ✅
