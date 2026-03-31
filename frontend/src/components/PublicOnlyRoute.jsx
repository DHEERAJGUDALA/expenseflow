import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function PublicOnlyRoute() {
  const { isBootstrapping, user } = useAuth();
  const location = useLocation();

  // Don't block public routes — render immediately while bootstrapping.
  // Only redirect AWAY if we KNOW the user is logged in (bootstrapping done + user exists).
  if (!isBootstrapping && user) {
    const redirectTo = new URLSearchParams(location.search).get("redirectTo") || "/app";
    return <Navigate to={redirectTo} replace />;
  }

  // Render the public page (login/signup) immediately — no loading screen
  return <Outlet />;
}
