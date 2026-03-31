# 🔌 Currency System API Reference

## Overview
Complete API reference for the multi-currency expense management system.

---

## Currency Endpoints

### 1. Get Available Currencies
```http
GET /api/expenses/currencies
Authorization: Bearer {token}
```

**Response:**
```json
{
  "currencies": [
    {
      "code": "INR",
      "name": "Indian Rupee",
      "symbol": "₹"
    },
    {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    }
    // ... 35+ currencies
  ]
}
```

### 2. Get Currency Conversion Rate
```http
GET /api/expenses/convert?from=USD&to=INR&amount=100
Authorization: Bearer {token}
```

**Query Parameters:**
- `from` (required): Source currency code (e.g., "USD")
- `to` (required): Target currency code (e.g., "INR")
- `amount` (optional): Amount to convert

**Response:**
```json
{
  "from": "USD",
  "to": "INR",
  "rate": 83.25,
  "from_symbol": "$",
  "to_symbol": "₹",
  "original_amount": 100,
  "converted_amount": 8325.00
}
```

**Error Response (503):**
```json
{
  "error": "Currency conversion service is temporarily unavailable",
  "details": "Exchange rate API error: 429 Too Many Requests"
}
```

---

## Company Endpoints

### 3. Get Company Details
```http
GET /api/companies/me
Authorization: Bearer {token}
```

**Response:**
```json
{
  "company": {
    "id": "uuid",
    "name": "Acme Corporation",
    "country": "India",
    "currency": "INR",           // Legacy
    "currency_code": "INR",      // New
    "currency_symbol": "₹",      // New
    "created_at": "2026-03-29T10:00:00Z"
  },
  "stats": {
    "totalUsers": 25,
    "totalExpenses": 150
  }
}
```

---

## Expense Endpoints

### 4. Create Expense (with Currency Conversion)
```http
POST /api/expenses
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "amount": 100.00,
  "currency_code": "USD",
  "category": "travel",
  "description": "Flight tickets to New York",
  "expense_date": "2026-03-25",
  "merchant_name": "United Airlines"
}
```

**Success Response (201):**
```json
{
  "expense": {
    "id": "uuid",
    "employee_id": "uuid",
    "company_id": "uuid",
    
    "original_amount": 100.00,
    "original_currency": "USD",
    
    "converted_amount": 8325.00,
    "company_currency": "INR",
    "exchange_rate_used": 83.25,
    "conversion_timestamp": "2026-03-29T11:30:00Z",
    
    "category": "travel",
    "description": "Flight tickets to New York",
    "status": "pending",
    
    "display": {
      "original": "$100.00 USD",
      "converted": "₹8,325.00 INR",
      "exchange_rate": 83.25,
      "same_currency": false
    }
  },
  "message": "Expense submitted successfully"
}
```

**Error Response (503 - API Down):**
```json
{
  "error": "Currency conversion service is temporarily unavailable. Please try again later or submit in your company's base currency.",
  "details": "Exchange rate API error: 503 Service Unavailable"
}
```

**Error Response (400 - Validation):**
```json
{
  "error": "Amount, category, and description are required"
}
```

### 5. Get My Expenses
```http
GET /api/expenses/my-expenses?status=pending&limit=50&offset=0
Authorization: Bearer {token}
```

**Response:**
```json
{
  "expenses": [
    {
      "id": "uuid",
      "original_amount": 100.00,
      "original_currency": "USD",
      "converted_amount": 8325.00,
      "company_currency": "INR",
      "exchange_rate_used": 83.25,
      "category": "travel",
      "description": "Flight tickets",
      "status": "pending",
      "expense_date": "2026-03-25",
      "created_at": "2026-03-29T11:30:00Z",
      "current_approver": {
        "email": "manager@company.com",
        "name": "manager",
        "job_title": "Engineering Manager",
        "step": 1
      }
    }
  ]
}
```

### 6. Get Team Expenses (Manager View)
```http
GET /api/expenses/team?status=pending
Authorization: Bearer {token}
```

**Response:**
```json
{
  "expenses": [
    {
      "id": "uuid",
      "converted_amount": 8325.00,     // Only converted shown
      "company_currency": "INR",
      "category": "travel",
      "description": "Flight tickets",
      "status": "pending",
      "employee_name": "john",
      "employee_email": "john@company.com",
      "employee_job_title": "Software Engineer"
    }
  ],
  "team_members": [
    {
      "id": "uuid",
      "email": "john@company.com",
      "job_title": "Software Engineer"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Authentication Flow

### 7. Signup with Currency Selection
```http
POST /api/auth/signup
Content-Type: application/json
```

**Request (via Supabase Auth):**
```javascript
supabase.auth.signUp({
  email: "admin@company.com",
  password: "SecurePass123!",
  options: {
    data: {
      role: "admin",
      full_name: "John Doe",
      organization_name: "Acme Corporation",
      country: "India",              // NEW
      currency_code: "INR",          // NEW
      currency_symbol: "₹"           // NEW
    }
  }
})
```

**Backend Processing:**
- Creates company with `currency_code`, `currency_symbol`, `country`
- Creates admin profile
- Links profile to company
- **Currency is PERMANENT** - cannot be changed

---

## Frontend Integration Examples

### Fetch Currencies for Dropdown
```javascript
import { expenseApi } from '../lib/api';

