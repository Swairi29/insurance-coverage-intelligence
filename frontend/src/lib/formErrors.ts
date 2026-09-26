import type { ValidationErrorDetail } from '../api/types';

/**
 * Turns a 422's `details` into one message per form field, keyed by the gateway's dotted path
 * (e.g. "password", "business.employee_count"). Only the first message per field is kept.
 * Details for fields the form doesn't show are returned under `other`.
 */
export function fieldErrorsFrom(
  details: ValidationErrorDetail[],
  formFields: readonly string[],
): { fields: Record<string, string>; other: string[] } {
  const fields: Record<string, string> = {};
  const other: string[] = [];
  for (const { field, message } of details) {
    if (formFields.includes(field)) {
      fields[field] ??= message;
    } else {
      other.push(message);
    }
  }
  return { fields, other };
}

/** "about 15 minutes" / "45 seconds", for Retry-After. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
