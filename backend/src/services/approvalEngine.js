import { supabase } from "../config/supabaseClient.js";
import { createNotification } from "../controllers/notificationController.js";

/**
 * ═══════════════════════════════════════════════════════════════
 * APPROVAL ENGINE — Single source of truth for all approval logic
 * ═══════════════════════════════════════════════════════════════
 *
 * Functions:
 *   1. matchRule        — Find the applicable rule for an expense
 *   2. buildApprovalChain — Create expense_approval_steps rows
 *   3. processApproval  — Handle approve/reject from sequential approver
 *   4. evaluateResolution — Check if expense is fully resolved
 *   5. processSpecialApproverAction — Special approver override
 */

// ─────────────────────────────────────────────────────────────
// Function 1 — matchRule
// ─────────────────────────────────────────────────────────────

export async function matchRule(expense, companyId) {
  console.log(`[matchRule] START — companyId=${companyId}, expense.category="${expense.category}", expense.id=${expense.id}`);

  // Fetch all rules for the company with their steps
  const { data: rules, error } = await supabase
    .from("approval_rules")
    .select(`
      *,
      steps:approval_rule_steps(
        id, approver_id, step_order,
        approver:approver_id(id, email, full_name, job_title, role)
      )
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[matchRule] DB ERROR fetching rules:`, error);
    throw new Error(`Failed to fetch rules: ${error.message}`);
  }

  console.log(`[matchRule] Found ${rules?.length || 0} rules for company ${companyId}`);
  if (rules) {
    rules.forEach((r, i) => {
      console.log(`[matchRule]   Rule[${i}]: name="${r.name}", category="${r.category}", is_default=${r.is_default}, threshold=${r.threshold_amount}, steps=${r.steps?.length || 0}`);
    });
  }

  if (!rules || rules.length === 0) {
    throw new Error("No approval rules configured. Admin must create at least one rule.");
  }

  // Sort steps by step_order within each rule
  rules.forEach(rule => {
    if (rule.steps) {
      rule.steps.sort((a, b) => a.step_order - b.step_order);
    }
  });

  let matchedRule = null;
  const expenseCategory = (expense.category || "").toLowerCase().trim();

  // Priority 1: Specific category match (non-default rules first)
  matchedRule = rules.find(
    r => !r.is_default && r.category && (r.category.toLowerCase().trim() === expenseCategory)
  );
  console.log(`[matchRule] Priority 1 (exact category match): ${matchedRule ? `MATCHED "${matchedRule.name}"` : "no match"}`);

  // Priority 2: Default rule (fallback)
  if (!matchedRule) {
    matchedRule = rules.find(r => r.is_default === true);
    console.log(`[matchRule] Priority 2 (default rule): ${matchedRule ? `MATCHED "${matchedRule.name}"` : "no match"}`);
  }

  // Priority 3: Any rule with null category (applies to all)
  if (!matchedRule) {
    matchedRule = rules.find(r => !r.category);
    console.log(`[matchRule] Priority 3 (null category): ${matchedRule ? `MATCHED "${matchedRule.name}"` : "no match"}`);
  }

  if (!matchedRule) {
    console.error(`[matchRule] NO RULE FOUND for category "${expense.category}" in company ${companyId}`);
    throw new Error(`No approval rule configured for category "${expense.category}". Admin must create a rule or set a default.`);
  }

  console.log(`[matchRule] RESULT: Using rule "${matchedRule.name}" (id=${matchedRule.id}), ${matchedRule.steps?.length || 0} steps`);
  return matchedRule;
}

// ─────────────────────────────────────────────────────────────
// Function 2 — buildApprovalChain
// ─────────────────────────────────────────────────────────────

