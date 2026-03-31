import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { useAuth } from "../context/AuthContext";
import {
  getAuthErrorMessage,
  validateEmail,
  validatePassword
} from "../lib/auth";

const initialForm = {
  fullName: "",
  organizationName: "",
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

  const passwordChecks = validatePassword(formState.password);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setFormState((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!formState.fullName.trim()) {
      setFormError("Enter the admin user's full name.");
      return;
    }

    if (!formState.organizationName.trim()) {
      setFormError("Enter your organization name.");
      return;
    }

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
    <div className="flex flex-row ">
      <div className="space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Create admin account
          </p>
          <h2
            className="mt-3 text-4xl leading-none text-slate-950 sm:text-5xl"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            Sign up
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-500">
            New registrations are created with the <strong>admin</strong> role in Supabase metadata.
          </p>
        </div>

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Full name</span>
              <input
                autoComplete="name"
                className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                name="fullName"
                onChange={handleChange}
                placeholder="Praveen Kumar"
                type="text"
                value={formState.fullName}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Organization name</span>
              <input
                autoComplete="organization"
                className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                name="organizationName"
                onChange={handleChange}
                placeholder="Acme Finance"
                type="text"
                value={formState.organizationName}
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Work email</span>
            <input
              autoComplete="email"
              className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              name="email"
              onChange={handleChange}
              placeholder="admin@company.com"
              type="email"
              value={formState.email}
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input
                autoComplete="new-password"
                className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                name="password"
                onChange={handleChange}
                placeholder="Create a strong password"
                type="password"
                value={formState.password}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Confirm password</span>
              <input
                autoComplete="new-password"
                className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white/80 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                name="confirmPassword"
                onChange={handleChange}
                placeholder="Re-enter your password"
                type="password"
                value={formState.confirmPassword}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {passwordChecks.requirements.map((requirement) => (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  requirement.valid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
                key={requirement.label}
              >
                {requirement.label}
              </div>
            ))}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <input
              checked={formState.acceptTerms}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              name="acceptTerms"
              onChange={handleChange}
              type="checkbox"
            />
            <span>I confirm this account is for my organization and I accept the terms.</span>
          </label>

          {formError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {formError}
            </div>
          ) : null}

          {formSuccess ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {formSuccess}
            </div>
          ) : null}

          <button
            className="inline-flex h-[52px] w-full items-center justify-center rounded-full bg-orange-600 px-6 font-semibold text-white shadow-[0_16px_36px_rgba(234,88,12,0.24)] transition hover:-translate-y-0.5 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Creating admin account..." : "Create admin account"}
          </button>
        </form>

        <p className="text-sm text-slate-500">
          Already have access?{" "}
          <Link className="font-semibold text-orange-700 transition hover:text-orange-600" to="/login">
            Return to login
          </Link>
        </p>
      </div>
    </div>
  );
}
