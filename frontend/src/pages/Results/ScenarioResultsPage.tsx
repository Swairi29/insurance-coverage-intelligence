import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ScenarioAnalysisResponse } from '../../api/types';
import { usePolicies } from '../../api/policies';
import { AnalysisStatusBadge, GapTag, StatusBadge } from '../../components/StatusBadge';
import { ConfidenceLabel } from '../../components/ConfidenceLabel';
import { EvidenceList } from '../../components/EvidenceList';
import { Disclaimer } from '../../components/Disclaimer';
import { formatDateTime } from '../../lib/format';

type Tab = 'overview' | 'coverage' | 'risks' | 'evidence';
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'risks', label: 'Risks' },
  { id: 'evidence', label: 'Evidence' },
];

export function ScenarioResultsPage({ analysis }: { analysis: ScenarioAnalysisResponse }) {
  const [search, setSearch] = useSearchParams();
  const requested = search.get('tab') as Tab | null;
  const tab = tabs.some((item) => item.id === requested) ? requested! : 'overview';
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

  return (
    <article className="mx-auto max-w-5xl text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/history" className="text-sm font-semibold text-blue-300 hover:underline">
          ← Analyses
        </Link>
        <Link
          to={`/app/analyses/${analysis.request_id}/running?source=scenario`}
          className="text-sm font-semibold text-blue-300 hover:underline"
        >
          View analysis stages
        </Link>
      </div>
      <header className="mt-5 rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#102745] to-[#111b31] p-6 shadow-xl shadow-blue-950/30">
        <div className="flex flex-wrap items-center gap-3">
          <AnalysisStatusBadge status={analysis.status} />
          <span className="text-sm text-slate-300">{formatDateTime(analysis.created_at)}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold">Scenario analysis report</h1>
        <p className="mt-2 text-slate-300">
          {analysis.risks.length} risks assessed against your selected policy evidence.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      <div className="mt-5 border-b border-white/10" role="tablist" aria-label="Report sections">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.id ? 'border-blue-400 text-blue-200' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <section className="py-6">
        {tab === 'overview' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Priority findings</h2>
            {analysis.report?.findings.length ? (
              analysis.report.findings.map((finding) => (
                <div
                  key={finding.risk_id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={finding.status} />
                    {finding.potential_gap && <GapTag />}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{finding.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {finding.explanation}
                  </p>
                  <p className="mt-3 text-sm text-slate-400">{finding.recommendation}</p>
                  <EvidenceList items={finding.evidence} policyNames={policyNames} />
                </div>
              ))
            ) : (
              <p className="text-slate-300">
                The written report is unavailable. Coverage assessments remain available in the
                Coverage tab.
              </p>
            )}
          </div>
        )}
        {tab === 'coverage' && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Coverage assessments</h2>
            {analysis.coverage.assessments.map((assessment) => (
              <div
                key={assessment.risk_id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{assessment.risk_name}</h3>
                  <div className="flex gap-2">
                    <StatusBadge status={assessment.status} />
                    {assessment.potential_gap && <GapTag />}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-300">{assessment.reason}</p>
                <div className="mt-2">
                  <ConfidenceLabel value={assessment.confidence} />
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'risks' && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Identified risks</h2>
            {analysis.risks.map((risk) => (
              <div
                key={risk.risk_id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{risk.name}</h3>
                  <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs text-blue-200">
                    {risk.category}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{risk.description}</p>
                <p className="mt-2 text-sm text-slate-400">{risk.reason}</p>
                <div className="mt-3">
                  <ConfidenceLabel value={risk.confidence} />
                </div>
                {risk.evidence.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {risk.evidence.map((e, i) => (
                      <li key={`${e.source}-${i}`}>
                        {e.text} <span className="text-slate-500">({e.source})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === 'evidence' && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Policy evidence</h2>
            {analysis.coverage.assessments
              .flatMap((assessment) =>
                assessment.evidence.map((evidence) => ({ assessment, evidence })),
              )
              .map(({ assessment, evidence }) => (
                <div
                  key={evidence.chunk_id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
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
              <p className="text-slate-300">
                No relevant policy wording was found for this scenario.
              </p>
            )}
          </div>
        )}
      </section>
      {analysis.warnings.length > 0 && (
        <aside className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
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
    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
