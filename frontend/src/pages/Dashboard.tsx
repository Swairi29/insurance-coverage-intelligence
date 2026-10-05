import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyses, useAnalysis } from '../api/analyses';
import { usePolicies } from '../api/policies';
import type { AnalysisSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DocumentIcon, SparkleIcon } from '../components/icons';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { StatusBar } from '../components/StatusBar';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonLines } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';
import { businessTypeLabel, loadProfileDraft } from '../lib/profile';
import { statusCounts } from '../lib/results';

interface ChecklistStep {
  title: string;
  description: string;
  done: boolean | null; // null while loading
  to: string;
  action: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [profile] = useState(loadProfileDraft);
  const policies = usePolicies();
  const analyses = useAnalyses();

  const readyPolicies = policies.data?.filter((p) => p.status === 'ready').length ?? 0;
  const latest = analyses.data
    ? [...analyses.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : undefined;

  const steps: ChecklistStep[] = [
    {
      title: 'Business profile',
      description: profile
        ? `${profile.business_name}, ${businessTypeLabel(profile).toLowerCase()}.`
        : 'Kept in this browser tab and sent with each analysis.',
      done: profile !== null,
      to: '/app/profile',
      action: profile ? 'Edit profile' : 'Add profile',
    },
    {
      title: policies.data ? `Policies uploaded (${readyPolicies})` : 'Policies uploaded',
      description: policies.data
        ? `${plural(readyPolicies, 'policy', 'policies')} ready.`
        : 'PDF policy documents, up to 25 MB each.',
      done: policies.data ? readyPolicies > 0 : policies.isError ? false : null,
      to: '/app/policies',
      action: readyPolicies > 0 ? 'Manage policies' : 'Upload a policy',
    },
    {
      title: 'First analysis',
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
      {/* Welcome card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="min-w-0">
          <p className="text-meta font-semibold text-muted">Your workspace</p>
          <h1 className="mt-1 truncate text-section font-extrabold sm:text-[1.75rem]">
            {profile ? profile.business_name : 'Welcome to InsureIntel'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-ink-heading">{user?.email}</span>
          </p>
        </div>
        <Link to="/app/analyses/new" className={buttonClasses('primary')}>
          <SparkleIcon className="h-4 w-4" />
          Run new analysis
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section
          aria-labelledby="getting-started"
          className="rounded-card border border-line bg-white p-5 shadow-soft sm:p-6"
        >
          <h2 id="getting-started" className="text-lg font-bold">
            Setup
          </h2>
          <ol className="mt-4 space-y-3" aria-label="Getting started steps">
            {steps.map((step, index) => (
              <li
                key={step.to}
                aria-current={index === nextIndex ? 'step' : undefined}
                className={`grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-panel border p-4 sm:grid-cols-[auto_1fr_auto] ${
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
                  className={`col-start-2 justify-self-start sm:col-start-auto ${
                    index === nextIndex
                      ? buttonClasses('primary', 'sm')
                      : 'rounded-control px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft'
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
          className="h-fit rounded-card border border-line bg-white p-5 shadow-soft sm:p-6"
        >
          <h2 id="latest-analysis" className="text-lg font-bold">
            Latest analysis
          </h2>
          <div className="mt-4">
            {analyses.isPending ? (
              <SkeletonLines label="Loading your latest analysis" lines={4} />
            ) : analyses.isError ? (
              <p className="text-sm text-muted">Your analyses could not be loaded right now.</p>
            ) : latest ? (
              <LatestAnalysis analysis={latest} total={analyses.data.length} />
            ) : (
              <EmptyLatest hasPolicies={readyPolicies > 0} />
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

function EmptyLatest({ hasPolicies }: { hasPolicies: boolean }) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong bg-canvas px-4 py-6 text-center">
      <DocumentIcon className="mx-auto h-6 w-6 text-brand" />
      <p className="mt-2 font-semibold text-ink-heading">No analyses yet</p>
      <p className="mt-1 text-sm text-muted">
        {hasPolicies
          ? 'Run your first analysis to see which risks your policies cover.'
          : 'Upload your first policy, then run an analysis to see your coverage.'}
      </p>
      <Link
        to={hasPolicies ? '/app/analyses/new' : '/app/policies'}
        className={`mt-4 ${buttonClasses('primary', 'sm')}`}
      >
        {hasPolicies ? 'Run your first analysis' : 'Upload your first policy'}
      </Link>
    </div>
  );
}

function LatestAnalysis({ analysis, total }: { analysis: AnalysisSummary; total: number }) {
  // The summary has totals only; the full result gives the count per status for the bar.
  const full = useAnalysis(analysis.request_id);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisStatusBadge status={analysis.status} />
        <span className="text-sm text-muted">{formatDateTime(analysis.created_at)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-panel bg-brand-soft p-3">
          <dt className="text-xs text-muted">Risks checked</dt>
          <dd className="font-display text-2xl font-extrabold text-ink-heading">
            {analysis.total_findings}
          </dd>
        </div>
        <div className="rounded-panel bg-status-excluded-bg p-3">
          <dt className="text-xs text-muted">Potential gaps</dt>
          <dd className="font-display text-2xl font-extrabold text-status-excluded">
            {analysis.potential_gaps}
          </dd>
        </div>
      </dl>
      {full.data && <StatusBar counts={statusCounts(full.data)} className="mt-4" />}
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
