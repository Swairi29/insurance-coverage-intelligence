import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCurrentUser, loginRequest, registerRequest } from '../api/auth';
import { configureApiClient, isApiError } from '../api/client';
import type { UserResponse } from '../api/types';
import { SESSION_KEYS, removeSession } from '../lib/session';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { clearToken, getToken, setToken } from './tokenStorage';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'checking' : 'anonymous'));
  const [sessionExpired, setSessionExpired] = useState(false);

  /** Forget everything that belongs to the user: token, profile draft and cached API data. */
  const clearSession = useCallback(() => {
    clearToken();
    removeSession(SESSION_KEYS.profileDraft);
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  // The API client asks for the token on every call and reports a rejected token here.
  useEffect(() => {
    configureApiClient({
      getToken: () => getToken(),
      onUnauthorized: () => {
        clearSession();
        setSessionExpired(true);
      },
    });
  }, [clearSession]);

  // A token kept from before a page reload: check it is still valid.
  useEffect(() => {
    if (status !== 'checking') return;
    const controller = new AbortController();
    fetchCurrentUser(controller.signal)
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // 401 is handled by onUnauthorized. Any other failure (e.g. the gateway is down)
        // also leaves the user logged out, so they are not stuck on a blank page.
        if (!isApiError(err) || err.status !== 401) clearSession();
      });
    return () => controller.abort();
  }, [status, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const token = await loginRequest({ email, password });
    setToken(token.access_token, token.expires_in);
    try {
      const me = await fetchCurrentUser();
      setUser(me);
      setSessionExpired(false);
      setStatus('authenticated');
    } catch (err) {
      clearToken();
      throw err;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await registerRequest({ email, password });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    clearSession();
    setSessionExpired(false);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, register, logout }),
    [status, user, sessionExpired, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
