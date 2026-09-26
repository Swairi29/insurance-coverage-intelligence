import { confidenceLevel } from '../lib/labels';

const LEVEL_CLASSES = {
  High: 'text-ink-heading',
  Medium: 'text-muted-strong',
  Low: 'text-status-conditional',
} as const;

/**
 * Confidence as High / Medium / Low. The number is only in the tooltip, because it is the
 * system's own estimate, not a probability that something is covered (plan §4).
 */
export function ConfidenceLabel({ value }: { value: number }) {
  const level = confidenceLevel(value);
  const detail = `Confidence score ${value.toFixed(2)} (the system's own estimate, not a legal certainty)`;
  return (
    <span className={`text-xs font-semibold ${LEVEL_CLASSES[level]}`} title={detail}>
      {level} confidence
      <span className="sr-only"> ({detail})</span>
    </span>
  );
}