const [currencies, setCurrencies] = useState([]);

const loadCurrencies = async () => {
  const data = await expenseApi.getCurrencies();
  setCurrencies(data.currencies);
};
```

### Live Conversion Preview
```javascript
const [conversionPreview, setConversionPreview] = useState(null);

const fetchConversion = async (amount, fromCurrency, toCurrency) => {
  const result = await expenseApi.getConversion(fromCurrency, toCurrency, amount);
  setConversionPreview({
    originalAmount: amount,
    convertedAmount: result.converted_amount,
    rate: result.rate,
    fromSymbol: result.from_symbol,
    toSymbol: result.to_symbol
  });
};

// Usage
useEffect(() => {
  if (amount && currencyCode !== companyCurrency) {
    fetchConversion(amount, currencyCode, companyCurrency);
  }
}, [amount, currencyCode]);
```

### Submit Expense with Currency
```javascript
const submitExpense = async (formData) => {
  try {
    const response = await expenseApi.create({
      amount: parseFloat(formData.amount),
      currency_code: formData.currency_code,
      category: formData.category,
      description: formData.description,
      expense_date: formData.expense_date,
      merchant_name: formData.merchant_name
    });
    
    console.log('Expense created:', response.expense);
    console.log('Conversion:', response.expense.display);
  } catch (error) {
    if (error.message.includes('temporarily unavailable')) {
      // Handle API down error
      alert('Currency service is down. Please submit in company base currency.');
    }
  }
};
```

---

## Error Handling

### Exchange Rate API Failures
**HTTP 503**: Service temporarily unavailable
- **Cause**: exchangerate-api.com is down or rate limit exceeded
- **Action**: Reject submission, ask user to retry or use base currency

### Invalid Currency Codes
**HTTP 400**: Bad request
- **Cause**: Invalid currency code (not in supported list)
- **Action**: Show error, default to company base currency

### Missing Company Currency
**HTTP 500**: Internal server error
- **Cause**: Company has no currency_code set
- **Action**: Falls back to 'INR', logs error for admin review

---

## Rate Limiting

### exchangerate-api.com (Free Tier)
- **Limit**: 1,500 requests/month
- **Cache**: 1 hour per currency pair
- **Calculation**: ~50 requests/day safe usage
- **Upgrade**: $9.99/month for 100,000 requests

### Optimization Tips
1. Cache exchange rates (1 hour)
2. Batch requests during low-traffic hours
3. Default to company currency to reduce conversions
4. Monitor API usage in dashboard

---

## Testing Endpoints

### Test Currency Conversion
```bash
# Get conversion rate
curl -X GET "http://localhost:3000/api/expenses/convert?from=USD&to=INR&amount=100" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: {"from":"USD","to":"INR","rate":83.25,"converted_amount":8325.00}
```

### Test Currency List
```bash
curl -X GET "http://localhost:3000/api/expenses/currencies" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: {"currencies":[{"code":"INR","name":"Indian Rupee","symbol":"₹"},...]}
```

### Test Expense Submission
```bash
curl -X POST "http://localhost:3000/api/expenses" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency_code": "USD",
    "category": "travel",
    "description": "Test expense",
    "expense_date": "2026-03-29"
  }'

# Expected: 201 Created with expense object including conversion data
```

---

## Database Queries

### Check Conversion Data
```sql
SELECT 
  id,
  original_amount,
  original_currency,
  converted_amount,
  company_currency,
  exchange_rate_used,
  conversion_timestamp
FROM expenses
WHERE original_currency != company_currency
ORDER BY created_at DESC
LIMIT 10;
```

### Verify Company Currency
```sql
SELECT 
  id,
  name,
  country,
  currency_code,
  currency_symbol
FROM companies;
```

### Audit Exchange Rates Used
```sql
SELECT 
  original_currency,
  company_currency,
  AVG(exchange_rate_used) as avg_rate,
  MIN(exchange_rate_used) as min_rate,
  MAX(exchange_rate_used) as max_rate,
  COUNT(*) as conversion_count
FROM expenses
WHERE original_currency != company_currency
GROUP BY original_currency, company_currency;
```

---

**Last Updated**: 2026-03-29  
**Version**: 1.0.0
