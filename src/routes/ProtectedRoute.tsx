import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { PageSpinner } from "../components/ui/Spinner";
import type { Role } from "../lib/types";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}

export function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;

  if (user.role === "admin") return <Navigate to="/admin/users" replace />;
  if (user.role === "professor") return <Navigate to="/professor/subjects" replace />;
  return <Navigate to="/student/subjects" replace />;
}
