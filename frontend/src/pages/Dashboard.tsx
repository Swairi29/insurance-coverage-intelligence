import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyses } from '../api/analyses';
import { usePolicies } from '../api/policies';
import type { AnalysisSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';
import { loadProfileDraft } from '../lib/profile';

interface ChecklistStep {
  title: string;
  description: string;
  done: boolean | null; // null while loading
  to: string;
  action: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [hasProfile] = useState(() => loadProfileDraft() !== null);
  const policies = usePolicies();
  const analyses = useAnalyses();

  const readyPolicies = policies.data?.filter((p) => p.status === 'ready').length ?? 0;
  const latest = analyses.data
    ? [...analyses.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : undefined;

  const steps: ChecklistStep[] = [
    {
      title: 'Describe your business',
      description: 'Kept in this browser tab and sent with each analysis.',
      done: hasProfile,
      to: '/app/profile',
      action: hasProfile ? 'Edit profile' : 'Add profile',
    },
    {
      title: 'Upload your policies',
      description: policies.data
        ? `${plural(readyPolicies, 'policy', 'policies')} ready.`
        : 'PDF policy documents, up to 25 MB each.',
      done: policies.data ? readyPolicies > 0 : policies.isError ? false : null,
      to: '/app/policies',
      action: readyPolicies > 0 ? 'Manage policies' : 'Upload a policy',
    },
    {
      title: 'Run an analysis',
      description: 'Checks your risks against your policies and explains any gaps.',
      done: analyses.data ? analyses.data.length > 0 : analyses.isError ? false : null,
      to: '/app/analyses/new',
      action: 'New analysis',
    },
  ];
  // The first unfinished step is the one to do next.
  const nextIndex = steps.findIndex((step) => step.done === false);

  return (
    <section className="max-w-5xl">
      <h1 className="text-2xl font-extrabold">Your workspace</h1>
      <p className="mt-1 text-sm text-muted">
        Signed in as <span className="font-medium text-ink-heading">{user?.email}</span>
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section
          aria-labelledby="getting-started"
          className="rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <h2 id="getting-started" className="text-lg font-bold">
            Getting started
          </h2>
          <ol className="mt-4 space-y-3" aria-label="Getting started steps">
            {steps.map((step, index) => (
              <li
                key={step.title}
                aria-current={index === nextIndex ? 'step' : undefined}
                className={`grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-lg border p-4 sm:grid-cols-[auto_1fr_auto] ${
                  index === nextIndex ? 'border-brand bg-brand-soft' : 'border-line'
                }`}
              >
                <StepMarker number={index + 1} done={step.done} />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-heading">
                    {step.title}
                    <span className="sr-only">
                      {step.done === true ? ' (done)' : step.done === false ? ' (to do)' : ''}
                    </span>
                  </p>
                  <p className="text-sm text-muted">{step.description}</p>
                </div>
                <Link
                  to={step.to}
                  className={`col-start-2 justify-self-start rounded-lg px-3 py-2 text-sm font-semibold sm:col-start-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                    index === nextIndex
                      ? 'bg-brand text-white hover:bg-brand-dark'
                      : 'text-brand hover:bg-brand-soft'
                  }`}
                >
                  {step.action}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="latest-analysis"
          className="h-fit rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <h2 id="latest-analysis" className="text-lg font-bold">
            Latest analysis
          </h2>
          <div className="mt-4">
            {analyses.isPending ? (
              <div role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Loading…
              </div>
            ) : analyses.isError ? (
              <p className="text-sm text-muted">Your analyses could not be loaded right now.</p>
            ) : latest ? (
              <LatestAnalysis analysis={latest} total={analyses.data.length} />
            ) : (
              <p className="text-sm text-muted">
                No analyses yet. Your latest result will appear here.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function StepMarker({ number, done }: { number: number; done: boolean | null }) {
  if (done === null) return <Spinner className="h-7 w-7" />;
  return done ? (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-covered text-sm font-bold text-white"
    >
      ✓
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-border text-sm font-bold text-brand"
    >
      {number}
    </span>
  );
}

function LatestAnalysis({ analysis, total }: { analysis: AnalysisSummary; total: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisStatusBadge status={analysis.status} />
        <span className="text-sm text-muted">{formatDateTime(analysis.created_at)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-brand-soft p-3">
          <dt className="text-xs text-muted">Risks checked</dt>
          <dd className="font-display text-2xl font-extrabold text-ink-heading">
            {analysis.total_findings}
          </dd>
        </div>
        <div className="rounded-lg bg-status-excluded-bg p-3">
          <dt className="text-xs text-muted">Potential gaps</dt>
          <dd className="font-display text-2xl font-extrabold text-status-excluded">
            {analysis.potential_gaps}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <Link to={`/app/analyses/${analysis.request_id}`} className="text-brand hover:underline">
          Open results →
        </Link>
        {total > 1 && (
          <Link to="/app/analyses" className="text-muted-strong hover:underline">
            All {total} analyses
          </Link>
        )}
      </div>
    </div>
  );
}
