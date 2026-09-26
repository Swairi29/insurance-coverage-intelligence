import { useId, useState } from 'react';
import type { EvidenceCitation, EvidenceClause } from '../api/types';
import { DocumentIcon, WarningIcon } from './icons';

/** Text longer than this is collapsed behind "Show more". */
export const COLLAPSE_AFTER_CHARS = 280;

export const FLAGGED_MESSAGE =
  'This clause contained unusual instructions and was not used by the AI.';

type EvidenceItem = EvidenceClause | EvidenceCitation;

interface NormalisedEvidence {
  key: string;
  policyId: string;
  section: string | null;
  page: number;
  text: string;
  flagged: boolean;
}

/** Agent 3 returns EvidenceClause (`text`), Agent 4 returns EvidenceCitation (`excerpt`). */
function normalise(item: EvidenceItem, index: number): NormalisedEvidence {
  const isCitation = 'excerpt' in item;
  return {
    key: `${item.chunk_id}-${index}`,
    policyId: item.policy_id,
    section: item.section,
    page: item.page,
    text: isCitation ? item.excerpt : item.text,
    flagged: isCitation ? item.flagged : false,
  };
}

/**
 * The policy wording behind a finding or assessment: which policy, section and page, and the
 * clause text. Policy PDFs are untrusted, so the text is only ever rendered as plain text.
 */
export function EvidenceList({
  items,
  policyNames = {},
  emptyText = 'No policy wording was found for this risk.',
}: {
  items: readonly EvidenceItem[];
  /** policy_id → filename; the id is shown when a policy is not in the map. */
  policyNames?: Record<string, string>;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm italic text-muted">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const evidence = normalise(item, index);
        return (
          <EvidenceItemView
            key={evidence.key}
            evidence={evidence}
            policyName={policyNames[evidence.policyId] ?? evidence.policyId}
          />
        );
      })}
    </ul>
  );
}

function EvidenceItemView({
  evidence,
  policyName,
}: {
  evidence: NormalisedEvidence;
  policyName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const long = evidence.text.length > COLLAPSE_AFTER_CHARS;
  const shown =
    long && !expanded
      ? `${evidence.text.slice(0, COLLAPSE_AFTER_CHARS).trimEnd()}…`
      : evidence.text;

  return (
    <li
      className={`rounded-lg border p-3 ${
        evidence.flagged
          ? 'border-status-conditional-border bg-status-conditional-bg'
          : 'border-line bg-white'
      }`}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-strong">
        <DocumentIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="font-semibold text-ink-heading">{policyName}</span>
        <span aria-hidden="true">·</span>
        <span>{evidence.section ?? 'Section not detected'}</span>
        <span aria-hidden="true">·</span>
        <span>Page {evidence.page}</span>
      </p>
      {evidence.flagged && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-status-conditional">
          <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {FLAGGED_MESSAGE}
        </p>
      )}
      {/* Plain text only: React escapes it, so markup in a PDF stays visible text. */}
      <blockquote
        id={textId}
        className="mt-2 whitespace-pre-line border-l-2 border-line pl-3 text-sm leading-relaxed text-ink"
      >
        {shown}
      </blockquote>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 text-xs font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </li>
  );
}
