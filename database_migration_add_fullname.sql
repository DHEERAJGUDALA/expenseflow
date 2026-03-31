-- ═══════════════════════════════════════════════════════════════════
-- ADD full_name COLUMN TO PROFILES TABLE
-- ═══════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor
-- This is NON-DESTRUCTIVE
-- ═══════════════════════════════════════════════════════════════════

-- Add full_name column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Optional: Add job_title if it doesn't exist (in case phase1 wasn't run)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('full_name', 'job_title');
