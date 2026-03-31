/**
 * Currency Service
 * Handles all currency operations including:
 * - Exchange rate fetching with caching
 * - Currency conversion
 * - Country/Currency lookups
 */

// ═══════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// Exchange rate cache - stores rates for 1 hour
const exchangeRateCache = {
  rates: {},      // { INR: { USD: 0.012, EUR: 0.011, ... }, USD: { INR: 83.5, ... } }
  timestamp: {},  // { INR: 1234567890, USD: 1234567891 }
};
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Countries cache - stores country/currency data (longer cache since it rarely changes)
let countriesCache = {
  data: null,
  timestamp: 0
};
const COUNTRIES_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ═══════════════════════════════════════════════════════════════════
// EXCHANGE RATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch exchange rates for a base currency
 * Uses exchangerate-api.com (free tier: 1500 requests/month)
 * @param {string} baseCurrency - 3-letter currency code (e.g., 'INR', 'USD')
 * @returns {Promise<Object>} - Rates object { USD: 0.012, EUR: 0.011, ... }
 * @throws {Error} - If API fails
 */
export async function fetchExchangeRates(baseCurrency) {
  const normalizedBase = baseCurrency.toUpperCase();
  const now = Date.now();

  // Check cache first
  if (
    exchangeRateCache.rates[normalizedBase] &&
    exchangeRateCache.timestamp[normalizedBase] &&
    now - exchangeRateCache.timestamp[normalizedBase] < CACHE_DURATION_MS
  ) {
    console.log(`[CurrencyService] Using cached rates for ${normalizedBase}`);
    return exchangeRateCache.rates[normalizedBase];
  }

  // Fetch fresh rates
  console.log(`[CurrencyService] Fetching fresh rates for ${normalizedBase}`);
  
  const response = await fetch(
    `https://api.exchangerate-api.com/v4/latest/${normalizedBase}`
  );

  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.rates) {
    throw new Error('Invalid response from exchange rate API');
  }

  // Update cache
  exchangeRateCache.rates[normalizedBase] = data.rates;
  exchangeRateCache.timestamp[normalizedBase] = now;

  return data.rates;
}

/**
 * Get exchange rate between two currencies
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @returns {Promise<number>} - Exchange rate
 * @throws {Error} - If rate cannot be fetched
 */
export async function getExchangeRate(fromCurrency, toCurrency) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  // Same currency = 1:1
  if (from === to) {
    return 1;
  }

  const rates = await fetchExchangeRates(from);
  
  if (rates[to] === undefined) {
    throw new Error(`Exchange rate not available for ${from} to ${to}`);
  }

  return rates[to];
}

/**
 * Convert amount from one currency to another
 * This is the main conversion function used by expense submission
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency (employee's currency)
 * @param {string} toCurrency - Target currency (company's base currency)
 * @returns {Promise<Object>} - { convertedAmount, exchangeRate, timestamp }
 * @throws {Error} - If conversion fails (API down, invalid currency, etc.)
 */
export async function convertToBase(amount, fromCurrency, toCurrency) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const timestamp = new Date().toISOString();

  // Same currency - no conversion needed
  if (from === to) {
    return {
      convertedAmount: parseFloat(amount),
      exchangeRate: 1,
      timestamp
    };
  }

  // Fetch rates from the employee's currency
  // API gives rates FROM base TO others
  // e.g., if base is USD, rates[INR] = 83.5 means 1 USD = 83.5 INR
  
  // We need to convert FROM employee currency TO company base
  // So we fetch rates from employee's currency and look for company currency
  const rates = await fetchExchangeRates(from);
  
  if (rates[to] === undefined) {
    throw new Error(`Cannot convert ${from} to ${to}: rate not available`);
  }

  const exchangeRate = rates[to];
  const convertedAmount = parseFloat((amount * exchangeRate).toFixed(2));

  return {
    convertedAmount,
    exchangeRate,
    timestamp
  };
}

// ═══════════════════════════════════════════════════════════════════
// COUNTRY/CURRENCY LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch all countries with their currencies
 * Uses restcountries.com API
 * @returns {Promise<Array>} - Array of { name, currencyCode, currencyName, currencySymbol }
 */
