import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageLoader } from "./States";

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
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoader label="正在确认登录状态" />;
  if (status === "authenticated") {
    const next = new URLSearchParams(location.search).get("next");
    return <Navigate to={next && next.startsWith("/") ? next : "/home"} replace />;
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
