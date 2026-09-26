export const DEFAULT_AFTER_LOGIN = '/app';

/**
 * The page to open after login, from `?next=`. Only paths inside the app are allowed, so a
 * crafted link cannot send the user to another site ("//evil.test", "https://…").
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/app') || next.startsWith('//') || next.includes('\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}

export function loginPathFor(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
