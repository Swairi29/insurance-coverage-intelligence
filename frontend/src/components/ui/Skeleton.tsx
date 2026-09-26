// Grey placeholders shaped like the content that is loading. Screen readers hear `label`.

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-line motion-safe:animate-pulse ${className}`} />;
}

/** A list of card-shaped placeholders, e.g. policies or past analyses. */
export function SkeletonList({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center gap-3 rounded-card border border-line bg-white p-4"
        >
          <Bar className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar className="h-3.5 w-1/2" />
            <Bar className="h-3 w-1/3" />
          </div>
          <Bar className="h-5 w-16 shrink-0" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A header block and a few cards, for the results page. */
export function SkeletonReport({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="max-w-5xl space-y-4">
      <div aria-hidden="true" className="space-y-3 rounded-card border border-line bg-white p-6">
        <Bar className="h-4 w-40" />
        <Bar className="h-6 w-3/4" />
        <div className="flex gap-2">
          <Bar className="h-5 w-24" />
          <Bar className="h-5 w-24" />
          <Bar className="h-5 w-24" />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="space-y-2 rounded-card border border-line bg-white p-5"
        >
          <Bar className="h-5 w-1/3" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-5/6" />
          <Bar className="h-3 w-2/3" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A small block of lines, e.g. the dashboard's latest-analysis card. */
export function SkeletonLines({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={`h-3.5 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
