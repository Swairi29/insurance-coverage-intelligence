import type { AnalysisStatus, CoverageStatus } from '../api/types';
import { STATUS_LABELS } from '../lib/labels';

// Full class names (not built from parts) so Tailwind keeps them in the build.
const STATUS_CLASSES: Record<CoverageStatus, string> = {
  covered: 'border-status-covered-border bg-status-covered-bg text-status-covered',
  conditional: 'border-status-conditional-border bg-status-conditional-bg text-status-conditional',
  unclear: 'border-status-unclear-border bg-status-unclear-bg text-status-unclear',
  excluded: 'border-status-excluded-border bg-status-excluded-bg text-status-excluded',
  not_found: 'border-status-notfound-border bg-status-notfound-bg text-status-notfound',
};

const PILL =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

/** Coverage status: colour plus a text label, never colour alone. */
export function StatusBadge({ status }: { status: CoverageStatus }) {
  return (
    <span className={`${PILL} ${STATUS_CLASSES[status]}`} data-status={status}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Shown when Agent 3 set `potential_gap`. */
export function GapTag() {
  return (
    <span className={`${PILL} border-status-excluded bg-status-excluded text-white`}>
      Potential gap
    </span>
  );
}

/** Whole-analysis status: complete, or partial (no written report). */
export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  return status === 'complete' ? (
    <span
      className={`${PILL} border-status-covered-border bg-status-covered-bg text-status-covered`}
    >
      Complete
    </span>
  ) : (
    <span
      className={`${PILL} border-status-conditional-border bg-status-conditional-bg text-status-conditional`}
      title="The coverage results are here, but the written report could not be generated."
    >
      Partial – no written report
    </span>
  );
}
