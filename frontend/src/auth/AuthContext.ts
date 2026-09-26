import { createContext, useContext } from 'react';
import type { UserResponse } from '../api/types';

export type AuthStatus =
  /** A stored token is being checked with GET /auth/me. */
  'checking' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserResponse | null;
  /** True after the gateway rejected the token (expired or revoked); cleared on the next login. */
  sessionExpired: boolean;
  /** Throws an ApiError when the login fails. */
  login: (email: string, password: string) => Promise<void>;
  /** Registers, then logs in with the same details. Throws an ApiError on failure. */
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
