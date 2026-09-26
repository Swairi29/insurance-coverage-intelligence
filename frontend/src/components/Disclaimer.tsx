import { InfoIcon } from './icons';

/** Same wording as DISCLAIMER in shared/models/analysis.py, for results without a report. */
export const DEFAULT_DISCLAIMER =
  'This report is decision support only. It is based on the policy text that was analysed and ' +
  'identifies potential coverage gaps; it is not a legal or binding coverage decision. Confirm ' +
  'every finding with your insurer or insurance broker.';

/** Always visible on results, never hidden in a tooltip (plan §1, §4). */
export function Disclaimer({ text = DEFAULT_DISCLAIMER }: { text?: string }) {
  return (
    <aside
      aria-label="Disclaimer"
      className="flex gap-3 rounded-lg border border-brand-border bg-brand-soft px-4 py-3 text-sm text-muted-strong"
    >
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <p>
        <strong className="text-ink-heading">Decision support, not advice. </strong>
        {text}
      </p>
    </aside>
  );
}
