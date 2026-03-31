import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectSchema() {
  console.log('🔍 Inspecting Supabase Schema...\n');

  // Get all tables in public schema
  const { data: tables, error } = await supabase
    .rpc('get_table_info');

  if (error) {
    console.error('Using direct query instead...');
    
    // Try alternative method - query information_schema
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;

    console.log('\n📋 Tables in public schema:\n');
    
    // Get profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
    
    if (!profilesError) {
      console.log('✅ profiles table exists');
      console.log('   Sample row:', profiles[0] || 'empty');
    }

    // Get expenses table
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .limit(1);
    
    if (!expensesError) {
      console.log('✅ expenses table exists');
      console.log('   Sample row:', expenses[0] || 'empty');
    }

    // Get manager_approvals table
    const { data: approvals, error: approvalsError } = await supabase
      .from('manager_approvals')
      .select('*')
      .limit(1);
    
    if (!approvalsError) {
      console.log('✅ manager_approvals table exists');
      console.log('   Sample row:', approvals[0] || 'empty');
    }

    // Get admin_approvals table
    const { data: adminApprovals, error: adminApprovalsError } = await supabase
      .from('admin_approvals')
      .select('*')
      .limit(1);
    
    if (!adminApprovalsError) {
      console.log('✅ admin_approvals table exists');
      console.log('   Sample row:', adminApprovals[0] || 'empty');
    }

    // Get individual_approvals table
    const { data: individualApprovals, error: individualApprovalsError } = await supabase
      .from('individual_approvals')
      .select('*')
      .limit(1);
    
    if (!individualApprovalsError) {
      console.log('✅ individual_approvals table exists');
      console.log('   Sample row:', individualApprovals[0] || 'empty');
    }

    // Check foreign key constraints by trying to list all profiles
    console.log('\n🔗 Checking profiles:');
    const { data: allProfiles, error: allProfilesError } = await supabase
      .from('profiles')
      .select('id, email, role, manager_id, created_at')
      .limit(10);
    
    if (!allProfilesError) {
      console.log(`   Found ${allProfiles?.length || 0} profiles:`);
      allProfiles?.forEach(p => {
        console.log(`   - ${p.email} (${p.role})`);
      });
    } else {
      console.log('   Error:', allProfilesError.message);
    }

    // Check current auth user
    console.log('\n👤 Checking auth users:');
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (!authError) {
      console.log(`   Found ${authUsers?.users?.length || 0} auth users:`);
      authUsers?.users?.slice(0, 5).forEach(u => {
        console.log(`   - ${u.email} (role: ${u.user_metadata?.role || 'none'})`);
      });
    } else {
      console.log('   Error:', authError.message);
    }

    return;
  }

  console.log('Tables:', tables);
}

inspectSchema().catch(console.error);
