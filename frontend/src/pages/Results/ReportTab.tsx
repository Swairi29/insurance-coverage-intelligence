import type { AnalysisResponse, Finding, FindingPriority } from '../../api/types';
import { FINDING_PRIORITIES } from '../../api/types';
import { AiLabel } from '../../components/AiLabel';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { EvidenceList } from '../../components/EvidenceList';
import { GapTag, StatusBadge } from '../../components/StatusBadge';
import { CATEGORY_LABELS } from '../../lib/labels';

const PRIORITY_TITLES: Record<FindingPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const PRIORITY_HINTS: Record<FindingPriority, string> = {
  high: 'No wording found, or excluded by your policies.',
  medium: 'Unclear or covered only with conditions.',
  low: 'Covered by your policies.',
};

/** The written report: one card per finding, grouped high → medium → low priority. */
export function ReportTab({
  analysis,
  policyNames,
}: {
  analysis: AnalysisResponse;
  policyNames: Record<string, string>;
}) {
  const report = analysis.report;
  if (!report) {
    return (
      <p className="rounded-card border border-line bg-white p-6 text-sm text-muted">
        The written report could not be generated for this analysis. The Coverage tab shows the
        coverage status of every risk.
      </p>
    );
  }
  if (report.findings.length === 0) {
    return <p className="text-sm text-muted">This analysis has no findings.</p>;
  }

  return (
    <div className="space-y-8">
      {FINDING_PRIORITIES.map((priority) => {
        const findings = report.findings.filter((f) => f.priority === priority);
        if (findings.length === 0) return null;
        return (
          <section key={priority} aria-labelledby={`priority-${priority}`}>
            <h2 id={`priority-${priority}`} className="text-lg font-bold">
              {PRIORITY_TITLES[priority]}{' '}
              <span className="font-normal text-muted">({findings.length})</span>
            </h2>
            <p className="text-sm text-muted">{PRIORITY_HINTS[priority]}</p>
            <ul className="mt-3 space-y-4">
              {findings.map((finding) => (
                <FindingCard
                  key={finding.risk_id}
                  finding={finding}
                  model={report.metadata.llm_model}
                  policyNames={policyNames}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function FindingCard({
  finding,
  model,
  policyNames,
}: {
  finding: Finding;
  model: string | null;
  policyNames: Record<string, string>;
}) {
  return (
    <li className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={finding.status} />
        {finding.potential_gap && <GapTag />}
        {finding.verification_required && (
          <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
            Verify with your insurer
          </span>
        )}
        <span className="ml-auto">
          <AiLabel kind="finding" value={finding.generated_by} model={model} />
        </span>
      </div>
      <h3 className="mt-3 text-lg font-bold">{finding.title}</h3>
      <p className="text-xs text-muted">
        {finding.risk_name}
        {finding.category && ` · ${CATEGORY_LABELS[finding.category]}`}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-ink">{finding.explanation}</p>
      <div className="mt-3 rounded-lg bg-brand-soft px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">What you can do</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{finding.recommendation}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink-heading">Policy evidence</h4>
        <ConfidenceLabel value={finding.coverage_confidence} />
      </div>
      <div className="mt-2">
        <EvidenceList items={finding.evidence} policyNames={policyNames} />
      </div>
    </li>
  );
}
