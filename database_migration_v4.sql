-- ═══════════════════════════════════════════════════════════════
-- MIGRATION V4: Fix RLS policy on profiles table
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Drop existing policies if any (safe to run even if none exist)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to read own profile" ON profiles;

-- Enable RLS (in case it's off)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow each authenticated user to read their OWN profile row
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow admins (service role) unrestricted access — already implicit via service key
-- No change needed for backend (it uses service role key which bypasses RLS)

-- ═══════════════════════════════════════════════════════════════
-- DONE. Frontend anon key can now read profiles for the logged-in user.
-- ═══════════════════════════════════════════════════════════════
