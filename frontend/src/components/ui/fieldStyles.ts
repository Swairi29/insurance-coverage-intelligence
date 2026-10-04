import type { ReactNode } from 'react';

// Shared look of text inputs, selects and textareas: 44 px tall, 10 px radius. Focus uses the
// global ring (index.css).

const FIELD_BASE =
  'mt-1.5 block w-full rounded-control border bg-white px-3 text-sm text-ink shadow-soft transition-colors placeholder:text-muted/70';

/** Inputs and selects. */
export const INPUT_CLASSES = `${FIELD_BASE} h-11`;

/** Textareas grow with their content instead of having a fixed height. */
export const TEXTAREA_CLASSES = `${FIELD_BASE} min-h-[96px] py-2.5`;

export const inputBorder = (error?: string | null) =>
  error
    ? 'border-status-excluded focus:border-status-excluded'
    : 'border-line hover:border-line-strong focus:border-ai-bright';

/** The id a field's aria-describedby points to: its error, else its hint. */
export function describedBy(inputId: string, hint: ReactNode, error?: string | null) {
  if (error) return `${inputId}-error`;
  return hint ? `${inputId}-hint` : undefined;
}
