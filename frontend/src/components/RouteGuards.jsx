import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageLoader } from "./States";
import { needsEmailVerification } from "../lib/accountSecurity";

export function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoader label="正在确认登录状态" />;
  if (status !== "authenticated") {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

export function PublicOnlyRoute({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoader label="正在确认登录状态" />;
  if (status === "authenticated") {
    const next = new URLSearchParams(location.search).get("next");
    // Registration publishes the session before its submit promise resumes.
    // Match the submit handler's destination so this guard cannot race it home.
    const fallback = location.pathname === "/register" && needsEmailVerification(user)
      ? "/verify-email?registered=1" : "/home";
    return <Navigate to={next && next.startsWith("/") ? next : fallback} replace />;
  }
  return children;
}

export function AdminRoute({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoader label="正在确认权限" />;
  if (status !== "authenticated") {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (user?.role !== "system_admin") return <Navigate to="/home" replace />;
  return children;
}