export async function buildApprovalChain(expense, rule, submittedByUserId) {
  console.log(`[buildChain] START — expense.id=${expense.id}, rule.name="${rule.name}", rule.id=${rule.id}, submitter=${submittedByUserId}`);
  console.log(`[buildChain] Rule config: threshold=${rule.threshold_amount}, steps from nested select=${rule.steps?.length || 0}`);

  // ═══════════════════════════════════════════════════════════
  // FALLBACK: If nested select didn't return steps (RLS or
  // PostgREST embedding issue), query them directly
  // ═══════════════════════════════════════════════════════════
  if (!rule.steps || rule.steps.length === 0) {
    console.log(`[buildChain] ⚠️ rule.steps is empty — fetching directly from approval_rule_steps`);
    const { data: directSteps, error: directError } = await supabase
      .from("approval_rule_steps")
      .select("id, approver_id, step_order")
      .eq("rule_id", rule.id)
      .order("step_order", { ascending: true });

    if (directError) {
      console.error(`[buildChain] Direct steps query failed:`, directError);
    } else {
      console.log(`[buildChain] Direct query found ${directSteps?.length || 0} steps`);
      rule.steps = directSteps || [];
    }
  }

  const stepsToInsert = [];

  // ═══════════════════════════════════════════════════════════
  // Build chain purely from approval_rule_steps, in order
  // ═══════════════════════════════════════════════════════════
  const ruleSteps = rule.steps || [];
  console.log(`[buildChain] Building chain from ${ruleSteps.length} configured rule steps`);

  let currentOrder = 1;
  for (const step of ruleSteps) {
    console.log(`[buildChain] Adding step ${currentOrder}: approver=${step.approver_id}`);
    stepsToInsert.push({
      expense_id: expense.id,
      approver_id: step.approver_id,
      step_order: currentOrder,
      status: currentOrder === 1 ? "PENDING" : "WAITING",
    });
    currentOrder++;
  }

  // If no steps were configured in the rule
  if (stepsToInsert.length === 0) {
    throw new Error(
      "No approvers configured for this rule. Admin must add at least one approver."
    );
  }

  console.log(`[buildChain] Steps to insert (${stepsToInsert.length}):`, JSON.stringify(stepsToInsert, null, 2));

  // Insert all steps
  const { data: insertedSteps, error: insertError } = await supabase
    .from("expense_approval_steps")
    .insert(stepsToInsert)
    .select();

  if (insertError) {
    console.error(`[buildChain] FAILED to insert steps:`, insertError);
    throw new Error(`Failed to create approval chain: ${insertError.message}`);
  }

  console.log(`[buildChain] ✅ Inserted ${insertedSteps?.length || 0} steps into expense_approval_steps`);

  // Update expense with applied rule
  const { data: updatedExpense, error: updateError } = await supabase
    .from("expenses")
    .update({
      applied_rule_id: rule.id,
      status: "pending",
    })
    .eq("id", expense.id)
    .select("id, applied_rule_id, status")
    .single();

  if (updateError) {
    console.error(`[buildChain] FAILED to update expense with applied_rule_id:`, updateError);
    throw new Error(`Failed to update expense: ${updateError.message}`);
  }

  console.log(`[buildChain] ✅ Updated expense: applied_rule_id=${updatedExpense?.applied_rule_id}, status=${updatedExpense?.status}`);

  // Notify the first approver
  const firstStep = stepsToInsert[0];

  // Fetch submitter name for notification message
  let submitterName = "An employee";
  try {
    const { data: submitterProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", submittedByUserId)
      .maybeSingle();
    submitterName = submitterProfile?.full_name || submitterProfile?.email?.split("@")[0] || "An employee";
  } catch (_) {}

  const amount = expense.converted_amount || expense.amount;
  const currency = expense.company_currency || expense.currency || "INR";

  await createNotification(
    firstStep.approver_id,
    `New expense from ${submitterName}: ${expense.category} — ${currency} ${amount}. Waiting for your approval.`,
    expense.id,
    "approval_needed"
  );

  // If rule has a special approver, notify them too
  if (rule.specific_approver_id) {
    await createNotification(
      rule.specific_approver_id,
      `New ${expense.category} expense from ${submitterName}: ${currency} ${amount}. As a special approver, you can approve/reject this at any time.`,
      expense.id,
      "special_approval"
    );
  }

  console.log(
    `[buildChain] ✅ COMPLETE — Built approval chain for expense ${expense.id}: ${stepsToInsert.length} steps, rule="${rule.name}"`
  );

  return {
    steps: stepsToInsert,
    ruleApplied: rule.name,
    belowThreshold:
      rule.threshold_amount !== null &&
      rule.threshold_amount !== undefined &&
      parseFloat(expense.converted_amount || expense.amount) < parseFloat(rule.threshold_amount),
  };
}

// ─────────────────────────────────────────────────────────────
// Function 3 — processApproval
// ─────────────────────────────────────────────────────────────

export async function processApproval(expenseId, approverId, action, comment) {
  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new Error('Action must be "APPROVE" or "REJECT"');
  }

  // Fetch expense
  const { data: expense, error: expError } = await supabase
    .from("expenses")
    .select("*, employee:employee_id(id, email, full_name)")
    .eq("id", expenseId)
    .single();

  if (expError || !expense) throw new Error("Expense not found");

  if (expense.status !== "pending") {
    throw new Error(`Expense is already ${expense.status}`);
  }

  // Fetch ALL steps for this expense
  const { data: allSteps, error: stepsError } = await supabase
    .from("expense_approval_steps")
    .select("*")
    .eq("expense_id", expenseId)
    .order("step_order", { ascending: true });

  if (stepsError) throw new Error(`Failed to fetch steps: ${stepsError.message}`);

  // Find the step for this approver that is PENDING
  const myStep = allSteps.find(
    (s) => s.approver_id === approverId && s.status === "PENDING"
  );

  if (!myStep) {
    // Check if they have a WAITING step (not their turn)
    const waitingStep = allSteps.find(
      (s) => s.approver_id === approverId && s.status === "WAITING"
    );
    if (waitingStep) {
      throw new Error("Not your turn yet — waiting for previous approver");
    }
    throw new Error("No pending approval step found for this approver");
  }

  // Get approver info for notifications
  const { data: approver } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", approverId)
    .single();

  const approverName = approver?.full_name || approver?.email?.split("@")[0] || "Approver";

  // ═══════════════════════════════════════════════════════════
  // REJECT — kills the entire chain immediately
  // ═══════════════════════════════════════════════════════════
  if (action === "REJECT") {
    // Update this step
    await supabase
      .from("expense_approval_steps")
      .update({
        status: "REJECTED",
        comment: comment || null,
        actioned_at: new Date().toISOString(),
      })
      .eq("id", myStep.id);

    // Skip all remaining WAITING/PENDING steps
    await supabase
      .from("expense_approval_steps")
      .update({
        status: "SKIPPED",
        comment: "Skipped — expense rejected by earlier approver",
        actioned_at: new Date().toISOString(),
      })
      .eq("expense_id", expenseId)
      .in("status", ["WAITING", "PENDING"])
      .neq("id", myStep.id);

    // Update expense status
    await supabase
      .from("expenses")
      .update({ status: "rejected" })
      .eq("id", expenseId);

    // Notify employee
    const employeeId = expense.employee_id || expense.user_id;
    if (employeeId) {
      await createNotification(
        employeeId,
        `Your expense "${expense.description}" was rejected by ${approverName}.${comment ? ` Reason: ${comment}` : ""}`,
        expenseId,
        "expense_rejected"
      );
    }

    return { status: "REJECTED", reason: `Rejected by ${approverName}` };
  }

  // ═══════════════════════════════════════════════════════════
  // APPROVE — update step, then evaluate resolution
  // ═══════════════════════════════════════════════════════════
  await supabase
    .from("expense_approval_steps")
    .update({
      status: "APPROVED",
      comment: comment || null,
      actioned_at: new Date().toISOString(),
    })
    .eq("id", myStep.id);

  // Refresh steps after update
  const { data: updatedSteps } = await supabase
    .from("expense_approval_steps")
    .select("*")
    .eq("expense_id", expenseId)
    .order("step_order", { ascending: true });

  // Get the rule for resolution evaluation
  let rule = null;
  if (expense.applied_rule_id) {
    const { data: ruleData } = await supabase
      .from("approval_rules")
      .select("*")
      .eq("id", expense.applied_rule_id)
      .single();
    rule = ruleData;
  }

  // Evaluate resolution
  return await evaluateResolution(expense, rule, updatedSteps, approverId);
}

