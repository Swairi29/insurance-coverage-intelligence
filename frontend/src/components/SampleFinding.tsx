import type { SampleFindingData } from '../lib/examples';
import { DocumentIcon } from './icons';
import { GapTag, StatusBadge } from './StatusBadge';

/** An illustrative finding for marketing and auth pages: clearly marked as an example. */
export function SampleFinding({
  finding,
  compact = false,
}: {
  finding: SampleFindingData;
  compact?: boolean;
}) {
  return (
    <figure className="rounded-card border border-line bg-white p-5 shadow-lift">
      <figcaption className="text-meta font-semibold uppercase tracking-wide text-muted">
        Example finding
      </figcaption>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="font-display text-lg font-bold text-ink-heading">{finding.risk}</p>
        <StatusBadge status={finding.status} />
        {finding.gap && <GapTag />}
      </div>
      {finding.explanation && !compact && (
        <p className="mt-2 text-sm leading-relaxed text-ink">{finding.explanation}</p>
      )}
      <blockquote className="mt-3 rounded-control border-l-2 border-ai-bright bg-ai-tint px-3 py-2 text-sm leading-relaxed text-ink">
        “{finding.clause}”
      </blockquote>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-strong">
        <DocumentIcon className="h-3.5 w-3.5 text-muted" />
        <span className="font-semibold text-ink-heading">{finding.file}</span>
        <span aria-hidden="true">·</span>
        <span>{finding.section}</span>
        <span aria-hidden="true">·</span>
        <span>Page {finding.page}</span>
      </p>
    </figure>
  );
}
