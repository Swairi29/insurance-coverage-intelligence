import { confidenceLevel } from '../lib/labels';

const LEVEL_CLASSES = {
  High: 'text-ink-heading',
  Medium: 'text-muted-strong',
  Low: 'text-status-conditional',
} as const;

const FILLED = { High: 3, Medium: 2, Low: 1 } as const;

/**
 * Confidence as a small 3-step meter plus the word High / Medium / Low. The number is only in
 * the tooltip, because it is the system's own estimate, not a probability that something is
 * covered (plan §4).
 */
export function ConfidenceLabel({ value }: { value: number }) {
  const level = confidenceLevel(value);
  const detail = `Confidence score ${value.toFixed(2)} (the system's own estimate, not a legal certainty)`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${LEVEL_CLASSES[level]}`}
      title={detail}
    >
      <span aria-hidden="true" className="inline-flex items-end gap-0.5">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`w-1 rounded-sm ${step <= FILLED[level] ? 'bg-current' : 'bg-line'}`}
            style={{ height: `${4 + step * 3}px` }}
          />
        ))}
      </span>
      {level} confidence
      <span className="sr-only"> ({detail})</span>
    </span>
  );
}
