import { Link } from 'react-router-dom';
import { useAnalyses } from '../api/analyses';
import type { AnalysisSummary } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';

const newestFirst = (rows: AnalysisSummary[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

export default function History() {
  const analyses = useAnalyses();

  return (
    <section className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">History</h1>
          <p className="mt-2 text-sm text-muted">
            Every analysis you have run. Results are stored encrypted and only you can open them.
          </p>
        </div>
        <Link
          to="/app/analyses/new"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          New analysis
        </Link>
      </div>

      <div className="mt-6">
        {analyses.isPending ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading your analyses…
          </div>
        ) : analyses.isError ? (
          <ErrorMessage
            title="Your history could not be loaded"
            error={analyses.error}
            onRetry={() => void analyses.refetch()}
          />
        ) : analyses.data.length === 0 ? (
          <div className="rounded-card border border-line bg-white px-6 py-10 text-center">
            <p className="font-semibold text-ink-heading">No analyses yet</p>
            <p className="mt-1 text-sm text-muted">
              <Link to="/app/analyses/new" className="font-semibold text-brand hover:underline">
                Run your first analysis
              </Link>{' '}
              to see your coverage gaps here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Past analyses">
            {newestFirst(analyses.data).map((analysis) => (
              <HistoryItem key={analysis.request_id} analysis={analysis} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HistoryItem({ analysis }: { analysis: AnalysisSummary }) {
  return (
    <li>
      <Link
        to={`/app/analyses/${analysis.request_id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div className="min-w-0">
          <p className="font-semibold text-ink-heading">{formatDateTime(analysis.created_at)}</p>
          <p className="mt-0.5 text-sm text-muted">
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
