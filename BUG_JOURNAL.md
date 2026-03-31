# 🐛 Bug Journal — Reimbursement Management System

A chronological record of every bug, issue, and failure encountered during development — with root cause analysis, the exact fix applied, and the lesson learned.

Written for learning, interviews, and future debugging reference.

---

## Table of Contents

1. [Approval Chain Never Built on Submission](#1--approval-chain-never-built-on-submission)
2. [Truncation Cascade Error in Database](#2--truncation-cascade-error-in-database)
3. ["No Approvers Configured for This Rule"](#3--no-approvers-configured-for-this-rule)
4. [Manager Role Shows Employee UI](#4--manager-role-shows-employee-ui)
5. [Login Page Stuck on "Checking Authentication State"](#5--login-page-stuck-on-checking-authentication-state)
6. [DashboardPage — "profile is not defined"](#6--dashboardpage--profile-is-not-defined)
7. [AuthContext Profile Fetch Returns 406](#7--authcontext-profile-fetch-returns-406)
8. [Supabase Auth Role is "authenticated" Not App Role](#8--supabase-auth-role-is-authenticated-not-app-role)
9. [Login Succeeds But App Never Loads](#9--login-succeeds-but-app-never-loads)
10. [Admin-Created Users Always Default to "employee"](#10--admin-created-users-always-default-to-employee)
11. [Profile Fetch Hangs Forever Due to RLS](#11--profile-fetch-hangs-forever-due-to-rls)
12. [React Hooks Error — "Rendered Fewer Hooks Than Expected"](#12--react-hooks-error--rendered-fewer-hooks-than-expected)
13. ["submitter is not defined" on Expense Submission](#13--submitter-is-not-defined-on-expense-submission)
14. [Supabase .catch() is Not a Function](#14--supabase-catch-is-not-a-function)
15. [Multi-Tenancy Data Leak Vulnerabilities](#15--multi-tenancy-data-leak-vulnerabilities)
16. [Frontend Page Crashes Due to Missing Imports](#16--frontend-page-crashes-due-to-missing-imports)
17. [ExpenseFormPage Crash: .toFixed() on Undefined](#17--expenseformpage-crash-tofixed-on-undefined)
18. [Approval Preview API 500 Error](#18--approval-preview-api-500-error)
19. [Role Degradation Bug: Admins/Managers Showing as Employees](#19--role-degradation-bug-adminsmanagers-showing-as-employees)
20. [App Stuck on "Checking Authentication State" (Infinite Loading)](#20--app-stuck-on-checking-authentication-state-infinite-loading)

---

## 1 — Approval Chain Never Built on Submission

**Symptom:**  
Employee submits an expense → expense saves to database → but `expenses.applied_rule_id` is `NULL` and `expense_approval_steps` table is empty. The expense is orphaned with no approval chain.

**Root Cause:**  
The `matchRule()` and `buildApprovalChain()` functions existed in `approvalEngine.js` but were either:
- Not being called at all inside the expense submission endpoint (`POST /api/expenses`), or
- Being called but throwing an error that was silently swallowed by a generic `try/catch`, which allowed the expense to save without a chain.

The submission endpoint was doing:
```js
try {
  // insert expense
  // matchRule()      ← these were throwing
  // buildApprovalChain()
} catch (err) {
  // error swallowed — expense already saved!
}
```

**Fix:**  
Wrapped the entire operation (expense insert + chain build) in a **single transaction**. If `matchRule` or `buildApprovalChain` throws for ANY reason, the expense insert is rolled back. Added explicit error logging at every step.

**Lesson:**  
Never silently catch errors when the operation has multiple dependent steps. Either use database transactions or check each step's result before proceeding. Always log the full error object, not just the message.

---

## 2 — Truncation Cascade Error in Database

**Symptom:**  
Running `TRUNCATE TABLE approval_logs` in Supabase SQL Editor fails with:
```
ERROR: 0A000: cannot truncate a table referenced in a foreign key constraint
DETAIL: Table "escalation_history" references "approval_logs"
```

**Root Cause:**  
PostgreSQL prevents truncating a table when another table has foreign key constraints referencing it. The `escalation_history` table had a FK pointing to `approval_logs`.

**Fix:**  
Use `TRUNCATE ... CASCADE` which truncates both the target table and any tables that reference it:
```sql
TRUNCATE TABLE approval_logs, escalation_history CASCADE;
```

**Lesson:**  
When resetting data in PostgreSQL, always check for FK constraints first. `CASCADE` propagates the truncation to dependent tables. Alternatively, truncate tables in reverse dependency order.

---

## 3 — "No Approvers Configured for This Rule"

**Symptom:**  
Expense submission fails with error: `"No approvers configured for this rule. Admin must add at least one approver."` even though the admin has saved a rule with approvers.

**Root Cause:**  
The `buildApprovalChain()` function fetches the rule with a nested select:
```js
const { data: rules } = await supabase
  .from("approval_rules")
  .select(`*, steps:approval_rule_steps(...)`)
```

Supabase's PostgREST nested selects can silently return `steps: null` (instead of an array) due to RLS policies or column name mismatches. The code then checked `rule.steps.length` which was `0` or threw on `null`.

**Fix:**  
Added a fallback query — if the nested select returns no steps, query `approval_rule_steps` directly:
```js
if (!rule.steps || rule.steps.length === 0) {
  const { data: directSteps } = await supabase
    .from("approval_rule_steps")
    .select("*")
    .eq("rule_id", rule.id)
    .order("step_order");
  rule.steps = directSteps || [];
}
```

**Lesson:**  
Never trust Supabase nested selects (PostgREST embedding) to always return data. RLS, column naming, and relationship configuration can all silently return `null`. Always have a fallback query for critical business logic.

---

## 4 — Manager Role Shows Employee UI

**Symptom:**  
A user confirmed as `manager` in the database sees:
- "Employee" label in the sidebar profile section
- Employee navigation items instead of manager nav
- Redirected to the employee dashboard instead of `/manager/queue`

**Root Cause (Multi-layered):**

1. **JWT payload**: Supabase Auth JWT contains `role: "authenticated"` — this is Supabase's internal system role, not the app role (admin/manager/employee).

2. **AuthContext**: Was reading role from `user.user_metadata.role`, which is only set at signup time. Admin-created users had `user_metadata.role = "employee"` regardless of their actual assigned role.

3. **Sidebar**: Was using the same flawed role source:
   ```js
   const role = user?.user_metadata?.role || "employee"; // always "employee"
   ```

**Fix (3 parts):**

1. **AuthContext** — Changed to fetch role from `profiles` table (single source of truth), not `user_metadata`:
   ```js
   const { data } = await supabase
     .from("profiles")
     .select("role, full_name, company_id, job_title")
     .eq("id", authUser.id)
     .maybeSingle();
   ```

2. **Sidebar** — Changed role derivation:
   ```js
   // Before (broken):
   const role = user?.user_metadata?.role || "employee";
   // After (correct):
   const role = user?.role || "employee";
   ```

3. **Backend** — When admin creates/updates a user, sync `user_metadata` so future logins are fast:
   ```js
   await supabase.auth.admin.updateUserById(userId, {
     user_metadata: { role, full_name, company_id }
   });
   ```

**Lesson:**  
In Supabase, `user.role` from the JWT is ALWAYS `"authenticated"` — it's a Supabase system field. Your app's role must be stored in a custom table and fetched explicitly. Never assume `user_metadata` is up-to-date for admin-managed users.

---

## 5 — Login Page Stuck on "Checking Authentication State"

**Symptom:**  
Navigating to `/login` shows a loading screen forever:
```
Preparing access
Loading authentication experience...
Getting your login and signup flow ready.
```

The login form never renders.

**Root Cause:**  
`AuthContext.jsx` had a state variable `isBootstrapping = true` that was meant to become `false` after checking if the user has an active session. The `loadSession()` function called `fetchProfile()` which queried the `profiles` table.

If that query threw (due to RLS blocking the anon key) or hung (no response), there was **no `try/catch`** around it, so `setIsBootstrapping(false)` on the next line never executed.

`PublicOnlyRoute` blocked rendering until `isBootstrapping === false`:
```jsx
if (isBootstrapping) {
  return <AuthStatusScreen ... />;  // ← stuck here forever
}
```

**Fix (2 parts):**

1. **AuthContext** — Wrapped `loadSession` in `try/catch/finally`:
   ```js
   async function loadSession() {
     try {
       const { data: { session } } = await supabase.auth.getSession();
       setSession(session);
       await resolveUser(session?.user ?? null);
     } catch (err) {
       setSession(null);
       setUser(null);
     } finally {
       setIsBootstrapping(false); // ALWAYS runs
     }
   }
   ```

2. **PublicOnlyRoute** — Removed the blocking `isBootstrapping` check entirely. Public routes render immediately:
   ```jsx
   // Only redirect away if CONFIRMED logged in
   if (!isBootstrapping && user) {
     return <Navigate to="/app" replace />;
   }
   return <Outlet />;  // render login immediately
   ```

**Lesson:**  
Any async initialization that gates UI rendering MUST have a guaranteed resolution path. Use `try/catch/finally` with the state setter in `finally`. Public pages should NEVER wait for auth state — render them immediately and only redirect if you positively confirm the user is logged in.

---

## 6 — DashboardPage — "profile is not defined"

**Symptom:**  
```
ReferenceError: profile is not defined (DashboardPage.jsx, line 80)
ReferenceError: setProfile is not defined (DashboardPage.jsx, line 36)
```

**Root Cause:**  
During refactoring, the local state variable was renamed from `profile`/`setProfile` to `userProfile`/`setUserProfile` (to avoid conflicts with the auth context's `profile`). But two references to the old names were missed:

```js
// Line 36: still using old name
setProfile(profileData?.employee);  // should be setUserProfile

// Line 80: still using old name
{profile?.company?.name && ...}     // should be userProfile
```

**Fix:**  
```js
setUserProfile(profileData?.employee);  // line 36
{userProfile?.company?.name && ...}     // line 80
```

**Lesson:**  
When renaming a variable, use your editor's "Rename Symbol" feature (F2) or search-and-replace the entire file. Never rename the declaration without checking all references. A quick `grep` for the old name catches these instantly.

---

## 7 — AuthContext Profile Fetch Returns 406

**Symptom:**  
Console shows:
```
[Auth] Profile fetch error: JSON object requested, multiple (or no) rows returned
```
HTTP 406 response from Supabase.

**Root Cause:**  
The profile fetch used `.single()`:
```js
const { data } = await supabase
  .from("profiles")
  .select("...")
  .eq("id", userId)
  .single();  // ← throws 406 if zero or multiple rows
```

`.single()` is strict — it requires EXACTLY one row. If the profile doesn't exist yet (new signup, DB trigger hasn't fired), it throws a 406 error instead of returning `null`.

**Fix:**  
Replace `.single()` with `.maybeSingle()`:
```js
.maybeSingle()  // returns { data: null } for 0 rows, no error
```

**Lesson:**  
Use `.single()` only when you are 100% certain exactly one row exists (e.g., fetching by primary key with a confirmed insert). For any query that might return 0 rows, use `.maybeSingle()`. This is a common Supabase pitfall.

---

## 8 — Supabase Auth Role is "authenticated" Not App Role

**Symptom:**  
`user.role` from Supabase Auth session is always `"authenticated"`. The sidebar defaults everyone to "employee" because:
```js
const role = user?.role || "employee";
// user.role = "authenticated" → not in the check → falls to "employee"
```

**Root Cause:**  
Supabase JWT has two "role" concepts:
- `user.role` = **Supabase system role** = always `"authenticated"` for logged-in users
- `user.user_metadata.role` = **custom metadata** set at signup time

The app was reading `user.role` expecting it to be "admin"/"manager"/"employee", but that field is owned by Supabase, not the app.

**Fix:**  
The app role is stored in the `profiles` table. After login:
```js
const { data } = await supabase
  .from("profiles")
  .select("role, full_name, company_id, job_title")
  .eq("id", authUser.id)
  .maybeSingle();

setUser({
  id: authUser.id,
  email: authUser.email,
  role: data?.role ?? "employee",  // ← app role from DB
  ...
});
```

Now `user.role` throughout the app is the correct app role.

**Lesson:**  
In Supabase:
| Field | Source | Value |
|-------|--------|-------|
| `user.role` | JWT claim | Always `"authenticated"` |
| `user.user_metadata.role` | Set at signup | Only reliable for self-registered users |
| `profiles.role` | Database | **Single source of truth** |

Always fetch app roles from your own table, not from the auth token.

---

## 9 — Login Succeeds But App Never Loads

**Symptom:**  
User enters credentials → loading spinner appears → spinner never stops → user never reaches the dashboard.

**Root Cause:**  
In `AuthContext`, the `onAuthStateChange` callback called `handleAuthUser()` which did:
```js
async function handleAuthUser(authUser) {
  const profileData = await fetchProfile(authUser.id);  // ← hangs
  const merged = mergeUserWithProfile(authUser, profileData);
  setUser(merged);  // ← never reached
}
```

If `fetchProfile` hung (RLS blocking the query — no error, no response), then `setUser(merged)` was never called. The `ProtectedRoute` saw `user = null` and redirected back to login, creating an infinite loop.

**Fix:**  
Set user IMMEDIATELY from the session (with fallback role), then enhance asynchronously:
```js
async function handleAuthUser(authUser) {
  // Step 1: Set user IMMEDIATELY
  setUser({ ...authUser, role: authUser.user_metadata?.role || "employee" });

  // Step 2: Enhance with real profile (non-blocking)
  try {
    const profileData = await fetchProfile(authUser.id);
    if (profileData) {
      setUser({ ...authUser, ...profileData });
    }
  } catch (err) {
    // keep the fallback
  }
}
```

**Lesson:**  
When auth state guards UI rendering, always set the user state FIRST with whatever data you have, then enhance it. Never block the UI on a secondary data fetch that might fail.

---

## 10 — Admin-Created Users Always Default to "employee"

**Symptom:**  
Users created by the admin through the Employee Management page always appear as "employee" in the app, even when created as "manager" or "admin".

**Root Cause:**  
When admin creates a user via the backend:
```js
await supabase.auth.admin.createUser({
  email,
  password,
  user_metadata: {
    role: role || "employee",  // ← correctly set for NEW users
    full_name, job_title
  }
});
```

This works for brand new users. But when an **existing auth user** gets a profile created (the `if (existingUser)` branch), `user_metadata` was NEVER updated:
```js
if (existingUser) {
  userId = existingUser.id;
  // ← user_metadata.role stays whatever it was at signup!
}
```

Similarly, when admin **changes** a user's role via `updateEmployee`, only the `profiles` table was updated — `user_metadata` was not synced.

**Fix:**  
Sync `user_metadata` in both paths:

```js
// In createEmployee — existing user branch:
await supabase.auth.admin.updateUserById(userId, {
  user_metadata: { role, full_name, company_id }
});

// In updateEmployee — when role changes:
if (role !== undefined) {
  await supabase.auth.admin.updateUserById(id, {
    user_metadata: { role, full_name: employee.full_name, company_id: employee.company_id }
  });
}
```

Also created a one-time migration script (`backend/scripts/sync-user-metadata.js`) to backfill all existing users.

**Lesson:**  
When your app uses both a custom `profiles` table and Supabase `user_metadata`, you must keep them in sync at every write point — create, update, and role change. Otherwise they drift and the frontend reads stale data.

---

## 11 — Profile Fetch Hangs Forever Due to RLS

**Symptom:**  
After login, the app is stuck on the "Securing session" loading screen. Console shows `[Auth] No valid role in user_metadata, fetching from profiles...` but no follow-up log. The fetch never completes.

**Root Cause:**  
The `profiles` table has **Row Level Security (RLS)** enabled in Supabase, but no policy was defined allowing authenticated users to read their own row. 

When the frontend Supabase client (using the anon key) queries `profiles`, RLS evaluates the request against existing policies. With no matching policy, the query silently returns **zero results** but the query itself doesn't error. However, in some configurations, it can also hang indefinitely — especially with `.single()` expecting exactly one row.

The `await` in AuthContext waited forever:
```js
const { data } = await supabase
  .from("profiles")
  .select("role, full_name, company_id")
  .eq("id", authUser.id)
  .maybeSingle();  // ← never resolved due to RLS
```

**Fix (2 parts):**

1. **Timeout guard** — Wrapped the fetch in `Promise.race`:
   ```js
   const fetchProfile = supabase.from("profiles").select("...").eq("id", authUser.id).maybeSingle();
   const timeout = new Promise((_, reject) =>
     setTimeout(() => reject(new Error("Profile fetch timed out")), 5000)
   );
   const { data, error } = await Promise.race([fetchProfile, timeout]);
   ```

2. **RLS policy** — Created `database_migration_v4.sql`:
   ```sql
   CREATE POLICY "Users can read own profile"
   ON profiles FOR SELECT
   TO authenticated
   USING (auth.uid() = id);
   ```

**Lesson:**  
Supabase RLS is enabled by default on new tables. If you forget to add policies, queries silently return empty/hang — they don't throw 403 errors. Always add RLS policies for every table the frontend queries directly. And always add a timeout when fetching data that gates UI rendering.

---

## 12 — React Hooks Error — "Rendered Fewer Hooks Than Expected"

**Symptom:**  
```
Error: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
```
Crash on `DashboardPage.jsx`.

**Root Cause:**  
An early return statement appeared BEFORE a `useEffect` hook:

```jsx
export function DashboardPage() {
  const { user } = useAuth();            // hook 1
  const [stats, setStats] = useState();   // hook 2-5
  
  if (role === 'manager') {
    return <Navigate to="/manager/queue" />;  // ← EARLY RETURN
  }

  useEffect(() => { ... }, []);  // ← hook 6: NOT REACHED for managers!
```

React requires that every render calls the same hooks in the same order. When `role === 'manager'`, the function returned before `useEffect` was called, making the hook count differ between renders.

**Fix:**  
Move ALL hooks above any conditional returns:
```jsx
export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState();

  useEffect(() => { ... }, []);  // ← moved ABOVE early return

  if (role === 'manager') {
    return <Navigate to="/manager/queue" />;  // ← now safe
  }
```

**Lesson:**  
This is React's **Rules of Hooks**: hooks must be called unconditionally and in the same order every render. Never put a `return` statement between hooks. The pattern is always: all hooks first → then conditionals and returns.

---

## 13 — "submitter is not defined" on Expense Submission

**Symptom:**  
```
ReferenceError: submitter is not defined
```
Thrown at `approvalEngine.js` line 180 during expense submission.

**Root Cause:**  
During the manager logic removal refactor, the code that fetched the submitter's profile was removed:
```js
// This was deleted during refactor:
const { data: submitter } = await supabase
  .from("profiles")
  .select("full_name, email")
  .eq("id", submittedByUserId)
  .single();
```

But the notification code still referenced the deleted variable:
```js
const submitterName = submitter.full_name || submitter.email?.split("@")[0] || "An employee";
//                    ^^^^^^^^^ — no longer exists!
```

**Fix:**  
Added a focused fetch right before the notification, inside a `try/catch` so it never blocks the chain:
```js
let submitterName = "An employee";
try {
  const { data: submitterProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", submittedByUserId)
    .maybeSingle();
  submitterName = submitterProfile?.full_name || submitterProfile?.email?.split("@")[0] || "An employee";
} catch (_) {}
```

**Lesson:**  
When refactoring (especially deleting code), search the entire file for references to any variables defined in the deleted block. Use `grep` or `Ctrl+Shift+F` for the variable name. A single missed reference breaks the runtime even if the file has no syntax errors.

---

## 14 — Supabase .catch() is Not a Function

**Symptom:**  
```
TypeError: supabase.from(...).select(...).eq(...).maybeSingle(...).catch is not a function
```

**Root Cause:**  
Supabase's query builder returns a **custom thenable object**, not a native JavaScript `Promise`. It implements `.then()` (so `await` works) but does NOT implement `.catch()` as a method on the builder.

This fails:
```js
const { data } = await supabase
  .from("profiles")
  .select("full_name, email")
  .eq("id", userId)
  .maybeSingle()
  .catch(() => ({ data: null }));  // ← TypeError!
```

**Fix:**  
Use a standard `try/catch` block instead of chaining `.catch()`:
```js
let submitterName = "An employee";
try {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  submitterName = data?.full_name || data?.email?.split("@")[0] || "An employee";
} catch (_) {}
```

**Lesson:**  
Supabase's query builder (`supabase.from().select().eq()...`) is NOT a real Promise — it's a thenable. You can `await` it (which uses `.then()` internally) but you cannot chain `.catch()` on it. Always use `try/catch` with `await` for error handling with Supabase queries.

---

## 15 — Multi-Tenancy Data Leak Vulnerabilities

**Symptom:**  
Users from Company A could potentially see data from Company B. Several API endpoints were not filtering by `company_id`.

**Root Cause:**  
Six endpoints/functions lacked proper `company_id` filtering:

1. `expenseController.js` → `deleteExpense`: No check if expense belongs to user's company
2. `expenseController.js` → `getExpenseStats`: Stats aggregated across ALL companies
3. `analyticsController.js` → `getBottleneckReport`: Report included all companies' data
4. `analyticsController.js` → `getApprovalMetrics`: Metrics not scoped to company
5. `escalationRoutes.js` → `/stats`: Escalation stats from all companies
6. `escalationRoutes.js` → `/managers-on-leave`: Listed managers from all companies

**Fix:**  
Added `company_id` filter from `req.user.profile.company_id` to all 6 locations:

```js
// Example fix in deleteExpense:
const { data: expense } = await supabase
  .from("expenses")
  .select("*, submitter:profiles!submitted_by(company_id)")
  .eq("id", expenseId)
  .single();

if (expense?.submitter?.company_id !== req.user.profile.company_id) {
  return res.status(403).json({ error: "Not authorized" });
}

// Example fix in getExpenseStats:
.eq("profiles.company_id", req.user.profile.company_id)
```

**Lesson:**  
In multi-tenant systems, EVERY query that returns company-scoped data must include a `company_id` filter. The `company_id` should ALWAYS come from the authenticated user's profile, never from request parameters (which can be spoofed). Audit all endpoints during security reviews.

---

## 16 — Frontend Page Crashes Due to Missing Imports

**Symptom:**  
Two pages crashed with errors:
- `ApprovalsPage.jsx`: "Calendar is not defined"
- `RuleBuilderPage.jsx`: "Star is not defined"

**Root Cause:**  
Lucide React icons (`Calendar`, `Star`) were used in JSX but never imported at the top of the file.

**Fix:**  
Added missing imports:

```js
// ApprovalsPage.jsx
import { Calendar, ... } from "lucide-react";

// RuleBuilderPage.jsx  
import { Star, ... } from "lucide-react";
```

**Lesson:**  
When adding new icons/components to JSX, always add the import immediately. IDEs with auto-import help, but if you're editing code without IDE support, manually check imports before committing. A simple `grep` for component names in the import section catches these.

---

## 17 — ExpenseFormPage Crash: `.toFixed()` on Undefined

**Symptom:**  
```
TypeError: Cannot read properties of undefined (reading 'toFixed')
```
Crash when OCR scans a receipt or when viewing conversion preview.

**Root Cause:**  
The code assumed `conversionPreview.originalAmount` and `conversionPreview.convertedAmount` were always numbers:

```jsx
<span>{conversionPreview.originalAmount.toFixed(2)}</span>
<span>{conversionPreview.convertedAmount.toFixed(2)}</span>
```

But the API response used different field names (`original_amount`/`converted_amount`) and sometimes returned `null` or `undefined`.

**Fix (3 parts):**

1. **Normalize API response fields:**
   ```js
   const safeOriginal = parseFloat(res.original_amount ?? res.originalAmount ?? amount);
   const safeConverted = parseFloat(res.converted_amount ?? res.convertedAmount);
   ```

2. **Validate before setting state:**
   ```js
   if (isNaN(safeOriginal) || isNaN(safeConverted)) {
     setConversionError("Invalid conversion data received.");
     return;
   }
   ```

3. **Guard in JSX render:**
   ```jsx
   {conversionPreview && conversionPreview.originalAmount != null && (
     <span>{Number(conversionPreview.originalAmount).toFixed(2)}</span>
   )}
   ```

Also added `safeAmount()` helper for OCR results:
```js
const safeAmount = (val) => {
  if (val == null) return '';
  const n = parseFloat(val);
  return isNaN(n) || !isFinite(n) ? '' : n.toString();
};
```

**Lesson:**  
Never call `.toFixed()` on a value without first confirming it's a valid number. API responses can have inconsistent field names (camelCase vs snake_case), `null`, or missing fields. Always normalize and validate numeric data before using it in calculations or rendering.

---

## 18 — Approval Preview API 500 Error

**Symptom:**  
`GET /api/expenses/approval-preview?amount=500&category=Travel` returns HTTP 500 with stack trace.

**Root Cause (Multiple issues):**

1. **No defensive check for `req.user`:** If auth middleware failed silently, `req.user.id` threw
2. **Missing `company_id` check:** Profile query didn't verify user had a company
3. **Category case mismatch:** Rules stored as "travel" but query sent "Travel"
4. **No error handling for `getApplicableRule()`:** If it threw, entire endpoint crashed

**Fix:**

```js
// 1. Check req.user exists
if (!req.user?.id) {
  return res.status(401).json({ error: "Authentication required" });
}

// 2. Verify company_id
if (!profile.company_id) {
  return res.status(400).json({ error: "User has no company assigned" });
}

// 3. Normalize category
const normalizedCategory = category.toLowerCase();

// 4. Wrap rule lookup in try-catch with graceful fallback
let rule;
try {
  rule = await getApplicableRule(userId, parsedAmount, normalizedCategory);
} catch (ruleError) {
  return res.json({
    can_submit: true,
    rule: null,
    message: "No approval rule configured",
    approval_steps: []
  });
}
```

Also fixed `approvalWorkflowEngine.js` to use case-insensitive category matching:
```js
r.category?.toLowerCase() === normalizedCategory
```

**Lesson:**  
API endpoints should be defensive at every layer: validate auth exists, validate required fields, normalize input data, and wrap external service calls in try-catch with graceful fallbacks. A 500 error should be rare — most errors should return meaningful 4xx responses.

---

## 19 — Role Degradation Bug: Admins/Managers Showing as Employees

**Symptom:**  
New admin signup or existing admin/manager shows `role: "employee"` in the UI. After page refresh, the correct role appears briefly then reverts to employee.

**Root Cause (Complex flow issue):**

1. **No database trigger:** Supabase doesn't auto-create profiles when users sign up
2. **Signup flow gap:** `signUp()` stored `role: "admin"` in `user_metadata`, but never called `/api/companies/setup` to create the profile
3. **Profile fetch fallback:** `AuthContext.resolveUser()` queried profiles table → got `null` → defaulted to `"employee"`

The flow was:
```
signUp() → user_metadata.role = "admin"
         → profiles table: NO ROW EXISTS
         → resolveUser() fetches profile → null
         → role = profile?.role ?? "employee" → "employee"
```

**Intended Fix:**
Added `setupCompanyForNewUser()` to `AuthContext.jsx` that calls `/api/companies/setup` endpoint when:
- Profile doesn't exist
- User has `organization_name` in metadata (indicating new admin signup)

```js
if (!profile && authUser.user_metadata?.organization_name) {
  await setupCompanyForNewUser(authUser); // Creates company + profile with admin role
  profile = await fetchProfile(authUser); // Re-fetch now that profile exists
}
```

**Actual Production Fix:**
The setup endpoint was causing hangs (see Bug #20), so the fix was simplified to:
- Trust `user_metadata.role` as fallback when profile doesn't exist
- Company/profile creation handled separately (manual or on next login)

**Lesson:**  
When using Supabase Auth + custom profiles table, ensure there's a reliable mechanism to create profiles for new users. Options:
1. Database trigger on `auth.users` insert
2. Backend endpoint called after signup
3. Fallback to `user_metadata` when profile missing

The fallback chain should be: `profile.role` → `user_metadata.role` → `"employee"`.

---

## 20 — App Stuck on "Checking Authentication State" (Infinite Loading)

**Symptom:**  
After previous fixes, app shows "Checking your authentication state..." forever. Browser console shows:
```
[Auth] loadSession starting...
[Auth] Calling supabase.auth.getSession()...
[Auth] Auth state changed: SIGNED_IN
[Auth] Resolving user: user@example.com
```
Then nothing — app never loads.

**Root Cause (Multiple layers):**

1. **Profile fetch hanging:** Supabase query to `profiles` table never resolved (RLS or network issue)
2. **No timeout:** `fetchProfile()` awaited forever with no timeout
3. **Company setup also hanging:** After profile timeout, `setupCompanyForNewUser()` tried to call backend which also hung
4. **Cascading delays:** Profile timeout (5s) + setup timeout (5s) + retry profile (5s) = 15+ seconds before any fallback
5. **Concurrent resolves:** Both `loadSession()` and `onAuthStateChange` callback called `resolveUser()` simultaneously, causing race conditions

**Fix (Progressive, multiple iterations):**

**Iteration 1 — Add timeout to fetchProfile:**
```js
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error("Profile fetch timeout")), 3000)
);
const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
```

**Iteration 2 — Add timeout to setupCompanyForNewUser:**
```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 3000);
const response = await fetch(url, { signal: controller.signal });
```

**Iteration 3 — Wrap resolveUser in comprehensive try-catch:**
```js
async function resolveUser(authUser) {
  let profile = null;
  try {
    profile = await fetchProfile(authUser);
    // ... setup logic
  } catch (err) {
    console.error("[Auth] resolveUser error (non-fatal):", err.message);
  }
  // ALWAYS set user, even with null profile
  setUser({ ...authUser, role: profile?.role ?? user_metadata?.role ?? "employee" });
}
```

**Iteration 4 — Skip problematic company setup entirely:**
```js
if (!profile && authUser.user_metadata?.organization_name) {
  console.log("[Auth] No profile found, using metadata role");
  // Don't call setupCompanyForNewUser - it causes hangs
  // User will use fallback role from user_metadata
}
```

**Iteration 5 — Prevent concurrent resolves:**
```js
const [isResolving, setIsResolving] = useState(false);

async function resolveUser(authUser) {
  if (isResolving) {
    console.log("[Auth] Already resolving, skipping");
    return;
  }
  setIsResolving(true);
  try {
    // ... resolve logic
  } finally {
    setIsResolving(false);
  }
}
```

**Final Working State:**
- Profile fetch has 3-second timeout
- If timeout, falls back to `user_metadata.role`
- Company setup skipped entirely (too risky)
- `setIsBootstrapping(false)` guaranteed in `finally` block
- App loads within 3-4 seconds even with timeouts

**Lesson:**  
Any async operation that gates UI rendering MUST:
1. Have a timeout (3-5 seconds max)
2. Have error handling that doesn't block
3. Have a fallback that allows the UI to render
4. Be wrapped in `try/finally` with state cleanup in `finally`

Never let a secondary data fetch (like profile enhancement) block the primary user experience (login). Load fast with fallback data, enhance later.

---

## Summary of Patterns

### Top Recurring Root Causes
| Root Cause | Bugs |
|------------|------|
| **Silent failure / swallowed errors** | #1, #5, #11, #18, #20 |
| **Supabase RLS blocking queries** | #3, #5, #11, #20 |
| **Stale/wrong data source for role** | #4, #8, #10, #19 |
| **Missing variable references after refactor** | #6, #13 |
| **Supabase API quirks** | #7, #14 |
| **Missing input validation / null guards** | #17, #18 |
| **Multi-tenancy security gaps** | #15 |
| **Missing imports** | #16 |
| **Async operations blocking UI** | #5, #9, #11, #20 |

### Defensive Coding Rules Learned

1. **Always use `try/catch/finally`** when async operations gate UI rendering
2. **Never trust `user_metadata`** for admin-managed fields — fetch from DB
3. **Always add RLS policies** for every table the frontend queries
4. **Use `.maybeSingle()` not `.single()`** unless you're 100% certain one row exists
5. **Add timeouts (3-5s max)** to any fetch that blocks the UI
6. **Set user state immediately**, enhance later — never block on secondary fetches
7. **Move all React hooks above early returns** — hooks must be unconditional
8. **After deleting code, grep for all references** to deleted variables
9. **Use `try/catch` not `.catch()`** with Supabase queries
10. **Log at every step** during development — silent failures are the hardest bugs
11. **Always filter by `company_id`** in multi-tenant systems — never trust request params
12. **Validate and normalize numeric data** before calling `.toFixed()` or arithmetic
13. **Normalize string comparisons** (e.g., `.toLowerCase()`) for case-insensitive matching
14. **Add defensive null checks** for `req.user`, `req.user.profile`, etc. in every endpoint
15. **Prevent concurrent async operations** that modify the same state

---

*Last updated: March 31, 2026*
