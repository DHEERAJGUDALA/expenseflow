import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage, validateEmail, validatePassword } from "../lib/auth";
import { AuthShell } from "../components/AuthShell";
import {
  User, Building, Globe, Mail, Lock, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Loader2
} from "lucide-react";

const initialForm = {
  fullName: "",
  organizationName: "",
  country: "",
  currencyCode: "INR",
  currencySymbol: "₹",
  email: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false
};

export function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [formState, setFormState] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [countries, setCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countrySearch, setCountrySearch] = useState("");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const passwordChecks = validatePassword(formState.password);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch("https://restcountries.com/v3.1/all?fields=name,currencies");
        if (!response.ok) throw new Error("Failed to fetch countries");
        
        const data = await response.json();
        
        const transformedCountries = data
          .filter(country => country.currencies)
          .map(country => {
            const currencyCodes = Object.keys(country.currencies);
            const primaryCurrency = currencyCodes[0];
            const currencyData = country.currencies[primaryCurrency];
            return {
              name: country.name.common,
              currencyCode: primaryCurrency,
              currencyName: currencyData?.name || primaryCurrency,
              currencySymbol: currencyData?.symbol || primaryCurrency
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setCountries(transformedCountries);
        
        const india = transformedCountries.find(c => c.name === "India");
        if (india) {
          setFormState(prev => ({
            ...prev,
            country: india.name,
            currencyCode: india.currencyCode,
            currencySymbol: india.currencySymbol
          }));
        }
      } catch (error) {
        console.error("Error fetching countries:", error);
        setFormState(prev => ({
          ...prev,
          country: "India",
          currencyCode: "INR",
          currencySymbol: "₹"
        }));
      } finally {
        setLoadingCountries(false);
      }
    };

    fetchCountries();
  }, []);

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const handleCountrySelect = (country) => {
    setFormState(prev => ({
      ...prev,
      country: country.name,
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol
    }));
    setCountrySearch("");
    setShowCountryDropdown(false);
  };

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setFormState(current => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  function nextStep() {
    if (currentStep === 1) {
      if (!formState.fullName.trim()) return setFormError("Enter your full name.");
      if (!formState.organizationName.trim()) return setFormError("Enter your organization name.");
      if (!formState.country) return setFormError("Select your country.");
      setFormError("");
      setCurrentStep(2);
    }
  }

  function prevStep() {
    setCurrentStep(1);
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!validateEmail(formState.email.trim())) return setFormError("Enter a valid work email address.");
    if (!passwordChecks.isValid) return setFormError("Choose a stronger password.");
    if (formState.password !== formState.confirmPassword) return setFormError("Passwords do not match.");
    if (!formState.acceptTerms) return setFormError("You must accept the terms before continuing.");

    setIsSubmitting(true);
    const { data, error } = await signUp(formState);
    setIsSubmitting(false);

    if (error) return setFormError(getAuthErrorMessage(error));

    if (data.session) {
      navigate("/app", { replace: true });
      return;
    }

    setFormSuccess("Your admin account has been created. Check your email to verify the account before logging in.");
    setFormState(initialForm);
    setCurrentStep(1);
  }

  const highlights = [
    { title: "Manage Expenses", body: "End-to-end receipt to reimbursement flow" },
    { title: "Custom Workflows", body: "Build dynamic approval chains" },
    { title: "Smart Scanning", body: "Extract data from receipts automatically" }
  ];

  return (
    <AuthShell
      eyebrow="Get Started"
      title="Create your organization"
      description="Join thousands of teams managing expenses smarter. Free 14-day trial."
      highlights={highlights}
    >
      <div className="w-full">
        {/* Success Message */}
        {formSuccess ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Account Created!</h3>
            <p className="text-slate-600 mb-6">{formSuccess}</p>
            <Link to="/login" className="btn btn-primary w-full max-w-xs mx-auto">
              Go to login
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-heading)" }}>
                Sign Up
              </h2>
              <div className="flex items-center justify-center gap-2 mt-3">
                <div className={`h-1.5 w-12 rounded-full ${currentStep >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                <div className={`h-1.5 w-12 rounded-full ${currentStep >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
              </div>
              <p className="text-sm mt-3 text-slate-500">
                Step {currentStep} of 2: {currentStep === 1 ? "Organization Details" : "Account Setup"}
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {currentStep === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  <div>
                    <label className="label">Your Full Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <User size={18} />
                      </div>
                      <input
                        name="fullName"
                        value={formState.fullName}
                        onChange={handleChange}
                        placeholder="John Doe"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Organization Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Building size={18} />
                      </div>
                      <input
                        name="organizationName"
                        value={formState.organizationName}
                        onChange={handleChange}
                        placeholder="Acme Corporation"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Country</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Globe size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder={loadingCountries ? "Loading..." : "Search country"}
                        value={showCountryDropdown ? countrySearch : formState.country}
                        onChange={(e) => {
                          setCountrySearch(e.target.value);
                          setShowCountryDropdown(true);
                        }}
                        onFocus={() => setShowCountryDropdown(true)}
                        disabled={loadingCountries}
                        className="input pl-10 cursor-pointer"
                      />
                      {showCountryDropdown && !loadingCountries && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                          {filteredCountries.slice(0, 50).map(country => (
                            <button
                              key={country.name}
                              type="button"
                              onClick={() => handleCountrySelect(country)}
                              className="w-full px-4 py-2.5 text-left hover:bg-slate-50 text-sm flex justify-between items-center"
                            >
                              <span className="text-slate-900">{country.name}</span>
                              <span className="text-slate-500">{country.currencySymbol}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {showCountryDropdown && (
                      <div className="fixed inset-0 z-0" onClick={() => setShowCountryDropdown(false)} />
                    )}
                  </div>

                  {formState.country && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Base Currency</p>
                        <p className="text-[11px] text-slate-500">Auto-selected from country</p>
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        <span className="text-lg font-bold text-slate-900">{formState.currencySymbol}</span>
                        <span className="text-sm font-semibold text-slate-600">{formState.currencyCode}</span>
                      </div>
                    </div>
                  )}

                  {formError && (
                    <div className="alert alert-danger">
                      <AlertCircle size={16} /><span>{formError}</span>
                    </div>
                  )}

                  <button type="button" onClick={nextStep} className="btn btn-primary w-full h-11 text-base">
                    Continue <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <label className="label">Work Email</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        value={formState.email}
                        onChange={handleChange}
                        placeholder="admin@company.com"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={18} />
                      </div>
                      <input
                        type="password"
                        name="password"
                        value={formState.password}
                        onChange={handleChange}
                        placeholder="Create a strong password"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {passwordChecks.requirements.map(req => (
                      <div key={req.label} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium ${req.valid ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-500'}`}>
                        {req.valid ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-300" />}
                        {req.label}
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="label">Confirm password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={18} />
                      </div>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={formState.confirmPassword}
                        onChange={handleChange}
                        placeholder="Re-enter your password"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 mt-4">
                    <input
                      type="checkbox"
                      name="acceptTerms"
                      checked={formState.acceptTerms}
                      onChange={handleChange}
                      className="mt-1"
                    />
                    <span className="text-xs text-slate-600">
                      I agree to the <a href="#" className="underline text-indigo-600 cursor-pointer">Terms of Service</a> and <a href="#" className="underline text-indigo-600 cursor-pointer">Privacy Policy</a>
                    </span>
                  </label>

                  {formError && (
                    <div className="alert alert-danger">
                      <AlertCircle size={16} /><span>{formError}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={prevStep} className="btn btn-secondary h-11 px-4">
                      <ArrowLeft size={18} /> Back
                    </button>
                    <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1 h-11 text-base">
                      {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : "Create Account"}
                    </button>
                  </div>
                </div>
              )}
            </form>

            <p className="mt-8 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold" style={{ color: "var(--accent)" }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
