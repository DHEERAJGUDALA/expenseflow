import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMigration() {
  console.log('🔍 Verifying Database Migration...\n');

  try {
    // Check which tables exist by attempting to query them
    const tableNames = [];
    
    const tablesToCheck = [
      'companies',
      'approval_rules',
      'approval_rule_steps',
      'approval_rule_parallel_approvers',
      'approval_logs',
      'payment_cycles',
      'audit_logs',
      'manager_approvals',
      'admin_approvals',
      'individual_approvals',
      'profiles',
      'expenses'
    ];

    for (const table of tablesToCheck) {
      try {
        const { error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .limit(1);
        
        if (!error) {
          tableNames.push(table);
        }
      } catch (e) {
        // Table doesn't exist
      }
    }
    
    // New tables that should exist after Phase 1
    const newTables = [
      'companies',
      'approval_rules',
      'approval_rule_steps',
      'approval_rule_parallel_approvers',
      'approval_logs',
      'payment_cycles',
      'audit_logs'
    ];

    const oldTables = [
      'manager_approvals',
      'admin_approvals',
      'individual_approvals'
    ];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TABLE STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let phase1Complete = true;
    let phase3Complete = true;

    console.log('\n🆕 NEW TABLES (Phase 1):');
    for (const table of newTables) {
      const exists = tableNames.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
      if (!exists) phase1Complete = false;
    }

    console.log('\n🗂️  OLD TABLES:');
    for (const table of oldTables) {
      const exists = tableNames.includes(table);
      console.log(`   ${exists ? '⚠️' : '🗑️ '} ${table} ${exists ? '(still in public schema)' : '(archived/deleted)'}`);
      if (exists) phase3Complete = false;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 DATA COUNTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (phase1Complete) {
      // Count records in new tables
      const { count: companiesCount } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });
      
      const { count: rulesCount } = await supabase
        .from('approval_rules')
        .select('*', { count: 'exact', head: true });
      
      const { count: stepsCount } = await supabase
        .from('approval_rule_steps')
        .select('*', { count: 'exact', head: true });
      
      const { count: parallelCount } = await supabase
        .from('approval_rule_parallel_approvers')
        .select('*', { count: 'exact', head: true });
      
      const { count: logsCount } = await supabase
        .from('approval_logs')
        .select('*', { count: 'exact', head: true });
      
      const { count: cyclesCount } = await supabase
        .from('payment_cycles')
        .select('*', { count: 'exact', head: true });
      
      const { count: auditCount } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });

      console.log('🆕 NEW TABLES:');
      console.log(`   companies: ${companiesCount} records`);
      console.log(`   approval_rules: ${rulesCount} records`);
      console.log(`   approval_rule_steps: ${stepsCount} records`);
      console.log(`   approval_rule_parallel_approvers: ${parallelCount} records`);
      console.log(`   approval_logs: ${logsCount} records`);
      console.log(`   payment_cycles: ${cyclesCount} records`);
      console.log(`   audit_logs: ${auditCount} records\n`);
    }

    // Count old tables if they still exist
    if (!phase3Complete) {
      console.log('🗂️  OLD TABLES:');
      
      if (tableNames.includes('manager_approvals')) {
        const { count: managerCount } = await supabase
          .from('manager_approvals')
          .select('*', { count: 'exact', head: true });
        console.log(`   manager_approvals: ${managerCount} records`);
      }
      
      if (tableNames.includes('admin_approvals')) {
        const { count: adminCount } = await supabase
          .from('admin_approvals')
          .select('*', { count: 'exact', head: true });
        console.log(`   admin_approvals: ${adminCount} records`);
      }
      
      if (tableNames.includes('individual_approvals')) {
        const { count: individualCount } = await supabase
          .from('individual_approvals')
          .select('*', { count: 'exact', head: true });
        console.log(`   individual_approvals: ${individualCount} records`);
      }
      console.log();
    }

    // Check column additions by querying sample data
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 COLUMN ADDITIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (tableNames.includes('profiles')) {
      const { data: sampleProfile } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .single();

      if (sampleProfile) {
        console.log('profiles table:');
        console.log(`   ${sampleProfile.hasOwnProperty('job_title') ? '✅' : '❌'} job_title`);
        console.log(`   ${sampleProfile.hasOwnProperty('company_id') ? '✅' : '❌'} company_id`);
        console.log(`   ${sampleProfile.hasOwnProperty('manager_id') ? '✅' : '❌'} manager_id`);
        console.log(`   ${sampleProfile.hasOwnProperty('updated_at') ? '✅' : '❌'} updated_at\n`);
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 MIGRATION STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!phase1Complete) {
      console.log('⏳ Phase 1: NOT STARTED');
      console.log('   → Run database_migration_phase1.sql in Supabase SQL Editor\n');
    } else {
      console.log('✅ Phase 1: COMPLETE');
      
      if (phase3Complete) {
        console.log('✅ Phase 3: COMPLETE (old tables archived/deleted)');
      } else {
        console.log('⏳ Phase 3: NOT STARTED (old tables still exist)');
        console.log('   → Safe to keep them as backup until you verify new system works\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 NEXT STEPS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!phase1Complete) {
      console.log('1. Run database_migration_phase1.sql');
      console.log('2. Run this script again to verify');
      console.log('3. Run database_migration_phase2.sql');
      console.log('4. Test the new workflow system');
      console.log('5. Run database_migration_phase3.sql (optional cleanup)\n');
    } else if (!phase3Complete) {
      console.log('1. Test the new workflow system thoroughly');
      console.log('2. Run: node test-workflows.js');
      console.log('3. Verify approvals work in the UI');
      console.log('4. Once confident, run database_migration_phase3.sql\n');
    } else {
      console.log('✅ Migration complete!');
      console.log('   Run: node test-workflows.js to test the system\n');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    process.exit(1);
  }
}

verifyMigration();
