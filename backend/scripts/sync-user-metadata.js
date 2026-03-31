/**
 * ONE-TIME MIGRATION: Sync user_metadata.role from profiles table
 * 
 * Run with:  node scripts/sync-user-metadata.js
 * 
 * What it does:
 * - Fetches all rows from the profiles table
 * - For each profile, calls Supabase Admin API to update
 *   user_metadata.role, full_name, company_id to match profiles table
 * - Logs success/failure per user
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function syncUserMetadata() {
  console.log("Fetching all profiles...");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, role, full_name, company_id");

  if (error) {
    console.error("Failed to fetch profiles:", error.message);
    process.exit(1);
  }

  console.log(`Found ${profiles.length} profiles. Starting sync...\n`);

  let success = 0;
  let failed = 0;

  for (const profile of profiles) {
    try {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        profile.id,
        {
          user_metadata: {
            role: profile.role,
            full_name: profile.full_name ?? "",
            company_id: profile.company_id ?? null,
          }
        }
      );

      if (updateError) {
        console.error(`  ✗ ${profile.email} (${profile.role}): ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ ${profile.email} → role: ${profile.role}`);
        success++;
      }
    } catch (err) {
      console.error(`  ✗ ${profile.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

syncUserMetadata();
