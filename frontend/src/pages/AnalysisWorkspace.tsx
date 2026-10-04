import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAnalysisStatus, useRefreshAnalyses, useStartAnalysis } from '../api/analyses';
import { isApiError } from '../api/client';
import type { AnalysisProgress } from '../api/types';
import { AgentRail } from '../components/AgentRail';
import { ErrorMessage } from '../components/ErrorMessage';
import { HandoffLog } from '../components/HandoffLog';
import { InfoIcon, SparkleIcon, WarningIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonLines } from '../components/ui/Skeleton';
import { formatDuration } from '../lib/format';
import { AGENTS } from '../lib/labels';
import { analysisRequestFor, rememberAnalysisRequest } from '../lib/analysisRequests';

/**
 * The agent workspace: which of the four agents is working, what the gateway handed to each
 * one and what came back. Everything shown comes from GET /analyses/{id}/status; nothing is
 * estimated or invented.
 */
export default function AnalysisWorkspace() {
  const { requestId = '' } = useParams();
  const status = useAnalysisStatus(requestId);

  if (status.isPending) {
    return (
      <section className="max-w-5xl">
        <SkeletonLines label="Loading the analysis" lines={6} />
      </section>
    );
  }
  if (status.isError) {
    if (isApiError(status.error) && status.error.status === 404) {
      return (
        <section className="max-w-xl rounded-card border border-line bg-white p-6 shadow-card">
          <h1 className="text-section font-extrabold">Analysis not found</h1>
          <p className="mt-2 text-sm text-muted">
            This analysis does not exist, or it belongs to another account.
          </p>
          <Link
            to="/app/analyses"
            className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
          >
            ← Back to your history
          </Link>
        </section>
      );
    }
    return (
      <ErrorMessage
        title="The analysis status could not be loaded"
        error={status.error}
        onRetry={() => void status.refetch()}
      />
    );
  }
  return <Workspace progress={status.data} />;
}

function Workspace({ progress }: { progress: AnalysisProgress }) {
  const refreshAnalyses = useRefreshAnalyses();
  const running = progress.state === 'running';
  const finished = progress.state === 'complete' || progress.state === 'partial';
  const done = progress.stages.filter((s) => s.state === 'done').length;
  const current = progress.stages.findIndex((s) => s.state === 'running');
  const step = current >= 0 ? current + 1 : Math.min(done + 1, progress.stages.length);
  const percent = finished ? 100 : Math.round((done / progress.stages.length) * 100);
  const elapsed = useElapsed(progress.created_at, running ? null : progress.updated_at);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // When the run ends: refresh the history, and move focus to the new heading so screen
  // reader users hear the result.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void refreshAnalyses();
      headingRef.current?.focus();
    }
    wasRunning.current = running;
  }, [running, refreshAnalyses]);

  const title = running
    ? 'Analysing your coverage…'
    : finished
      ? 'Analysis complete'
      : 'The analysis could not finish';

  return (
    <section className="max-w-6xl" aria-labelledby="workspace-title">
      <header className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-meta font-semibold text-ai">
              <SparkleIcon className="h-3.5 w-3.5" />
              Agent workspace
            </p>
            <h1
              id="workspace-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-section font-extrabold focus:outline-none sm:text-[1.75rem]"
            >
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              {running && current >= 0
                ? `Step ${step} of ${progress.stages.length}: ${AGENTS[progress.stages[current].stage].name}`
                : running
                  ? `Step ${step} of ${progress.stages.length}`
                  : progress.state === 'partial'
                    ? 'The coverage results are ready; the written report could not be generated.'
                    : finished
                      ? 'All four agents have finished.'
                      : 'An agent failed, so the agents after it were skipped.'}
            </p>
          </div>
          <dl className="flex gap-6 text-right">
            <div>
              <dt className="text-meta text-muted">Elapsed</dt>
              <dd className="font-display text-xl font-extrabold text-ink-heading">
                <span role="timer" aria-live="off">
                  {elapsed}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-meta text-muted">Agents done</dt>
              <dd className="font-display text-xl font-extrabold text-ink-heading">
                {done} / {progress.stages.length}
              </dd>
            </div>
          </dl>
        </div>
        <div
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-5 h-2 overflow-hidden rounded-pill bg-ai-tint"
        >
          <div
            className={`h-full rounded-pill transition-all duration-500 ${
              progress.state === 'failed' ? 'bg-status-excluded' : 'bg-ai-bright'
            }`}
            style={{ width: `${Math.max(percent, running ? 4 : 0)}%` }}
          />
        </div>

        {finished && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to={`/app/analyses/${progress.request_id}`} className={buttonClasses('primary')}>
              View results →
            </Link>
            <span className="text-sm text-muted">The result is saved in your History.</span>
          </div>
        )}
        {progress.state === 'failed' && <FailureActions progress={progress} />}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="agents-title">
          <h2 id="agents-title" className="text-lg font-bold">
            Agents
          </h2>
          <div className="mt-3">
            <AgentRail stages={progress.stages} />
          </div>
        </section>
        <section
          aria-labelledby="log-title"
          className="h-fit rounded-card border border-line bg-white p-5 shadow-soft"
        >
          <h2 id="log-title" className="text-lg font-bold">
            Handoff log
          </h2>
          <div className="mt-2">
            <HandoffLog stages={progress.stages} startedAt={progress.created_at} />
          </div>
        </section>
      </div>

      {running && (
        <p className="mt-6 flex items-start gap-2 rounded-panel border border-brand-border bg-brand-soft px-4 py-3 text-sm text-muted-strong">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            You can leave this page. The analysis keeps running and is saved to your{' '}
            <Link to="/app/analyses" className="font-semibold text-brand hover:underline">
              History
            </Link>{' '}
            when it finishes.
          </span>
        </p>
      )}
    </section>
  );
}

function FailureActions({ progress }: { progress: AnalysisProgress }) {
  const navigate = useNavigate();
  const start = useStartAnalysis();
  // The request behind this run, if it was started in this tab.
  const lastRequest = analysisRequestFor(progress.request_id);

  const retry = () => {
    if (!lastRequest) return;
    start.mutate(lastRequest, {
      onSuccess: (next) => {
        rememberAnalysisRequest(next.request_id, lastRequest);
        navigate(`/app/analyses/${next.request_id}/progress`);
      },
    });
  };

  return (
    <div className="mt-5 space-y-3">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-panel border border-status-excluded-border bg-status-excluded-bg px-4 py-3 text-sm text-status-excluded"
      >
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {progress.error?.message ?? 'The analysis could not be completed.'}
          {progress.error?.request_id && (
            <span className="mt-1 block text-xs">Reference: {progress.error.request_id}</span>
          )}
        </span>
      </div>
      {start.isError && (
        <ErrorMessage title="The analysis could not start again" error={start.error} />
      )}
      <div className="flex flex-wrap gap-3">
        {lastRequest ? (
          <Button onClick={retry} loading={start.isPending}>
            Retry analysis
          </Button>
        ) : (
          <Link to="/app/analyses/new" className={buttonClasses('primary')}>
            Start a new analysis
          </Link>
        )}
        <Link to="/app/analyses/new" className={buttonClasses('secondary')}>
          Change policies
        </Link>
      </div>
    </div>
  );
}

/** Time since `from`, ticking every second until `until` is set. */
function useElapsed(from: string, until: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  const end = until ? Date.parse(until) : now;
  return formatDuration(Math.max(0, end - Date.parse(from)));
}
