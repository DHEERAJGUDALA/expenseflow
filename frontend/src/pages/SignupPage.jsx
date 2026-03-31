import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getAuthErrorMessage,
  validateEmail,
  validatePassword
} from "../lib/auth";

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

  // Countries data
  const [countries, setCountries] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countrySearch, setCountrySearch] = useState("");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const passwordChecks = validatePassword(formState.password);

  // Fetch countries on mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,currencies"
        );
        if (!response.ok) throw new Error("Failed to fetch countries");
        
        const data = await response.json();
        
        // Transform and sort countries
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
        
        // Default to India
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
        // Fallback to default
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

  // Filter countries based on search
  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  // Handle country selection
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

    setFormState((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  function nextStep() {
    if (currentStep === 1) {
      if (!formState.fullName.trim()) {
        setFormError("Enter your full name.");
        return;
      }
      if (!formState.organizationName.trim()) {
        setFormError("Enter your organization name.");
        return;
      }
      if (!formState.country) {
        setFormError("Select your country.");
        return;
      }
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

    if (!validateEmail(formState.email.trim())) {
      setFormError("Enter a valid work email address.");
      return;
    }

    if (!passwordChecks.isValid) {
      setFormError("Choose a stronger password that satisfies every requirement.");
      return;
    }

    if (formState.password !== formState.confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    if (!formState.acceptTerms) {
      setFormError("You must accept the terms before continuing.");
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await signUp(formState);

    setIsSubmitting(false);

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    if (data.session) {
      navigate("/app", { replace: true });
      return;
    }

    setFormSuccess(
      "Your admin account has been created. Check your email to verify the account before logging in."
    );
    setFormState(initialForm);
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Create your account</h1>
            <p className="text-slate-500">Start managing expenses smarter. Free 14-day trial.</p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-3 mb-8">
            <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${currentStep >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {currentStep > 1 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : '1'}
              </div>
              <span className="text-sm font-medium hidden sm:block">Organization</span>
            </div>
            <div className={`flex-1 h-1 rounded ${currentStep > 1 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
            <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${currentStep >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                2
              </div>
              <span className="text-sm font-medium hidden sm:block">Account</span>
            </div>
          </div>

          {/* Success Message */}
          {formSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-green-800">Account created!</h3>
                  <p className="text-sm text-green-700 mt-1">{formSuccess}</p>
                  <Link to="/login" className="inline-block mt-3 text-sm font-semibold text-green-700 hover:text-green-800">
                    Go to login →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Step 1: Organization Details */}
            {currentStep === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Your full name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <input
                      autoComplete="name"
                      name="fullName"
                      onChange={handleChange}
                      placeholder="John Doe"
                      type="text"
                      value={formState.fullName}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Organization name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <input
                      autoComplete="organization"
                      name="organizationName"
                      onChange={handleChange}
                      placeholder="Acme Corporation"
                      type="text"
                      value={formState.organizationName}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Country Selector */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Country
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder={loadingCountries ? "Loading countries..." : "Search and select country"}
                      value={showCountryDropdown ? countrySearch : formState.country}
                      onChange={(e) => {
                        setCountrySearch(e.target.value);
                        setShowCountryDropdown(true);
                      }}
                      onFocus={() => setShowCountryDropdown(true)}
                      disabled={loadingCountries}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                    {/* Dropdown */}
                    {showCountryDropdown && !loadingCountries && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                        {filteredCountries.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-500">
                            No countries found
                          </div>
                        ) : (
                          filteredCountries.slice(0, 50).map((country) => (
                            <button
                              key={country.name}
                              type="button"
                              onClick={() => handleCountrySelect(country)}
                              className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex items-center justify-between transition-colors"
                            >
                              <span className="text-slate-900">{country.name}</span>
                              <span className="text-sm text-slate-500">
                                {country.currencySymbol} {country.currencyCode}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {/* Close dropdown when clicking outside */}
                  {showCountryDropdown && (
                    <div
                      className="fixed inset-0 z-0"
                      onClick={() => setShowCountryDropdown(false)}
                    />
                  )}
                </div>

                {/* Currency Display (Auto-selected based on country) */}
                {formState.country && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-indigo-900">Base Currency</p>
                        <p className="text-xs text-indigo-600 mt-1">
                          Auto-selected based on your country. This cannot be changed later.
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-indigo-700">
                          {formState.currencySymbol}
                        </span>
                        <span className="ml-2 text-sm font-medium text-indigo-600">
                          {formState.currencyCode}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {formError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{formError}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={nextStep}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200"
                >
                  Continue
                </button>
              </div>
            )}

            {/* Step 2: Account Details */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Work email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>
                    <input
                      autoComplete="email"
                      name="email"
                      onChange={handleChange}
                      placeholder="admin@company.com"
                      type="email"
                      value={formState.email}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      autoComplete="new-password"
                      name="password"
                      onChange={handleChange}
                      placeholder="Create a strong password"
                      type="password"
                      value={formState.password}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Password Requirements */}
                <div className="grid grid-cols-2 gap-2">
                  {passwordChecks.requirements.map((requirement) => (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                        requirement.valid
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}
                      key={requirement.label}
                    >
                      {requirement.valid ? (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>
                      )}
                      {requirement.label}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Confirm password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      autoComplete="new-password"
                      name="confirmPassword"
                      onChange={handleChange}
                      placeholder="Re-enter your password"
                      type="password"
                      value={formState.confirmPassword}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
                    />
                  </div>
                  {formState.confirmPassword && formState.password !== formState.confirmPassword && (
                    <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Passwords don't match
                    </p>
                  )}
                  {formState.confirmPassword && formState.password === formState.confirmPassword && (
                    <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Passwords match
                    </p>
                  )}
                </div>

                {/* Terms Checkbox */}
                <label className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                  <input
                    checked={formState.acceptTerms}
                    name="acceptTerms"
                    onChange={handleChange}
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-600">
                    I agree to the{" "}
                    <a href="#" className="text-indigo-600 hover:underline font-medium">Terms of Service</a>
                    {" "}and{" "}
                    <a href="#" className="text-indigo-600 hover:underline font-medium">Privacy Policy</a>
                  </span>
                </label>

                {/* Error Message */}
                {formError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{formError}</p>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 transition-all"
                  >
                    Back
                  </button>
                  <button
                    disabled={isSubmitting}
                    type="submit"
                    className="flex-[2] py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating account...
                      </span>
                    ) : (
                      "Create account"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Login Link */}
          <p className="mt-8 text-center text-slate-600">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute top-20 right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <h2 className="text-4xl font-bold mb-6">
            Join thousands of teams managing expenses smarter
          </h2>
          <p className="text-xl text-white/80 mb-12">
            Streamline approvals, automate workflows, and get real-time insights into your organization's spending.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-12">
            <div className="text-center">
              <div className="text-4xl font-bold mb-1">500+</div>
              <div className="text-white/70 text-sm">Companies</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-1">50K+</div>
              <div className="text-white/70 text-sm">Expenses/month</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-1">99.9%</div>
              <div className="text-white/70 text-sm">Uptime</div>
            </div>
          </div>

          {/* Logos */}
          <div>
            <p className="text-white/60 text-sm mb-4">Trusted by teams at</p>
            <div className="flex items-center gap-8 opacity-70">
              <div className="text-2xl font-bold tracking-tight">Stripe</div>
              <div className="text-2xl font-bold tracking-tight">Notion</div>
              <div className="text-2xl font-bold tracking-tight">Vercel</div>
            </div>
          </div>

          {/* Floating Cards */}
          <div className="absolute bottom-32 right-16">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-4 transform rotate-3 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-400 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium">Expense Approved</div>
                  <div className="text-xs text-white/60">$1,250.00 - Travel</div>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 transform -rotate-2 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-400 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium">Receipt Scanned</div>
                  <div className="text-xs text-white/60">AI extracted $89.50</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
