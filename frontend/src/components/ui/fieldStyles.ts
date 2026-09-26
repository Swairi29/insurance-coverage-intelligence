// Shared look of text inputs, selects and textareas.

export const INPUT_CLASSES =
  'mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30';

export const inputBorder = (error?: string | null) =>
  error ? 'border-status-excluded focus:border-status-excluded' : 'border-line focus:border-brand';
