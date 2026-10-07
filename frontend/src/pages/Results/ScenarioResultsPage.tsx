import { useMemo, useRef, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ScenarioAnalysisResponse } from '../../api/types';
import { usePolicies } from '../../api/policies';
import { AnalysisStatusBadge, GapTag, StatusBadge } from '../../components/StatusBadge';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { EvidenceList } from '../../components/EvidenceList';
import { Disclaimer } from '../../components/Disclaimer';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../lib/format';

type Tab = 'overview' | 'coverage' | 'risks' | 'evidence';
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'risks', label: 'Risks' },
  { id: 'evidence', label: 'Evidence' },
];

// Colours come from the theme tokens, so the printed report switches to the light palette.
const CARD = 'rounded-xl border border-line bg-white/[0.04] print:break-inside-avoid';

export function ScenarioResultsPage({ analysis }: { analysis: ScenarioAnalysisResponse }) {
  const [search, setSearch] = useSearchParams();
  const requested = search.get('tab') as Tab | null;
  const tab = tabs.some((item) => item.id === requested) ? requested! : 'overview';
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const policies = usePolicies();
  const policyNames = useMemo(
    () =>
      Object.fromEntries(
        (policies.data ?? []).map((policy) => [policy.policy_id, policy.filename]),
      ),
    [policies.data],
  );
  const counts = analysis.coverage.assessments.reduce<Record<string, number>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  const setTab = (id: Tab) => setSearch({ source: 'scenario', tab: id }, { replace: true });
  const selectTab = (id: Tab) => {
    setTab(id);
    tabRefs.current[id]?.focus();
  };
  // Left / Right / Home / End move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (event: KeyboardEvent) => {
    const index = tabs.findIndex((item) => item.id === tab);
    const next = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[next].id);
  };

  return (
    <article className="mx-auto max-w-5xl text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/app/history" className="text-sm font-semibold text-blue-300 hover:underline">
          ← Analyses
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/app/analyses/${analysis.request_id}/running?source=scenario`}
            className="px-3 py-2 text-sm font-semibold text-blue-300 hover:underline"
          >
            View analysis stages
          </Link>
          <Button onClick={() => window.print()}>Print report</Button>
        </div>
      </div>
      <p className="hidden font-display text-lg font-extrabold text-ink-heading print:block">
        InsureIntel scenario coverage report
      </p>
      <header className="mt-5 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#102745] to-[#111b31] p-6 shadow-xl shadow-blue-950/30 print:mt-3 print:border-0 print:bg-none print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <AnalysisStatusBadge status={analysis.status} />
          <span className="text-sm text-muted-strong">{formatDateTime(analysis.created_at)}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold">Scenario analysis report</h1>
        <p className="mt-2 text-muted-strong">
          {analysis.risks.length} risks assessed against your selected policy evidence.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          <Metric label="Risks assessed" value={analysis.risks.length} />
          <Metric
            label="Potential gaps"
            value={analysis.coverage.assessments.filter((a) => a.potential_gap).length}
          />
          <Metric label="Covered" value={counts.covered ?? 0} />
          <Metric
            label="Needs checking"
            value={(counts.conditional ?? 0) + (counts.unclear ?? 0) + (counts.not_found ?? 0)}
          />
        </div>
      </header>
      <div
        role="tablist"
        aria-label="Report sections"
        onKeyDown={onTabKey}
        className="mt-5 flex gap-2 overflow-x-auto border-b border-line print:hidden"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            id={`scenario-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`scenario-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => selectTab(item.id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.id ? 'border-blue-400 text-blue-200' : 'border-transparent text-muted hover:text-ink-heading'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {/* All four panels are rendered; only the open one is shown on screen, and all of them
          are printed. */}
      {tabs.map((item, index) => (
        <section
          key={item.id}
          role="tabpanel"
          id={`scenario-panel-${item.id}`}
          aria-labelledby={`scenario-tab-${item.id}`}
          hidden={item.id !== tab}
          className={`py-6 print:block ${index > 0 ? 'print:break-before-page' : ''}`}
        >
          {item.id === 'overview' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Priority findings</h2>
              {analysis.report?.findings.length ? (
                analysis.report.findings.map((finding) => (
                  <div key={finding.risk_id} className={`${CARD} p-5`}>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={finding.status} />
                      {finding.potential_gap && <GapTag />}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{finding.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-strong">
                      {finding.explanation}
                    </p>
                    <p className="mt-3 text-sm text-muted">{finding.recommendation}</p>
                    <EvidenceList items={finding.evidence} policyNames={policyNames} />
                  </div>
                ))
              ) : (
                <p className="text-muted-strong">
                  The written report is unavailable. Coverage assessments remain available in the
                  Coverage section.
                </p>
              )}
            </div>
          )}
          {item.id === 'coverage' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold">Coverage assessments</h2>
              {analysis.coverage.assessments.map((assessment) => (
                <div key={assessment.risk_id} className={`${CARD} p-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{assessment.risk_name}</h3>
                    <div className="flex gap-2">
                      <StatusBadge status={assessment.status} />
                      {assessment.potential_gap && <GapTag />}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-strong">{assessment.reason}</p>
                  <div className="mt-2">
                    <ConfidenceLabel value={assessment.confidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {item.id === 'risks' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold">Identified risks</h2>
              {analysis.risks.map((risk) => (
                <div key={risk.risk_id} className={`${CARD} p-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{risk.name}</h3>
                    <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs text-blue-200 print:border print:border-line print:text-ink">
                      {risk.category}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-strong">{risk.description}</p>
                  <p className="mt-2 text-sm text-muted">{risk.reason}</p>
                  <div className="mt-3">
                    <ConfidenceLabel value={risk.confidence} />
                  </div>
                  {risk.evidence.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-strong">
                      {risk.evidence.map((e, i) => (
                        <li key={`${e.source}-${i}`}>
                          {e.text} <span className="text-muted">({e.source})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {item.id === 'evidence' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold">Policy evidence</h2>
              {analysis.coverage.assessments
                .flatMap((assessment) =>
                  assessment.evidence.map((evidence) => ({ assessment, evidence })),
                )
                .map(({ assessment, evidence }) => (
                  // One clause can be evidence for several risks, so the key needs both.
                  <div key={`${assessment.risk_id}-${evidence.chunk_id}`} className={`${CARD} p-4`}>
                    <h3 className="font-semibold">{assessment.risk_name}</h3>
                    <EvidenceList
                      items={[
                        {
                          chunk_id: evidence.chunk_id,
                          policy_id: evidence.policy_id,
                          section: evidence.section,
                          page: evidence.page,
                          excerpt: evidence.text,
                          flagged: false,
                        },
                      ]}
                      policyNames={policyNames}
                    />
                  </div>
                ))}
              {analysis.coverage.assessments.every(
                (assessment) => assessment.evidence.length === 0,
              ) && (
                <p className="text-muted-strong">
                  No relevant policy wording was found for this scenario.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
      {analysis.warnings.length > 0 && (
        <aside className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100 print:break-inside-avoid print:border-status-conditional-border print:bg-status-conditional-bg print:text-ink">
          <h2 className="font-semibold">Analysis notes</h2>
          <ul className="mt-2 list-disc pl-5">
            {analysis.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      )}
      <Disclaimer text={analysis.report?.disclaimer} />
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-black/10 p-3 print:bg-transparent">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
