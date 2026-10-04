import type { CoverageStatus } from '../api/types';
import { COVERAGE_STATUSES } from '../api/types';
import { STATUS_LABELS } from '../lib/labels';
import { STATUS_SEVERITY } from '../lib/results';

// Full class names so Tailwind keeps them. `dot` shades: bars and dots only, never text.
const SEGMENT: Record<CoverageStatus, string> = {
  not_found: 'bg-status-notfound-dot',
  excluded: 'bg-status-excluded',
  unclear: 'bg-status-unclear-dot',
  conditional: 'bg-status-conditional-dot',
  covered: 'bg-status-covered-dot',
};

/**
 * The five coverage statuses as one segmented bar, with a legend that gives every status its
 * label and count (colour is never the only cue).
 */
export function StatusBar({
  counts,
  showLegend = true,
  className = '',
}: {
  counts: Record<CoverageStatus, number>;
  showLegend?: boolean;
  className?: string;
}) {
  const order = [...COVERAGE_STATUSES].sort((a, b) => STATUS_SEVERITY[a] - STATUS_SEVERITY[b]);
  const total = order.reduce((sum, status) => sum + counts[status], 0);
  const summary = order
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${STATUS_LABELS[status].toLowerCase()}`)
    .join(', ');

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={total ? `Coverage results: ${summary}.` : 'No risks were checked.'}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-pill bg-line"
      >
        {total > 0 &&
          order
            .filter((status) => counts[status] > 0)
            .map((status) => (
              <span
                key={status}
                className={`h-full first:rounded-l-pill last:rounded-r-pill ${SEGMENT[status]}`}
                style={{ width: `${(counts[status] / total) * 100}%` }}
              />
            ))}
      </div>
      {showLegend && (
        <ul
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta text-muted-strong"
          aria-label="Findings by status"
        >
          {order
            .filter((status) => counts[status] > 0)
            .map((status) => (
              <li key={status} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${SEGMENT[status]}`} />
                <span>{STATUS_LABELS[status]}</span>
                <span className="font-semibold text-ink-heading">{counts[status]}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
