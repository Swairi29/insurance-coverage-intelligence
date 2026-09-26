import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useAuth } from './AuthContext';
import { loginPathFor, safeNextPath } from './redirect';

/** Pages under /app: logged-in users only. Others go to the login page and come back after. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <FullPageSpinner label="Checking your session…" />;
  if (status === 'anonymous') {
    return <Navigate to={loginPathFor(location.pathname + location.search)} replace />;
  }
  return <>{children}</>;
}

/**
 * Login and register: a logged-in user goes to the page in `?next=` (the one they tried to
 * open before logging in), or to the dashboard. This is also what moves the user on after a
 * successful login or registration.
 */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [searchParams] = useSearchParams();
  if (status === 'checking') return <FullPageSpinner label="Checking your session…" />;
  if (status === 'authenticated') {
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
  }
  return <>{children}</>;
}
