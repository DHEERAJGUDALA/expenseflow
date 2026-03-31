import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { validatePassword } from "../lib/auth";

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

  // Check if we have a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // Check if there's a recovery token in the URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const type = hashParams.get("type");
        
        if (type === "recovery" && accessToken) {
          // Set the session using the recovery token
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
          // Already have a session, allow password change
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

      if (error) {
        throw error;
      }

      setSuccess("Password updated successfully! Redirecting to login...");
      
      // Sign out and redirect to login
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <span className="animate-spin inline-block text-4xl mb-4">⏳</span>
          <p className="text-slate-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Set Your Password</h1>
            <p className="text-slate-500 mt-2">
              {isValidSession 
                ? "Create a secure password for your account"
                : "There was an issue with your reset link"}
            </p>
          </div>

          {!isValidSession ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                {error || "Invalid or expired reset link."}
              </div>
              <Link
                to="/login"
                className="block w-full py-3 bg-slate-900 text-white rounded-lg font-medium text-center hover:bg-slate-800 transition-colors"
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoComplete="new-password"
                />
              </div>

              {/* Password Requirements */}
              <div className="grid grid-cols-2 gap-2">
                {passwordChecks.requirements.map((req) => (
                  <div
                    key={req.label}
                    className={`text-xs px-3 py-2 rounded-lg ${
                      req.valid
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-slate-50 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {req.valid ? "✓" : "○"} {req.label}
                  </div>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !passwordChecks.isValid}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Updating Password..." : "Set Password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Remember your password?{" "}
          <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
