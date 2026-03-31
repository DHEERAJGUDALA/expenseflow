import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthStatusScreen } from "./AuthStatusScreen";
import { useAuth } from "../context/AuthContext";

export function PublicOnlyRoute() {
  const { isBootstrapping, user } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <AuthStatusScreen
        eyebrow="Preparing access"
        title="Loading authentication experience..."
        description="Getting your login and signup flow ready."
      />
    );
  }

  if (user) {
    const redirectTo = new URLSearchParams(location.search).get("redirectTo") || "/app";
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