// ─────────────────────────────────────────────────────────────
// Function 4 — evaluateResolution
// ─────────────────────────────────────────────────────────────

export async function evaluateResolution(expense, rule, allSteps, lastApproverId) {
  const totalSteps = allSteps.length;
  const approvedSteps = allSteps.filter((s) => s.status === "APPROVED");
  const approvedCount = approvedSteps.length;
  const employeeId = expense.employee_id || expense.user_id;

  // Get approver name for notifications
  const { data: approver } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", lastApproverId)
    .single();
  const approverName = approver?.full_name || approver?.email?.split("@")[0] || "Approver";

  // ─────────────────────────────────────────────────────────
  // CHECK 1: Special approver condition
  // ─────────────────────────────────────────────────────────
  if (
    rule?.specific_approver_id &&
    lastApproverId === rule.specific_approver_id
  ) {
    // Special approver approved → expense is APPROVED
    await finalizeApproval(expense, allSteps, employeeId, "Special approver approved");
    return { status: "APPROVED", reason: "Approved by special approver" };
  }

  // ─────────────────────────────────────────────────────────
  // CHECK 2: Percentage threshold condition
  // ─────────────────────────────────────────────────────────
  if (rule?.min_approval_percentage) {
    const percentageApproved = (approvedCount / totalSteps) * 100;
    if (percentageApproved >= rule.min_approval_percentage) {
      await finalizeApproval(
        expense,
        allSteps,
        employeeId,
        `${Math.round(percentageApproved)}% approved (threshold: ${rule.min_approval_percentage}%)`
      );
      return {
        status: "APPROVED",
        reason: `Percentage threshold met: ${Math.round(percentageApproved)}% >= ${rule.min_approval_percentage}%`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // CHECK 3: Are there more WAITING steps?
  // ─────────────────────────────────────────────────────────
  const waitingSteps = allSteps.filter((s) => s.status === "WAITING");

  if (waitingSteps.length > 0) {
    // Advance to next step
    const nextStep = waitingSteps[0];
    await supabase
      .from("expense_approval_steps")
      .update({ status: "PENDING" })
      .eq("id", nextStep.id);

    // Notify next approver
    const amount = expense.converted_amount || expense.amount;
    const currency = expense.company_currency || expense.currency || "INR";
    await createNotification(
      nextStep.approver_id,
      `Expense "${expense.description}" (${currency} ${amount}) needs your approval. Previous step approved by ${approverName}.`,
      expense.id,
      "approval_needed"
    );

    // Notify employee of step progress
    if (employeeId) {
      await createNotification(
        employeeId,
        `Your expense "${expense.description}" was approved by ${approverName}. Waiting for next approver.`,
        expense.id,
        "step_approved"
      );
    }

    return { status: "PENDING", reason: `Approved by ${approverName}, waiting for next approver` };
  }

  // ─────────────────────────────────────────────────────────
  // CHECK 4: No more WAITING steps — all done
  // ─────────────────────────────────────────────────────────
  if (approvedCount === totalSteps) {
    await finalizeApproval(expense, allSteps, employeeId, "All approvers approved");
    return { status: "APPROVED", reason: "All approvers approved" };
  }

  // Shouldn't reach here, but just in case
  return { status: "PENDING", reason: "Awaiting more approvals" };
}

// Helper: finalize an expense as APPROVED
async function finalizeApproval(expense, allSteps, employeeId, reason) {
  // Skip remaining WAITING steps
  const waitingSteps = allSteps.filter((s) => s.status === "WAITING");
  if (waitingSteps.length > 0) {
    const waitingIds = waitingSteps.map((s) => s.id);
    await supabase
      .from("expense_approval_steps")
      .update({
        status: "SKIPPED",
        comment: `Skipped — ${reason}`,
        actioned_at: new Date().toISOString(),
      })
      .in("id", waitingIds);
  }

  // Update expense status
  await supabase
    .from("expenses")
    .update({ status: "approved" })
    .eq("id", expense.id);

  // Notify employee
  if (employeeId) {
    await createNotification(
      employeeId,
      `Your expense "${expense.description}" has been fully approved! (${reason})`,
      expense.id,
      "expense_approved"
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Function 5 — processSpecialApproverAction
// ─────────────────────────────────────────────────────────────

export async function processSpecialApproverAction(expenseId, approverId, action, comment) {
  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new Error('Action must be "APPROVE" or "REJECT"');
  }

  // Fetch expense with its rule
  const { data: expense, error: expError } = await supabase
    .from("expenses")
    .select("*, employee:employee_id(id, email, full_name)")
    .eq("id", expenseId)
    .single();

  if (expError || !expense) throw new Error("Expense not found");
  if (expense.status !== "pending") {
    throw new Error(`Expense is already ${expense.status}`);
  }

  // Verify this user is the special approver for this rule
  if (!expense.applied_rule_id) {
    throw new Error("No rule applied to this expense");
  }

  const { data: rule, error: ruleError } = await supabase
    .from("approval_rules")
    .select("*")
    .eq("id", expense.applied_rule_id)
    .single();

  if (ruleError || !rule) throw new Error("Applied rule not found");

  if (rule.specific_approver_id !== approverId) {
    throw new Error("You are not the special approver for this expense's rule");
  }

  // Get approver info
  const { data: approver } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", approverId)
    .single();
  const approverName = approver?.full_name || approver?.email?.split("@")[0] || "Special Approver";

  const employeeId = expense.employee_id || expense.user_id;

  // Fetch all steps
  const { data: allSteps } = await supabase
    .from("expense_approval_steps")
    .select("*")
    .eq("expense_id", expenseId);

  if (action === "REJECT") {
    // Mark expense REJECTED
    await supabase
      .from("expenses")
      .update({ status: "rejected" })
      .eq("id", expenseId);

    // Skip all PENDING/WAITING steps
    if (allSteps && allSteps.length > 0) {
      await supabase
        .from("expense_approval_steps")
        .update({
          status: "SKIPPED",
          comment: `Skipped — rejected by special approver ${approverName}`,
          actioned_at: new Date().toISOString(),
        })
        .eq("expense_id", expenseId)
        .in("status", ["PENDING", "WAITING"]);
    }

    // Notify employee
    if (employeeId) {
      await createNotification(
        employeeId,
        `Your expense "${expense.description}" was rejected by special approver ${approverName}.${comment ? ` Reason: ${comment}` : ""}`,
        expenseId,
        "expense_rejected"
      );
    }

    return { status: "REJECTED", reason: `Rejected by special approver ${approverName}` };
  }

  // APPROVE
  await supabase
    .from("expenses")
    .update({ status: "approved" })
    .eq("id", expenseId);

  // Skip all PENDING/WAITING steps
  if (allSteps && allSteps.length > 0) {
    await supabase
      .from("expense_approval_steps")
      .update({
        status: "SKIPPED",
        comment: `Skipped — approved by special approver ${approverName}`,
        actioned_at: new Date().toISOString(),
      })
      .eq("expense_id", expenseId)
      .in("status", ["PENDING", "WAITING"]);
  }

  // Notify employee
  if (employeeId) {
    await createNotification(
      employeeId,
      `Your expense "${expense.description}" was approved by special approver ${approverName}!${comment ? ` Note: ${comment}` : ""}`,
      expenseId,
      "expense_approved"
    );
  }

  return { status: "APPROVED", reason: `Approved by special approver ${approverName}` };
}
