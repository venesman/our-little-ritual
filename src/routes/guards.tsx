import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSpace } from "../hooks/useSpace";
import { getPendingInvite } from "../lib/invite";
import { ErrorNote, OuterPage, Spinner } from "../components/ui";

/**
 * These guards decide which screen to show. They are a convenience, not the
 * security boundary: every query is also checked by Row Level Security in
 * Postgres, so skipping a guard would only ever show empty screens.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Opening" />;
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireSpace({ children }: { children: ReactNode }) {
  const { space, loading, error } = useSpace();
  if (loading) return <Spinner label="Finding your space" />;
  if (error) return <OuterPage><ErrorNote>{error}</ErrorNote></OuterPage>;
  if (!space) return <Navigate to={getPendingInvite() ? "/join" : "/start"} replace />;
  return <>{children}</>;
}

export function RequireNoSpace({ children }: { children: ReactNode }) {
  const { space, loading } = useSpace();
  if (loading) return <Spinner label="Finding your space" />;
  if (space) return <Navigate to="/" replace />;
  return <>{children}</>;
}
