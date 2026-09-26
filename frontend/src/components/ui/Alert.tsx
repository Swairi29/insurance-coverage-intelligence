import type { ReactNode } from 'react';

type Tone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<Tone, string> = {
  error: 'border-status-excluded-border bg-status-excluded-bg text-status-excluded',
  warning: 'border-status-conditional-border bg-status-conditional-bg text-status-conditional',
  info: 'border-brand-border bg-brand-soft text-muted-strong',
  success: 'border-status-covered-border bg-status-covered-bg text-status-covered',
};

/** A message box. Errors and warnings are announced to screen readers. */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
    </div>
  );
}
