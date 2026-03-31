import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import ApprovalLifecycleVisualizer from "../components/ApprovalLifecycleVisualizer";
import { expenseApi, ocrApi, companyApi, approvalPreviewApi } from "../lib/api";

// Fallback categories if API fails
const DEFAULT_CATEGORIES = [
  { value: "meals", label: "Meals & Food" },
  { value: "travel", label: "Travel" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "entertainment", label: "Entertainment" },
  { value: "communication", label: "Communication" },
  { value: "software", label: "Software & Subscriptions" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" }
];

// Fallback currencies if API fails
const DEFAULT_CURRENCIES = [
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" }
];

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Categories from API
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Currencies from API
  const [currencies, setCurrencies] = useState(DEFAULT_CURRENCIES);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);

  // Company currency (base currency for conversion)
  const [companyCurrency, setCompanyCurrency] = useState({
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee"
  });

  // Form state
  const [formData, setFormData] = useState({
    amount: "",
    currency_code: "INR",  // Will be updated to company currency
    category: "",
    description: "",
    expense_date: new Date().toISOString().split("T")[0],
    merchant_name: ""
  });

  // Live preview state
  const [conversionPreview, setConversionPreview] = useState(null);
  const [loadingConversion, setLoadingConversion] = useState(false);
  const [conversionError, setConversionError] = useState(null);

  // Approval preview state
  const [approvalPreview, setApprovalPreview] = useState(null);
  const [loadingApprovalPreview, setLoadingApprovalPreview] = useState(false);
  const [approvalPreviewError, setApprovalPreviewError] = useState(null);

  // OCR state
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState(null);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch categories, currencies, and company info on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      // Fetch categories
      try {
        const catData = await expenseApi.getCategories();
        if (catData.categories && catData.categories.length > 0) {
          const apiCategories = catData.categories.map(cat => ({
            value: typeof cat === 'string' ? cat.toLowerCase().replace(/\s+/g, "_") : cat.value,
            label: typeof cat === 'string' ? cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ") : cat.label
          }));
          setCategories(apiCategories);
        }
      } catch (err) {
        console.error("Failed to fetch categories, using defaults:", err);
      } finally {
        setLoadingCategories(false);
      }

      // Fetch currencies
      try {
        const currData = await expenseApi.getCurrencies();
        if (currData.currencies && currData.currencies.length > 0) {
          setCurrencies(currData.currencies);
        }
      } catch (err) {
        console.error("Failed to fetch currencies, using defaults:", err);
      } finally {
        setLoadingCurrencies(false);
      }

      // Fetch company info to get base currency
      try {
        const companyData = await companyApi.getMyCompany();
        if (companyData.company) {
          const cc = {
            code: companyData.company.currency_code || companyData.company.currency || "INR",
            symbol: companyData.company.currency_symbol || "₹",
            name: "Company Base Currency"
          };
          setCompanyCurrency(cc);
          // Default expense currency to company currency
          setFormData(prev => ({ ...prev, currency_code: cc.code }));
        }
      } catch (err) {
        console.error("Failed to fetch company info:", err);
      }
    };

    fetchInitialData();
  }, []);

  // Live conversion preview when amount or currency changes
  useEffect(() => {
    const fetchConversion = async () => {
      const amount = parseFloat(formData.amount);
      if (!amount || amount <= 0) {
        setConversionPreview(null);
        return;
      }

      // Same currency - no conversion needed
      if (formData.currency_code === companyCurrency.code) {
        setConversionPreview(null);
        return;
      }

      setLoadingConversion(true);
      setConversionError(null);

      try {
        const result = await expenseApi.getConversion(
          formData.currency_code,
          companyCurrency.code,
          amount
        );
        setConversionPreview({
          originalAmount: amount,
          originalCurrency: formData.currency_code,
          convertedAmount: result.converted_amount,
          convertedCurrency: companyCurrency.code,
          rate: result.rate,
          fromSymbol: result.from_symbol,
          toSymbol: result.to_symbol || companyCurrency.symbol
        });
      } catch (err) {
        console.error("Conversion preview failed:", err);
        setConversionError("Unable to fetch conversion rate. Please try again.");
        setConversionPreview(null);
      } finally {
        setLoadingConversion(false);
      }
    };

    // Debounce the conversion fetch
    const timeoutId = setTimeout(fetchConversion, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.amount, formData.currency_code, companyCurrency.code]);

  // Fetch approval preview when amount or category changes
  useEffect(() => {
    const fetchApprovalPreview = async () => {
      const amount = parseFloat(formData.amount);
      
      // Need both amount and category for accurate preview
      if (!amount || amount <= 0 || !formData.category) {
        setApprovalPreview(null);
        return;
      }

      setLoadingApprovalPreview(true);
      setApprovalPreviewError(null);

      try {
        const preview = await approvalPreviewApi.getPreview(amount, formData.category);
        setApprovalPreview(preview);
      } catch (err) {
        console.error("Approval preview failed:", err);
        setApprovalPreviewError(err.message || "Unable to load approval preview");
        setApprovalPreview(null);
      } finally {
        setLoadingApprovalPreview(false);
      }
    };

    // Debounce the approval preview fetch
    const timeoutId = setTimeout(fetchApprovalPreview, 700);
    return () => clearTimeout(timeoutId);
  }, [formData.amount, formData.category]);

  // Get currency symbol for display
  const getCurrencySymbol = (code) => {
    const currency = currencies.find(c => c.code === code);
    return currency?.symbol || code;
  };

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setError(null);
    setReceiptImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setReceiptPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Scan receipt with OCR
  const handleScanReceipt = async () => {
    if (!receiptPreview) return;

    setIsScanning(true);
    setError(null);

    try {
      // Scan receipt (without storage upload)
      const result = await ocrApi.scan(receiptPreview);

      if (result.success && result.data) {
        setOcrResult(result.data);
        // Store base64 image for later submission
        setReceiptUrl(receiptPreview);

        // Auto-fill form with OCR results
        setFormData(prev => ({
          ...prev,
          amount: result.data.amount?.toString() || prev.amount,
          currency_code: result.data.currency || prev.currency_code,
          category: result.data.category || prev.category,
          description: result.data.description || prev.description,
          expense_date: result.data.date || prev.expense_date,
          merchant_name: result.data.merchant_name || prev.merchant_name
        }));

        setSuccess("Receipt scanned successfully! Fields auto-filled.");
      }
    } catch (err) {
      setError("Failed to scan receipt: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Submit expense
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        throw new Error("Please enter a valid amount");
      }
      if (!formData.category) {
        throw new Error("Please select a category");
      }

      const expenseData = {
        amount: parseFloat(formData.amount),
        currency_code: formData.currency_code,
        category: formData.category,
        description: formData.description,
        expense_date: formData.expense_date,
        merchant_name: formData.merchant_name,
        receipt_url: receiptUrl,
        ocr_raw_text: ocrResult?.raw_text,
        line_items: ocrResult?.line_items
      };

      await expenseApi.create(expenseData);
      setSuccess("Expense submitted successfully!");
      
      // Redirect after short delay
      setTimeout(() => {
        navigate("/app/expenses");
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear receipt
  const handleClearReceipt = () => {
    setReceiptImage(null);
    setReceiptPreview(null);
    setOcrResult(null);
    setReceiptUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Submit Expense</h1>
          <p className="text-slate-600">Upload a receipt for auto-fill or enter details manually</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receipt Upload Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              📷 Receipt Scanner (OCR)
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                AI Powered
              </span>
            </h2>

            {!receiptPreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
              >
                <div className="text-4xl mb-2">📤</div>
                <p className="text-slate-600 mb-2">Click to upload receipt</p>
                <p className="text-xs text-slate-400">PNG, JPG up to 10MB</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={receiptPreview}
                    alt="Receipt preview"
                    className="w-full h-64 object-contain bg-slate-100 rounded-lg"
                  />
                  <button
                    onClick={handleClearReceipt}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>

                <button
                  onClick={handleScanReceipt}
                  disabled={isScanning}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center gap-2"
                >
                  {isScanning ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Scanning Receipt...
                    </>
                  ) : (
                    <>
                      🔍 Scan & Auto-Fill
                    </>
                  )}
                </button>

                {ocrResult && (
                  <div className="p-3 bg-green-50 rounded-lg text-sm">
                    <p className="font-medium text-green-700 mb-1">✅ OCR Complete</p>
                    <p className="text-green-600">
                      Confidence: {Math.round(ocrResult.confidence)}%
                    </p>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* OCR Raw Text Preview */}
            {ocrResult?.raw_text && (
              <details className="mt-4">
                <summary className="text-sm text-slate-500 cursor-pointer">
                  View extracted text
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 rounded-lg text-xs overflow-auto max-h-40">
                  {ocrResult.raw_text}
                </pre>
              </details>
            )}
          </div>

          {/* Expense Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">📝 Expense Details</h2>

            <div className="space-y-4">
              {/* Amount and Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Currency
                  </label>
                  <select
                    name="currency_code"
                    value={formData.currency_code}
                    onChange={handleInputChange}
                    disabled={loadingCurrencies}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                  {formData.currency_code === companyCurrency.code && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Company base currency (no conversion needed)
                    </p>
                  )}
                </div>
              </div>

              {/* Live Conversion Preview */}
              {conversionPreview && formData.amount && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-900">
                      Live Conversion Preview
                    </span>
                    {loadingConversion && (
                      <span className="text-xs text-blue-600 animate-pulse">Updating...</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-lg">
                    <div className="text-blue-700">
                      <span className="font-bold">
                        {conversionPreview.fromSymbol}{conversionPreview.originalAmount.toFixed(2)}
                      </span>
                      <span className="text-sm ml-1">{conversionPreview.originalCurrency}</span>
                    </div>
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <div className="text-blue-900">
                      <span className="font-bold">
                        {conversionPreview.toSymbol}{conversionPreview.convertedAmount.toFixed(2)}
                      </span>
                      <span className="text-sm ml-1">{conversionPreview.convertedCurrency}</span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    Exchange Rate: 1 {conversionPreview.originalCurrency} = {conversionPreview.rate.toFixed(4)} {conversionPreview.convertedCurrency}
                  </p>
                </div>
              )}

              {/* Conversion Error */}
              {conversionError && formData.amount && formData.currency_code !== companyCurrency.code && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  ⚠️ {conversionError}
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                  disabled={loadingCategories}
                >
                  <option value="">
                    {loadingCategories ? "Loading categories..." : "Select category"}
                  </option>
                  {categories.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {!loadingCategories && categories.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Categories based on your company's approval rules
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expense Date *
                </label>
                <input
                  type="date"
                  name="expense_date"
                  value={formData.expense_date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Merchant */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Merchant/Vendor
                </label>
                <input
                  type="text"
                  name="merchant_name"
                  value={formData.merchant_name}
                  onChange={handleInputChange}
                  placeholder="e.g., Starbucks, Uber, Amazon"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Brief description of the expense..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Line Items from OCR */}
              {ocrResult?.line_items?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Detected Line Items
                  </label>
                  <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                    {ocrResult.line_items.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-600">{item.description}</span>
                        <span className="font-medium">${item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval Lifecycle Preview */}
              {formData.amount && formData.category && (
                <div className="pt-4 border-t border-slate-200">
                  <ApprovalLifecycleVisualizer 
                    preview={approvalPreview}
                    loading={loadingApprovalPreview}
                    error={approvalPreviewError}
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Expense
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
