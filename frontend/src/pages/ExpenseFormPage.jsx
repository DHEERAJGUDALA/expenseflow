import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { expenseApi, ocrApi } from "../lib/api";

const CATEGORIES = [
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

const CURRENCIES = [
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
  { value: "INR", label: "INR (₹)", symbol: "₹" },
  { value: "JPY", label: "JPY (¥)", symbol: "¥" }
];

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    amount: "",
    currency_code: "USD",
    category: "",
    description: "",
    expense_date: new Date().toISOString().split("T")[0],
    merchant_name: ""
  });

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
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

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
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
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
