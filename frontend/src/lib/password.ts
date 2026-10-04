// The backend's only rules (RegisterRequest in shared/schemas/requests.py): at least 8
// characters and at most 72 bytes (bcrypt's limit). The meter rewards length, as current
// password guidance does; it never asks for symbols the server does not require.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export type StrengthLevel = 0 | 1 | 2 | 3;

export const passwordBytes = (password: string) => new TextEncoder().encode(password).length;

/** 0 below the minimum; then longer is stronger (8-11 fair, 12-15 good, 16+ strong). */
export function passwordStrength(password: string): StrengthLevel {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  if (password.length < 12) return 1;
  if (password.length < 16) return 2;
  return 3;
}
