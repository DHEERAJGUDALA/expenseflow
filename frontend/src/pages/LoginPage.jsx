import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage, validateEmail } from "../lib/auth";
import { AuthShell } from "../components/AuthShell";
import { Mail, Lock, ArrowRight, AlertCircle, Loader2 } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const [formState, setFormState] = useState({
    email: "",
    password: ""
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = searchParams.get("redirectTo") || "/app";

  function handleChange(event) {
    const { name, value } = event.target;
    setFormState((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!validateEmail(formState.email.trim())) {
      setFormError("Enter a valid work email address.");
      return;
    }

    if (!formState.password) {
      setFormError("Enter your password.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await signIn(formState);

    setIsSubmitting(false);

    if (error) {
      setFormError(getAuthErrorMessage(error));
      return;
    }

    navigate(redirectTo, { replace: true });
  }

  const highlights = [
    { title: "Instant Approvals", body: "Multi-level workflow automation" },
    { title: "Smart Scanning", body: "AI-powered OCR technology" },
    { title: "Rich Analytics", body: "Track spending insights" },
    { title: "Fast Reimbursements", body: "Expedite payment cycles" }
  ];

  return (
    <AuthShell
      eyebrow="Welcome Back"
      title="Sign in to your account"
      description="Manage your expenses, track approvals, and gain insights into team spending with ReimburseMe."
      highlights={highlights}
    >
      <div className="w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-heading)" }}>Log in</h2>
          <p className="text-sm mt-2 text-slate-500">Enter your credentials to access your account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label className="label">Work Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail size={18} />
              </div>
              <input
                autoComplete="email"
                name="email"
                onChange={handleChange}
                placeholder="you@company.com"
                type="email"
                value={formState.email}
                className={`input pl-10 ${formError ? 'input-error' : ''}`}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={18} />
              </div>
              <input
                autoComplete="current-password"
                name="password"
                onChange={handleChange}
                placeholder="••••••••"
                type="password"
                value={formState.password}
                className={`input pl-10 ${formError ? 'input-error' : ''}`}
              />
            </div>
          </div>

          {formError && (
            <div className="alert alert-danger">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary w-full h-11 mt-2 text-base"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>Sign in <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-600">
          Don't have an account?{" "}
          <Link to="/signup" className="font-semibold" style={{ color: "var(--accent)" }}>
            Create an organization
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-slate-400">
          By signing in, you agree to our <a href="#" className="underline">Terms</a> and <a href="#" className="underline">Privacy</a>.
        </p>
      </div>
    </AuthShell>
  );
}
