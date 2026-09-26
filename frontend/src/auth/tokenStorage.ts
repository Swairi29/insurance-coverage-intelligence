// The login token, kept in memory and in sessionStorage (plan §3.5): a page refresh keeps the
// user logged in, closing the tab logs them out. It is never logged.

import { SESSION_KEYS, readSession, removeSession, writeSession } from '../lib/session';

interface StoredToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

let current: StoredToken | null = load();

function load(): StoredToken | null {
  const raw = readSession(SESSION_KEYS.token);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof parsed.token === 'string' && typeof parsed.expiresAt === 'number') {
      return { token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch {
    // corrupted value: treat as logged out
  }
  removeSession(SESSION_KEYS.token);
  return null;
}

/** The token, or null when there is none or it has expired. */
export function getToken(now: number = Date.now()): string | null {
  if (current && current.expiresAt <= now) clearToken();
  return current?.token ?? null;
}

export function setToken(token: string, expiresInSeconds: number, now: number = Date.now()): void {
  current = { token, expiresAt: now + expiresInSeconds * 1000 };
  writeSession(SESSION_KEYS.token, JSON.stringify(current));
}

export function clearToken(): void {
  current = null;
  removeSession(SESSION_KEYS.token);
}

/** Re-read sessionStorage. Only tests need this, to simulate a page reload. */
export function reloadTokenFromStorage(): void {
  current = load();
}
