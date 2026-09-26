// sessionStorage helpers. Storage can be missing or throw (private windows, blocked site
// data), so every access is wrapped and the app still works without it.
// sessionStorage, not localStorage: closing the tab ends the session (plan §3.5).

export const SESSION_KEYS = {
  token: 'insureintel.token',
  /** The business profile draft (plan §3.6), written by the profile page in step 7. */
  profileDraft: 'insureintel.profileDraft',
} as const;

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the value only lives in memory for this page.
  }
}

export function removeSession(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // nothing to remove
  }
}
