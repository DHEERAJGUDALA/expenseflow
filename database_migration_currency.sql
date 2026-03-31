-- ═══════════════════════════════════════════════════════════════════
-- CURRENCY SYSTEM MIGRATION - RUN THIS IN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════
-- This implements:
-- 1. Add currency_code and currency_symbol to companies table
-- 2. Add complete currency tracking to expenses table
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- PART 1: UPDATE COMPANIES TABLE
-- ───────────────────────────────────────────────────────────────────
-- Add currency_code (3-letter ISO code like INR, USD, EUR)
-- Add currency_symbol (display symbol like ₹, $, €)
-- Add country for reference

-- First, add the new columns if they don't exist
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'INR';

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10) DEFAULT '₹';

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Update existing records to have consistent currency data
-- If currency column exists, migrate its value to currency_code
UPDATE companies 
SET currency_code = COALESCE(currency, 'INR'),
    currency_symbol = CASE 
      WHEN currency = 'USD' THEN '$'
      WHEN currency = 'EUR' THEN '€'
      WHEN currency = 'GBP' THEN '£'
      WHEN currency = 'AUD' THEN 'A$'
      WHEN currency = 'CAD' THEN 'C$'
      WHEN currency = 'SGD' THEN 'S$'
      WHEN currency = 'AED' THEN 'د.إ'
      WHEN currency = 'JPY' THEN '¥'
      WHEN currency = 'CNY' THEN '¥'
      ELSE '₹'
    END
WHERE currency_code IS NULL OR currency_code = 'INR';

-- ───────────────────────────────────────────────────────────────────
-- PART 2: UPDATE EXPENSES TABLE FOR FULL CURRENCY TRACKING
-- ───────────────────────────────────────────────────────────────────
-- original_amount: What the employee entered in their currency
-- original_currency: The currency code employee selected (e.g., USD)
-- converted_amount: Amount in company's base currency
-- exchange_rate_used: The rate at the time of submission (frozen)
-- conversion_timestamp: When the conversion happened

-- Add original_amount (employee's entered amount)
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS original_amount DECIMAL(15,2);

-- Add original_currency (3-letter code like USD, EUR)
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3);

-- Update existing column converted_amount to be DECIMAL(15,2)
-- First check if it exists, if not create it
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS converted_amount DECIMAL(15,2);

-- Add exchange_rate_used (frozen at submission time)
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(20,10);

-- Add conversion_timestamp
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS conversion_timestamp TIMESTAMPTZ;

-- Add company_currency (for quick reference without join)
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS company_currency VARCHAR(3);

-- ───────────────────────────────────────────────────────────────────
-- PART 3: MIGRATE EXISTING DATA
-- ───────────────────────────────────────────────────────────────────
-- For existing expenses, set original values from current amount

UPDATE expenses 
SET 
  original_amount = COALESCE(original_amount, amount),
  original_currency = COALESCE(original_currency, currency, 'INR'),
  converted_amount = COALESCE(converted_amount, amount),
  exchange_rate_used = COALESCE(exchange_rate_used, 1.0),
  conversion_timestamp = COALESCE(conversion_timestamp, created_at),
  company_currency = COALESCE(company_currency, 'INR')
WHERE original_amount IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- PART 4: ADD INDEXES FOR PERFORMANCE
-- ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_original_currency ON expenses(original_currency);
CREATE INDEX IF NOT EXISTS idx_expenses_company_currency ON expenses(company_currency);
CREATE INDEX IF NOT EXISTS idx_companies_currency_code ON companies(currency_code);

-- ───────────────────────────────────────────────────────────────────
-- VERIFICATION - Check what was created/updated
-- ───────────────────────────────────────────────────────────────────

SELECT 'companies currency columns' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'companies' 
AND column_name IN ('currency', 'currency_code', 'currency_symbol', 'country')

UNION ALL

SELECT 'expenses currency columns' as check_type, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'expenses' 
AND column_name IN ('amount', 'original_amount', 'original_currency', 'converted_amount', 'exchange_rate_used', 'conversion_timestamp', 'company_currency');
