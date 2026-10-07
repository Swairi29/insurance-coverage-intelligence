import { Link, useLocation } from 'react-router-dom';
import { useAnalyses, useAnalysis } from '../api/analyses';
import { useScenarioAnalysis } from '../api/scenarioAnalyses';
import type { AnalysisSummary, ScenarioAnalysisResponse } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonList } from '../components/ui/Skeleton';
import { formatDateTime, plural } from '../lib/format';
import { scenarioAnalysesInSession } from '../lib/scenarioHistory';
import { PageHeader } from '../components/ui/PageHeader';

const newestFirst = (rows: AnalysisSummary[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

export default function History() {
  const analyses = useAnalyses();
  const location = useLocation();
  const historyView = location.pathname.endsWith('/history');
  const scenarioEntries = scenarioAnalysesInSession();

  return (
    <section className="max-w-5xl">
      <PageHeader
        eyebrow="Reports and history"
        title={historyView ? 'History' : 'Analyses'}
        description={
          historyView
            ? 'Open saved business profile analyses and scenario runs from this browser session.'
            : 'Review your saved results and scenario runs started in this browser session.'
        }
        action={
          <Link to="/app/analyses/new" className={buttonClasses()}>
            + New Analysis
          </Link>
        }
      />
      <div className="mb-5 flex gap-2 border-b border-slate-200 pb-3">
        <Link
          to="/app/analyses"
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${!historyView ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Analyses
        </Link>
        <Link
          to="/app/history"
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${historyView ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          History
        </Link>
      </div>

      <div className="mt-6">
        {analyses.isPending ? (
          <SkeletonList label="Loading your analyses" />
        ) : analyses.isError ? (
          <ErrorMessage
            title="Your history could not be loaded"
            error={analyses.error}
            onRetry={() => void analyses.refetch()}
          />
        ) : analyses.data.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-white px-6 py-10 text-center">
            <p className="font-semibold text-ink-heading">No analyses yet</p>
            <p className="mt-1 text-sm text-muted">
              Every analysis you run is saved here, encrypted, so you can come back to it.
            </p>
            <Link to="/app/analyses/new" className={`mt-4 ${buttonClasses('primary', 'sm')}`}>
              Run your first analysis
            </Link>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Past analyses">
            {newestFirst(analyses.data).map((analysis) => (
              <HistoryItem key={analysis.request_id} analysis={analysis} />
            ))}
          </ul>
        )}
      </div>
      {scenarioEntries.length > 0 && (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-950">Scenario runs in this session</h2>
            <p className="text-xs text-slate-500">
              Scenario results are retained for this signed-in session by the current service.
            </p>
          </div>
          <ul className="space-y-3">
            {scenarioEntries.map((entry) => (
              <ScenarioHistoryItem
                key={entry.request_id}
                requestId={entry.request_id}
                createdAt={entry.created_at}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function HistoryItem({ analysis }: { analysis: AnalysisSummary }) {
  const detail = useAnalysis(analysis.request_id);
  return (
    <li>
      <Link
        to={`/app/analyses/${analysis.request_id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 hover:border-brand focus-visible:outline focus-visible:outline-2"
      >
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">
            {detail.data?.risk_profile.business_name ?? 'Business profile analysis'}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDateTime(analysis.created_at)} · Business Profile ·{' '}
            {plural(analysis.total_findings, 'risk')} checked ·{' '}
            <span
              className={
                analysis.potential_gaps > 0 ? 'font-semibold text-status-excluded' : undefined
              }
            >
              {plural(analysis.potential_gaps, 'potential gap')}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AnalysisStatusBadge status={analysis.status} />
          <span className="text-sm font-semibold text-brand" aria-hidden="true">
            Open →
          </span>
        </div>
      </Link>
    </li>
  );
}

function ScenarioHistoryItem({ requestId, createdAt }: { requestId: string; createdAt: string }) {
  const analysis = useScenarioAnalysis(requestId, true);
  if (analysis.isError)
    return (
      <li className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Scenario result from {formatDateTime(createdAt)} is no longer available in this session.
      </li>
    );
  return (
    <ScenarioHistoryLink analysis={analysis.data} requestId={requestId} createdAt={createdAt} />
  );
}

function ScenarioHistoryLink({
  analysis,
  requestId,
  createdAt,
}: {
  analysis: ScenarioAnalysisResponse | undefined;
  requestId: string;
  createdAt: string;
}) {
  return (
    <li>
      <Link
        to={`/app/analyses/${requestId}?source=scenario`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300"
      >
        <div>
          <p className="font-semibold text-slate-950">Scenario analysis</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(analysis?.created_at ?? createdAt)} ·{' '}
            {analysis ? plural(analysis.risks.length, 'risk') : 'Loading results'} ·{' '}
            {analysis
              ? plural(
                  analysis.coverage.assessments.filter((item) => item.potential_gap).length,
                  'potential gap',
                )
              : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-blue-700">Open →</span>
      </Link>
    </li>
  );
}