export async function fetchCountries() {
  const now = Date.now();

  // Check cache first
  if (
    countriesCache.data &&
    now - countriesCache.timestamp < COUNTRIES_CACHE_DURATION_MS
  ) {
    console.log('[CurrencyService] Using cached countries data');
    return countriesCache.data;
  }

  console.log('[CurrencyService] Fetching countries from API');

  const response = await fetch(
    'https://restcountries.com/v3.1/all?fields=name,currencies'
  );

  if (!response.ok) {
    throw new Error(`Countries API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Transform data into usable format
  const countries = data
    .filter(country => country.currencies) // Only countries with currencies
    .map(country => {
      const currencyCodes = Object.keys(country.currencies);
      const primaryCurrency = currencyCodes[0]; // Use first currency as primary
      const currencyData = country.currencies[primaryCurrency];

      return {
        name: country.name.common,
        officialName: country.name.official,
        currencyCode: primaryCurrency,
        currencyName: currencyData?.name || primaryCurrency,
        currencySymbol: currencyData?.symbol || primaryCurrency
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Update cache
  countriesCache = {
    data: countries,
    timestamp: now
  };

  return countries;
}

/**
 * Get currency info for a specific country
 * @param {string} countryName - Country name (common name)
 * @returns {Promise<Object|null>} - Currency info or null if not found
 */
export async function getCurrencyForCountry(countryName) {
  const countries = await fetchCountries();
  
  // Try exact match first
  let match = countries.find(
    c => c.name.toLowerCase() === countryName.toLowerCase()
  );

  // Try partial match if exact fails
  if (!match) {
    match = countries.find(
      c => c.name.toLowerCase().includes(countryName.toLowerCase()) ||
           countryName.toLowerCase().includes(c.name.toLowerCase())
    );
  }

  if (!match) {
    return null;
  }

  return {
    currencyCode: match.currencyCode,
    currencyName: match.currencyName,
    currencySymbol: match.currencySymbol,
    country: match.name
  };
}

/**
 * Get currency symbol for a currency code
 * @param {string} currencyCode - 3-letter currency code
 * @returns {string} - Currency symbol
 */
export function getCurrencySymbol(currencyCode) {
  const symbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'AUD': 'A$',
    'CAD': 'C$',
    'SGD': 'S$',
    'AED': 'د.إ',
    'JPY': '¥',
    'CNY': '¥',
    'CHF': 'CHF',
    'NZD': 'NZ$',
    'HKD': 'HK$',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr',
    'MXN': '$',
    'BRL': 'R$',
    'ZAR': 'R',
    'RUB': '₽',
    'KRW': '₩',
    'THB': '฿',
    'MYR': 'RM',
    'PHP': '₱',
    'IDR': 'Rp',
    'VND': '₫',
    'PLN': 'zł',
    'TRY': '₺',
    'ILS': '₪',
    'SAR': '﷼',
    'QAR': '﷼',
    'KWD': 'د.ك',
    'BHD': 'د.ب',
    'OMR': '﷼'
  };
  
  return symbols[currencyCode.toUpperCase()] || currencyCode;
}

// ═══════════════════════════════════════════════════════════════════
// COMMON CURRENCIES LIST (for dropdowns)
// ═══════════════════════════════════════════════════════════════════

/**
 * Get list of common currencies for expense form dropdown
 * @returns {Array} - Array of { code, name, symbol }
 */
export function getCommonCurrencies() {
  return [
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
    { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
    { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
    { code: 'THB', name: 'Thai Baht', symbol: '฿' },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
    { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
    { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
    { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' },
    { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
    { code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب' },
    { code: 'OMR', name: 'Omani Rial', symbol: '﷼' }
  ];
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted amount (e.g., "₹1,234.56")
 */
export function formatCurrency(amount, currencyCode, options = {}) {
  const { showCode = false, locale = 'en-IN' } = options;
  
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    const formatted = formatter.format(amount);
    return showCode ? `${formatted} ${currencyCode}` : formatted;
  } catch (error) {
    // Fallback if Intl doesn't support the currency
    const symbol = getCurrencySymbol(currencyCode);
    const formatted = amount.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${symbol}${formatted}`;
  }
}

/**
 * Clear all caches (useful for testing or manual refresh)
 */
export function clearCaches() {
  exchangeRateCache.rates = {};
  exchangeRateCache.timestamp = {};
  countriesCache = { data: null, timestamp: 0 };
  console.log('[CurrencyService] All caches cleared');
}

/**
 * Get cache status (for debugging/monitoring)
 */
export function getCacheStatus() {
  const now = Date.now();
  return {
    exchangeRates: {
      currencies: Object.keys(exchangeRateCache.rates),
      ages: Object.entries(exchangeRateCache.timestamp).map(([currency, timestamp]) => ({
        currency,
        ageMinutes: Math.round((now - timestamp) / 60000),
        isStale: now - timestamp >= CACHE_DURATION_MS
      }))
    },
    countries: {
      loaded: !!countriesCache.data,
      count: countriesCache.data?.length || 0,
      ageMinutes: countriesCache.timestamp ? Math.round((now - countriesCache.timestamp) / 60000) : null,
      isStale: now - countriesCache.timestamp >= COUNTRIES_CACHE_DURATION_MS
    }
  };
}

export default {
  fetchExchangeRates,
  getExchangeRate,
  convertToBase,
  fetchCountries,
  getCurrencyForCountry,
  getCurrencySymbol,
  getCommonCurrencies,
  formatCurrency,
  clearCaches,
  getCacheStatus
};
