import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncAuthUsersToProfiles() {
  console.log('🔄 Syncing auth users to profiles table...\n');

  // Get all auth users
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('Error fetching auth users:', authError);
    return;
  }

  const authUsers = authData.users;
  console.log(`Found ${authUsers.length} auth users\n`);

  // Get existing profiles
  const { data: existingProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, role');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    return;
  }

  const existingProfileIds = new Set(existingProfiles.map(p => p.id));
  console.log(`Found ${existingProfiles.length} existing profiles\n`);

  // Find users without profiles
  const usersWithoutProfiles = authUsers.filter(user => !existingProfileIds.has(user.id));

  if (usersWithoutProfiles.length === 0) {
    console.log('✅ All auth users already have profiles!');
    return;
  }

  console.log(`❌ Found ${usersWithoutProfiles.length} users without profiles:\n`);

  // Create missing profiles
  for (const user of usersWithoutProfiles) {
    const role = user.user_metadata?.role || 'employee';
    
    console.log(`   Creating profile for: ${user.email} (${role})`);
    
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        role: role,
        manager_id: null
      });

    if (insertError) {
      console.error(`   ❌ Failed to create profile for ${user.email}:`, insertError.message);
    } else {
      console.log(`   ✅ Created profile for ${user.email}`);
    }
  }

  console.log('\n✅ Profile sync complete!');
  
  // Show final state
  const { data: finalProfiles } = await supabase
    .from('profiles')
    .select('id, email, role')
    .order('created_at', { ascending: false });

  console.log(`\n📊 Total profiles now: ${finalProfiles.length}`);
  finalProfiles.forEach(p => {
    console.log(`   - ${p.email} (${p.role})`);
  });
}

syncAuthUsersToProfiles().catch(console.error);
