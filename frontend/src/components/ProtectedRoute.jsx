import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthStatusScreen } from "./AuthStatusScreen";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { isBootstrapping, user } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <AuthStatusScreen
        eyebrow="Securing session"
        title="Checking your authentication state..."
        description="Reconnecting your trusted session before we open the protected workspace."
      />
    );
  }

  if (!user) {
    const redirectTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }

  return <Outlet />;
}
