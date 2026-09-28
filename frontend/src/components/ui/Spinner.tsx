/**
 * `colour` is separate from `className`: two text colours in one class list are decided by CSS
 * order. Use `text-ai-bright` while the AI is working, the navy default for ordinary loading.
 */
export function Spinner({
  className = 'h-5 w-5',
  colour = 'text-brand',
}: {
  className?: string;
  colour?: string;
}) {
  return (
    <svg
      className={`animate-spin ${colour} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
