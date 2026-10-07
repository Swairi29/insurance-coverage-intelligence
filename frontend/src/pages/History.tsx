import { Link } from 'react-router-dom';
import { useAnalyses } from '../api/analyses';
import { useScenarioAnalyses } from '../api/scenarioAnalyses';
import type { AnalysisSummary } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonList } from '../components/ui/Skeleton';
import { formatDateTime, plural } from '../lib/format';
import { scenarioLabel } from '../lib/scenarioHistory';
import { PageHeader } from '../components/ui/PageHeader';

type Kind = 'profile' | 'scenario';
type Row = AnalysisSummary & { kind: Kind };

const newestFirst = (rows: Row[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

export default function History() {
  const analyses = useAnalyses();
  const scenarios = useScenarioAnalyses();
  // Profile and scenario runs are saved the same way, so they share one list.
  const rows = newestFirst([
    ...(analyses.data ?? []).map((row) => ({ ...row, kind: 'profile' as const })),
    ...(scenarios.data ?? []).map((row) => ({ ...row, kind: 'scenario' as const })),
  ]);

  return (
    <section className="max-w-5xl">
      <PageHeader
        eyebrow="Reports and history"
        title="History"
        description="Every analysis you have run, from a business profile or a scenario. Results are stored encrypted and only you can open them."
        action={
          <Link to="/app/analyses/new" className={buttonClasses()}>
            + New Analysis
          </Link>
        }
      />

      <div className="mt-6 space-y-3">
        {scenarios.isError && (
          <p role="alert" className="text-sm text-status-conditional">
            Your scenario analyses could not be loaded right now; profile analyses are shown.
          </p>
        )}
        {analyses.isPending || scenarios.isPending ? (
          <SkeletonList label="Loading your analyses" />
        ) : analyses.isError ? (
          <ErrorMessage
            title="Your history could not be loaded"
            error={analyses.error}
            onRetry={() => void analyses.refetch()}
          />
        ) : rows.length === 0 ? (
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
            {rows.map((row) => (
              <HistoryItem key={`${row.kind}-${row.request_id}`} analysis={row} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HistoryItem({ analysis }: { analysis: Row }) {
  const scenario = analysis.kind === 'scenario';
  return (
    <li>
      <Link
        to={`/app/analyses/${analysis.request_id}${scenario ? '?source=scenario' : ''}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 hover:border-brand focus-visible:outline focus-visible:outline-2"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">
            {scenario ? scenarioLabel(analysis.request_id) : 'Business profile analysis'}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDateTime(analysis.created_at)} · {scenario ? 'Scenario' : 'Business profile'} ·{' '}
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
