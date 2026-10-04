import { useEffect, useId, useRef } from 'react';
import type { CoverageAssessment, Finding, IdentifiedRisk } from '../api/types';
import { AiLabel } from './AiLabel';
import { ConfidenceLabel } from './ConfidenceLabel';
import { EvidenceList } from './EvidenceList';
import { CloseIcon } from './icons';
import { GapTag, StatusBadge } from './StatusBadge';
import { AGENTS } from '../lib/labels';
import { plural } from '../lib/format';

/**
 * One risk's evidence in a side panel: the quoted clauses, and which agent produced each part
 * of the result. A modal dialog: Escape or the close button closes it, and focus returns to
 * the row that opened it.
 */
export function EvidenceDrawer({
  assessment,
  risk,
  finding,
  model,
  policyNames,
  onClose,
}: {
  assessment: CoverageAssessment;
  /** Agent 1's risk, when it is in the profile. */
  risk?: IdentifiedRisk;
  /** Agent 4's finding, when there is a report. */
  finding?: Finding;
  model: string | null;
  policyNames: Record<string, string>;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener.current?.focus();
    };
  }, [onClose]);

  const provenance = [
    {
      agent: AGENTS.risk_profile.name,
      text: risk
        ? `Identified this risk ${risk.source === 'rule' ? 'with its risk rules' : risk.source === 'llm' ? 'with an AI model' : 'with its rules, confirmed by an AI model'}.`
        : 'Identified this risk.',
    },
    {
      agent: AGENTS.policy_evidence.name,
      text:
        assessment.evidence.length > 0
          ? `Found ${plural(assessment.evidence.length, 'clause')} in your policies.`
          : 'Found no matching wording in your policies.',
    },
    {
      agent: AGENTS.coverage.name,
      text:
        assessment.method === 'rules'
          ? 'Decided the status with its coverage rules.'
          : 'Decided the status with its coverage rules, checked with an AI model.',
    },
    ...(finding
      ? [
          {
            agent: AGENTS.report.name,
            text:
              finding.generated_by === 'llm'
                ? 'Wrote the explanation with an AI model.'
                : 'Wrote the explanation from standard wording.',
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-lift"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div>
            <p className="text-meta font-semibold text-muted">Evidence</p>
            <h2 id={titleId} className="text-section font-extrabold">
              {assessment.risk_name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={assessment.status} />
              {assessment.potential_gap && <GapTag />}
              <ConfidenceLabel value={assessment.confidence} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close evidence"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted-strong hover:bg-brand-soft hover:text-brand"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="text-sm font-bold">Why this status</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink">{assessment.reason}</p>
            {finding && (
              <div className="mt-3 rounded-panel bg-brand-soft px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand">
                    What you can do
                  </p>
                  <AiLabel kind="finding" value={finding.generated_by} model={model} />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink">{finding.recommendation}</p>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold">Policy wording</h3>
            <div className="mt-2">
              <EvidenceList items={assessment.evidence} policyNames={policyNames} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold">Which agent did what</h3>
            <ol className="mt-2 space-y-2">
              {provenance.map((step) => (
                <li
                  key={step.agent}
                  className="rounded-control border border-line px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-ink-heading">{step.agent}</p>
                  <p className="text-muted-strong">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
