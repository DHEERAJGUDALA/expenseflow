import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test data
let testEmployee, manager1, manager2, manager3, specialApprover;

async function setup() {
  console.log('🔧 Setting up test data...\n');

  // Get test users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['employee', 'manager', 'admin'])
    .limit(5);

  testEmployee = profiles.find(p => p.role === 'employee');
  const managers = profiles.filter(p => p.role === 'manager' || p.role === 'admin');
  
  manager1 = managers[0];
  manager2 = managers[1] || managers[0]; // Reuse if not enough
  manager3 = managers[2] || managers[0];
  specialApprover = managers[0]; // CEO/CFO

  console.log('👤 Test Employee:', testEmployee?.email);
  console.log('👔 Manager 1:', manager1?.email);
  console.log('👔 Manager 2:', manager2?.email);
  console.log('👔 Manager 3:', manager3?.email);
  console.log('⭐ Special Approver:', specialApprover?.email);
  console.log('');

  if (!testEmployee || !manager1) {
    console.error('❌ Not enough test data! Create at least 1 employee and 1 manager.');
    process.exit(1);
  }

  return { testEmployee, manager1, manager2, manager3, specialApprover };
}

async function createTestWorkflow(config) {
  // Deactivate old workflows
  await supabase
    .from('approval_workflows')
    .update({ is_active: false })
    .eq('employee_id', testEmployee.id);

  // Create workflow
  const { data: workflow, error } = await supabase
    .from('approval_workflows')
    .insert({
      employee_id: testEmployee.id,
      workflow_name: config.name,
      approval_type: config.type,
      approval_threshold: config.threshold,
      has_special_approver: config.hasSpecial || false,
      special_approver_id: config.specialApproverId || null,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;

  // Create steps
  const steps = config.approvers.map(a => ({
    workflow_id: workflow.id,
    approver_id: a.id,
    step_order: a.order,
    is_required: a.required !== false
  }));

  await supabase.from('approval_steps').insert(steps);

  return workflow;
}

async function createTestExpense() {
  const { data: expense, error } = await supabase
    .from('expenses')
    .insert({
      user_id: testEmployee.id,
      description: 'Test Expense',
      amount: 100.00,
      category: 'meals',
      expense_date: new Date().toISOString().split('T')[0],
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return expense;
}

async function linkWorkflowToExpense(expenseId, workflowId) {
  await supabase
    .from('expenses')
    .update({ workflow_id: workflowId })
    .eq('id', expenseId);
}

async function approveOrReject(expenseId, approverId, action, isSpecial = false) {
  const { data: workflow } = await supabase
    .from('expenses')
    .select('workflow_id, workflow:workflow_id(steps:approval_steps(*))')
    .eq('id', expenseId)
    .single();

  const step = workflow?.workflow?.steps?.find(s => s.approver_id === approverId);

  const { error } = await supabase
    .from('expense_approval_logs')
    .insert({
      expense_id: expenseId,
      workflow_id: workflow.workflow_id,
      approver_id: approverId,
      action,
      comments: `Test ${action}`,
      step_order: step?.step_order || null,
      is_special_override: isSpecial
    });

  if (error) throw error;
}

async function getExpenseStatus(expenseId) {
  const { data } = await supabase
    .from('expenses')
    .select('status')
    .eq('id', expenseId)
    .single();

  return data?.status;
}

// ============================================
// TEST 1: 60% Threshold (3 approvers, need 60%)
// ============================================
async function test1_PercentageApproval() {
  console.log('📝 TEST 1: 60% Threshold (3 approvers)\n');

  const workflow = await createTestWorkflow({
    name: 'Test: 60% Threshold',
    type: 'percentage',
    threshold: 60,
    approvers: [
      { id: manager1.id, order: 1 },
      { id: manager2.id, order: 1 },
      { id: manager3.id, order: 1 }
    ]
  });

  const expense = await createTestExpense();
  await linkWorkflowToExpense(expense.id, workflow.id);

  console.log(`✅ Expense created: ${expense.id}`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)}`);

  // Manager 1 approves (33.3%)
  await approveOrReject(expense.id, manager1.id, 'approved');
  console.log(`\n✅ Manager 1 approved`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (33.3% - still pending)`);

  // Manager 2 approves (66.6% >= 60%)
  await approveOrReject(expense.id, manager2.id, 'approved');
  console.log(`\n✅ Manager 2 approved`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (66.7% >= 60% - APPROVED!)`);
  console.log(`   Manager 3 should be SKIPPED\n`);

  const status = await getExpenseStatus(expense.id);
  if (status === 'approved') {
    console.log('✅ TEST 1 PASSED!\n\n');
  } else {
    console.log(`❌ TEST 1 FAILED! Expected: approved, Got: ${status}\n\n`);
  }
}

// ============================================
// TEST 2: Special Approver Override
// ============================================
async function test2_SpecialApproverOverride() {
  console.log('📝 TEST 2: Special Approver Override\n');

  const workflow = await createTestWorkflow({
    name: 'Test: Special Approver',
    type: 'percentage',
    threshold: 100, // Require all normally
    hasSpecial: true,
    specialApproverId: specialApprover.id,
    approvers: [
      { id: manager1.id, order: 1 },
      { id: manager2.id, order: 1 }
    ]
  });

  const expense = await createTestExpense();
  await linkWorkflowToExpense(expense.id, workflow.id);

  console.log(`✅ Expense created: ${expense.id}`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)}`);

  // Manager 1 approves
  await approveOrReject(expense.id, manager1.id, 'approved');
  console.log(`\n✅ Manager 1 approved`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (50% - still pending)`);

  // Special approver overrides
  await approveOrReject(expense.id, specialApprover.id, 'approved', true);
  console.log(`\n⭐ Special Approver APPROVED (override)`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (APPROVED immediately!)`);
  console.log(`   Manager 2 should be SKIPPED\n`);

  const status = await getExpenseStatus(expense.id);
  if (status === 'approved') {
    console.log('✅ TEST 2 PASSED!\n\n');
  } else {
    console.log(`❌ TEST 2 FAILED! Expected: approved, Got: ${status}\n\n`);
  }
}

// ============================================
// TEST 3: Any Rejection = Instant Reject
// ============================================
async function test3_InstantRejection() {
  console.log('📝 TEST 3: Any Rejection = Instant Reject\n');

  const workflow = await createTestWorkflow({
    name: 'Test: Instant Reject',
    type: 'percentage',
    threshold: 60,
    approvers: [
      { id: manager1.id, order: 1 },
      { id: manager2.id, order: 1 },
      { id: manager3.id, order: 1 }
    ]
  });

  const expense = await createTestExpense();
  await linkWorkflowToExpense(expense.id, workflow.id);

  console.log(`✅ Expense created: ${expense.id}`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)}`);

  // Manager 1 approves
  await approveOrReject(expense.id, manager1.id, 'approved');
  console.log(`\n✅ Manager 1 approved`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (33.3% - still pending)`);

  // Manager 2 REJECTS
  await approveOrReject(expense.id, manager2.id, 'rejected');
  console.log(`\n❌ Manager 2 REJECTED`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (REJECTED immediately!)`);
  console.log(`   Manager 3 should be SKIPPED\n`);

  const status = await getExpenseStatus(expense.id);
  if (status === 'rejected') {
    console.log('✅ TEST 3 PASSED!\n\n');
  } else {
    console.log(`❌ TEST 3 FAILED! Expected: rejected, Got: ${status}\n\n`);
  }
}

// ============================================
// TEST 4: Sequential Approval
// ============================================
async function test4_SequentialApproval() {
  console.log('📝 TEST 4: Sequential Approval (A → B → C)\n');

  const workflow = await createTestWorkflow({
    name: 'Test: Sequential',
    type: 'sequential',
    approvers: [
      { id: manager1.id, order: 1 },
      { id: manager2.id, order: 2 },
      { id: manager3.id, order: 3 }
    ]
  });

  const expense = await createTestExpense();
  await linkWorkflowToExpense(expense.id, workflow.id);

  console.log(`✅ Expense created: ${expense.id}`);

  // Manager 1 approves
  await approveOrReject(expense.id, manager1.id, 'approved');
  console.log(`\n✅ Manager 1 approved (Step 1)`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (pending - waiting for step 2)`);

  // Manager 2 approves
  await approveOrReject(expense.id, manager2.id, 'approved');
  console.log(`\n✅ Manager 2 approved (Step 2)`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (pending - waiting for step 3)`);

  // Manager 3 approves
  await approveOrReject(expense.id, manager3.id, 'approved');
  console.log(`\n✅ Manager 3 approved (Step 3)`);
  console.log(`   Status: ${await getExpenseStatus(expense.id)} (APPROVED - all steps complete)\n`);

  const status = await getExpenseStatus(expense.id);
  if (status === 'approved') {
    console.log('✅ TEST 4 PASSED!\n\n');
  } else {
    console.log(`❌ TEST 4 FAILED! Expected: approved, Got: ${status}\n\n`);
  }
}

// ============================================
// RUN ALL TESTS
// ============================================
async function runAllTests() {
  console.log('🚀 Starting Approval Workflow Tests\n');
  console.log('='.repeat(50) + '\n');

  await setup();

  try {
    await test1_PercentageApproval();
    await test2_SpecialApproverOverride();
    await test3_InstantRejection();
    await test4_SequentialApproval();

    console.log('='.repeat(50));
    console.log('🎉 ALL TESTS COMPLETED!\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

runAllTests();
