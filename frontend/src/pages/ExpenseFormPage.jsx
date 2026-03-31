import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "../components/DashboardLayout";
import ApprovalLifecycleVisualizer from "../components/ApprovalLifecycleVisualizer";
import { expenseApi, ocrApi, companyApi, approvalPreviewApi } from "../lib/api";
import {
  UploadCloud, Scan, CheckCircle2, AlertCircle, Loader2, DollarSign,
  Calendar, Building, AlignLeft, ArrowRight, Camera, FileText, Image as ImageIcon
} from "lucide-react";

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

const DEFAULT_CURRENCIES = [
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" }
];

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [currencies, setCurrencies] = useState(DEFAULT_CURRENCIES);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [companyCurrency, setCompanyCurrency] = useState({ code: "INR", symbol: "₹", name: "Indian Rupee" });

  const [formData, setFormData] = useState({
    amount: "", currency_code: "INR", category: "", description: "",
    expense_date: new Date().toISOString().split("T")[0], merchant_name: ""
  });

  const [conversionPreview, setConversionPreview] = useState(null);
  const [loadingConversion, setLoadingConversion] = useState(false);
  const [conversionError, setConversionError] = useState(null);

  const [approvalPreview, setApprovalPreview] = useState(null);
  const [loadingApprovalPreview, setLoadingApprovalPreview] = useState(false);
  const [approvalPreviewError, setApprovalPreviewError] = useState(null);

  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const catData = await expenseApi.getCategories();
        if (catData.categories?.length > 0) {
          setCategories(catData.categories.map(cat => ({
            value: typeof cat === 'string' ? cat.toLowerCase().replace(/\s+/g, "_") : cat.value,
            label: typeof cat === 'string' ? cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ") : cat.label
          })));
        }
      } catch (err) { console.error("Categories fallback"); } finally { setLoadingCategories(false); }

      try {
        const currData = await expenseApi.getCurrencies();
        if (currData.currencies?.length > 0) setCurrencies(currData.currencies);
      } catch (err) { console.error("Currencies fallback"); } finally { setLoadingCurrencies(false); }

      try {
        const compData = await companyApi.getMyCompany();
        if (compData.company) {
          const cc = {
            code: compData.company.currency_code || "INR",
            symbol: compData.company.currency_symbol || "₹",
            name: "Company Base"
          };
          setCompanyCurrency(cc);
          setFormData(prev => ({ ...prev, currency_code: cc.code }));
        }
      } catch (err) {}
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    const fetchConversion = async () => {
      const amount = parseFloat(formData.amount);
      if (!amount || amount <= 0 || formData.currency_code === companyCurrency.code) {
        setConversionPreview(null); return;
      }
      setLoadingConversion(true); setConversionError(null);
      try {
        const res = await expenseApi.getConversion(formData.currency_code, companyCurrency.code, amount);
        setConversionPreview({ ...res, originalCurrency: formData.currency_code, convertedCurrency: companyCurrency.code });
      } catch (err) {
        setConversionError("Unable to fetch conversion rate."); setConversionPreview(null);
      } finally { setLoadingConversion(false); }
    };
    const tid = setTimeout(fetchConversion, 500);
    return () => clearTimeout(tid);
  }, [formData.amount, formData.currency_code, companyCurrency.code]);

  useEffect(() => {
    const fetchApprovalPreview = async () => {
      const amount = parseFloat(formData.amount);
      if (!amount || amount <= 0 || !formData.category) { setApprovalPreview(null); return; }
      setLoadingApprovalPreview(true); setApprovalPreviewError(null);
      try {
        const prev = await approvalPreviewApi.getPreview(amount, formData.category);
        setApprovalPreview(prev);
      } catch (err) {
        setApprovalPreviewError(err.message || "Unable to load approval preview"); setApprovalPreview(null);
      } finally { setLoadingApprovalPreview(false); }
    };
    const tid = setTimeout(fetchApprovalPreview, 700);
    return () => clearTimeout(tid);
  }, [formData.amount, formData.category]);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please select an image file");
    if (file.size > 10 * 1024 * 1024) return setError("File size max 10MB");

    setError(null); setReceiptImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleScanReceipt = async () => {
    if (!receiptPreview) return;
    setIsScanning(true); setError(null);
    try {
      const result = await ocrApi.scan(receiptPreview);
      if (result.success && result.data) {
        setOcrResult(result.data); setReceiptUrl(receiptPreview);
        setFormData(prev => ({
          ...prev,
          amount: result.data.amount?.toString() || prev.amount,
          currency_code: result.data.currency || prev.currency_code,
          category: result.data.category || prev.category,
          description: result.data.description || prev.description,
          expense_date: result.data.date || prev.expense_date,
          merchant_name: result.data.merchant_name || prev.merchant_name
        }));
        setSuccess("Receipt scanned! Fields auto-filled.");
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (err) { setError("Failed to scan receipt: " + err.message); }
    finally { setIsScanning(false); }
  };

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true); setError(null);
    try {
      if (!formData.amount || parseFloat(formData.amount) <= 0) throw new Error("Enter a valid amount");
      if (!formData.category) throw new Error("Select a category");

      await expenseApi.create({ ...formData, amount: parseFloat(formData.amount), receipt_url: receiptUrl, ocr_raw_text: ocrResult?.raw_text });
      setSuccess("Expense submitted successfully!");
      setTimeout(() => navigate("/app/expenses"), 1500);
    } catch (err) { setError(err.message); }
    finally { setIsSubmitting(false); }
  };

  const clearReceipt = () => {
    setReceiptImage(null); setReceiptPreview(null); setOcrResult(null); setReceiptUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <motion.div {...fadeIn(0)} className="page-header">
          <h1 className="page-title">Submit Expense</h1>
          <p className="page-subtitle">Upload a receipt for auto-fill or enter details manually</p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-danger mb-6">
              <AlertCircle size={16} /> <span>{error}</span>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-success mt-4 mb-6">
              <CheckCircle2 size={16} /> <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 items-start">
          {/* Left: Scanner */}
          <motion.div {...fadeIn(0.1)} className="card p-6 sticky top-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Camera size={16} /> Receipt Scanner
              <span className="badge badge-accent ml-auto" style={{ fontSize: "10px" }}>AI Powered</span>
            </h2>

            {!receiptPreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors group"
                style={{ borderColor: "var(--border-light)" }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-subtle)"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.background = "transparent"; }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                  <ImageIcon size={24} />
                </div>
                <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>Click to upload receipt</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>PNG, JPG up to 10MB</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative group rounded-xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}>
                  <img src={receiptPreview} alt="Receipt preview" className="w-full h-64 object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={clearReceipt} className="btn btn-danger btn-sm">Remove Image</button>
                  </div>
                </div>

                <button
                  onClick={handleScanReceipt} disabled={isScanning}
                  className="btn btn-primary w-full h-11"
                >
                  {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Scan size={18} />}
                  {isScanning ? "Scanning..." : "Scan & Auto-Fill"}
                </button>

                {ocrResult && (
                  <div className="alert alert-success p-3 rounded-lg text-xs" style={{ alignItems: "flex-start" }}>
                    <CheckCircle2 size={14} className="mt-0.5" />
                    <div>
                      <p className="font-semibold mb-0.5">OCR Complete</p>
                      <p className="opacity-80">Confidence: {Math.round(ocrResult.confidence)}%</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </motion.div>

          {/* Right: Form */}
          <motion.div {...fadeIn(0.2)} className="card p-6 md:p-8">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-6 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <FileText size={16} /> Expense Details
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Amount *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><DollarSign size={16} /></div>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" min="0" placeholder="0.00" className="input pl-9" required />
                  </div>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select name="currency_code" value={formData.currency_code} onChange={handleChange} disabled={loadingCurrencies} className="input px-3">
                    {currencies.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
                  </select>
                </div>
              </div>

              {conversionPreview && formData.amount && (
                <div className="alert bg-slate-50 border-slate-200">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-slate-600">Live Conversion</span>
                      {loadingConversion && <Loader2 size={12} className="animate-spin text-slate-400" />}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-bold">{conversionPreview.fromSymbol}{conversionPreview.originalAmount.toFixed(2)}</span>
                      <ArrowRight size={14} className="text-slate-400" />
                      <span className="font-bold text-indigo-600">{conversionPreview.toSymbol}{conversionPreview.convertedAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Category *</label>
                <select name="category" value={formData.category} onChange={handleChange} className="input px-3" required disabled={loadingCategories}>
                  <option value="">{loadingCategories ? "Loading..." : "Select category"}</option>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Expense Date *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Calendar size={16} /></div>
                    <input type="date" name="expense_date" value={formData.expense_date} onChange={handleChange} className="input pl-9" required />
                  </div>
                </div>
                <div>
                  <label className="label">Merchant</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Building size={16} /></div>
                    <input type="text" name="merchant_name" value={formData.merchant_name} onChange={handleChange} placeholder="e.g. Uber" className="input pl-9" />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <div className="relative">
                  <div className="absolute top-3.5 left-0 pl-3.5 pointer-events-none text-slate-400"><AlignLeft size={16} /></div>
                  <textarea name="description" value={formData.description} onChange={handleChange} rows={3} placeholder="Brief description..." className="input pl-9 py-3 resize-none" />
                </div>
              </div>

              {formData.amount && formData.category && (
                <div className="pt-2">
                  <ApprovalLifecycleVisualizer preview={approvalPreview} loading={loadingApprovalPreview} error={approvalPreviewError} />
                </div>
              )}

              <div className="pt-2">
                <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full h-11 text-base shadow-lg shadow-indigo-500/20">
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : "Submit Expense"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
