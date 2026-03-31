import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { validatePassword } from "../lib/auth";
import { AuthShell } from "../components/AuthShell";
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isValidSession, setIsValidSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const passwordChecks = validatePassword(password);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const type = hashParams.get("type");
        
        if (type === "recovery" && accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get("refresh_token") || ""
          });
          
          if (!error) {
            setIsValidSession(true);
          } else {
            setError("Invalid or expired reset link. Please request a new one.");
          }
        } else if (session) {
          setIsValidSession(true);
        } else {
          setError("Invalid or expired reset link. Please request a new one.");
        }
      } catch (err) {
        setError("Failed to verify reset link. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!passwordChecks.isValid) {
      setError("Please choose a stronger password that meets all requirements.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setSuccess("Password updated successfully! Redirecting to login...");
      
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || "Failed to update password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const highlights = [
    { title: "Secure Access", body: "Keep your account details safe." },
    { title: "24/7 Availability", body: "Manage expenses from anywhere." },
    { title: "Team Insights", body: "Real-time visibility into spending." }
  ];

  if (isLoading) {
    return (
      <AuthShell
        eyebrow="Security"
        title="Reset Password"
        description="We're verifying your reset link securely."
        highlights={highlights}
      >
        <div className="text-center py-12">
          <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: "var(--accent)" }} />
          <p className="text-slate-600 font-medium">Verifying link...</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Security"
      title="Set New Password"
      description="Create a secure password to regain access to your ReimburseMe account."
      highlights={highlights}
    >
      <div className="w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-heading)" }}>
            {isValidSession ? "New Password" : "Reset Failed"}
          </h2>
          <p className="text-sm mt-2 text-slate-500">
            {isValidSession 
              ? "Create a secure password for your account."
              : "There was an issue with your reset link."}
          </p>
        </div>

        {!isValidSession ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="alert alert-danger">
              <AlertCircle size={16} />
              <span>{error || "Invalid or expired reset link."}</span>
            </div>
            <Link to="/login" className="btn btn-primary w-full h-11 text-base">
              Return to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 animate-fadeIn">
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="input pl-10"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="input pl-10"
                  autoComplete="new-password"
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

            {error && (
              <div className="alert alert-danger">
                <AlertCircle size={16} /><span>{error}</span>
              </div>
            )}

            {success && (
              <div className="alert alert-success mt-4 mb-4">
                <CheckCircle2 size={16} /><span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !passwordChecks.isValid}
              className="btn btn-primary w-full h-11 text-base mt-2"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>Set Password <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-600">
          Remember your password?{" "}
          <Link to="/login" className="font-semibold" style={{ color: "var(--accent)" }}>
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
