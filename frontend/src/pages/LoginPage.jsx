import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAuthErrorMessage, validateEmail } from "../lib/auth";

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

  return (
    <div>
      <section>
        <div className="auth-card">
          <span className="auth-card__eyebrow">Welcome back</span>
          <h2>Log in</h2>
          <p className="auth-card__copy">Use your organization email and password to continue.</p>
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Email address</span>
              <input
                autoComplete="email"
                name="email"
                onChange={handleChange}
                placeholder="you@company.com"
                type="email"
                value={formState.email}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                name="password"
                onChange={handleChange}
                placeholder="Enter your password"
                type="password"
                value={formState.password}
              />
            </label>
            {formError ? <div className="message message--error">{formError}</div> : null}
            <button className="button button--primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Log in"}
            </button>
          </form>
          <p className="auth-card__footer">
            Need an organization account? <Link to="/signup">Create your account</Link>
          </p>
        </div>
      </section>      
    </div>
  );
}
