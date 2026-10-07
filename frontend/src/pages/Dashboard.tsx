import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyses, useAnalysis } from '../api/analyses';
import { useScenarioAnalyses } from '../api/scenarioAnalyses';
import { usePolicies } from '../api/policies';
import type { AnalysisSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DocumentIcon } from '../components/icons';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { StatusBar } from '../components/StatusBar';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonLines } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';
import { businessTypeLabel, loadProfileDraft } from '../lib/profile';
import { scenarioLabel } from '../lib/scenarioHistory';
import { statusCounts } from '../lib/results';

interface ChecklistStep {
  title: string;
  description: string;
  done: boolean | null; // null while loading
  to: string;
  action: string;
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

const PANEL = 'rounded-2xl border border-blue-200/10 bg-[#0b1930]/80 p-5 sm:p-6';

export default function Dashboard() {
  const { user } = useAuth();
  const [profile] = useState(loadProfileDraft);
  const policies = usePolicies();
  const analyses = useAnalyses();
  const scenarios = useScenarioAnalyses();
  const newestFirst = <T extends AnalysisSummary>(list: T[]) =>
    [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const rows = newestFirst(analyses.data ?? []);
  // The latest-analysis card opens the full profile result; the recent list has both kinds.
  const latest = rows[0];
  const recent = newestFirst([
    ...rows.map((row) => ({ ...row, scenario: false })),
    ...(scenarios.data ?? []).map((row) => ({ ...row, scenario: true })),
  ]);
  const readyCount = policies.data?.filter((policy) => policy.status === 'ready').length ?? 0;
  const name = profile?.business_name || user?.email?.split('@')[0] || 'there';

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
      title: policies.data ? `Policies uploaded (${readyCount})` : 'Policies uploaded',
      description: policies.data
        ? `${plural(readyCount, 'policy', 'policies')} ready.`
        : 'PDF policy documents, up to 25 MB each.',
      done: policies.data ? readyCount > 0 : policies.isError ? false : null,
      to: '/app/policies',
      action: readyCount > 0 ? 'Manage policies' : 'Upload a policy',
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

  // Per-run figures come from the latest analysis: adding up every run counts repeats twice.
  const metrics = [
    {
      label: 'Business profile',
      value: profile ? 'Saved' : 'Not set',
      detail: profile?.business_name ?? 'Add your business details',
      accent: 'text-blue-300',
    },
    {
      label: 'Ready policies',
      value: policies.isPending ? '—' : readyCount,
      detail: policies.isError ? 'Could not load policies' : 'Available to analyse',
      accent: 'text-cyan-200',
    },
    {
      label: 'Analyses',
      value: analyses.isPending ? '—' : recent.length,
      detail: 'Saved reports',
      accent: 'text-sky-200',
    },
    {
      label: 'Potential gaps',
      value: analyses.isPending ? '—' : (latest?.potential_gaps ?? 0),
      detail: latest ? 'In your latest analysis' : 'No analysis yet',
      accent: 'text-rose-300',
    },
  ];

  return (
    <section className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 h-80 w-80 rounded-full bg-blue-600/15 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[38%] top-16 -z-10 h-56 w-56 rounded-full bg-cyan-500/[.07] blur-[100px]"
      />

      <div className="relative border-b border-blue-200/10 pb-8 pt-2 sm:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[.24em] text-cyan-300">
              Your workspace
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-[-.035em] text-white sm:text-5xl">
              {greeting()}
              <span className="text-blue-400">.</span>
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              {name === 'there' ? 'Understand your insurance coverage' : `Workspace for ${name}`} —
              identify potential gaps with evidence from your policies.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Signed in as <span className="font-medium text-slate-200">{user?.email}</span>
            </p>
          </div>
          <Link
            to="/app/analyses/new"
            className={`${buttonClasses('ai', 'lg')} rounded-xl shadow-[0_10px_36px_-14px_rgba(37,99,235,.8)]`}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              +
            </span>
            New Analysis
          </Link>
        </div>
      </div>

      <section aria-label="Workspace metrics" className="mt-6">
        <div className="grid overflow-hidden rounded-2xl border border-blue-200/10 bg-gradient-to-br from-[#0d2242] to-[#09172d] shadow-[0_18px_55px_-38px_rgba(37,99,235,.8)] sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`relative min-w-0 px-5 py-4 sm:px-6 sm:py-5 ${index > 0 ? 'border-t border-blue-100/10 sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'xl:border-l' : ''}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">
                {metric.label}
              </p>
              <p
                className={`mt-2 font-display text-4xl font-extrabold tracking-tight ${metric.accent}`}
              >
                {metric.value}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="getting-started" className={PANEL}>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">
              Getting started
            </p>
            <h2 id="getting-started" className="mt-1 text-xl font-bold text-white">
              Setup
            </h2>
            <ol className="mt-4 space-y-3" aria-label="Getting started steps">
              {steps.map((step, index) => (
                <li
                  key={step.to}
                  aria-current={index === nextIndex ? 'step' : undefined}
                  className={`grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl border p-4 sm:grid-cols-[auto_1fr_auto] ${
                    index === nextIndex
                      ? 'border-blue-400/40 bg-blue-500/10'
                      : 'border-blue-100/10 bg-white/[.02]'
                  }`}
                >
                  <StepMarker number={index + 1} done={step.done} />
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {step.title}
                      <span className="sr-only">
                        {step.done === true ? ' (done)' : step.done === false ? ' (to do)' : ''}
                      </span>
                    </p>
                    <p className="text-sm text-slate-400">{step.description}</p>
                  </div>
                  <Link
                    to={step.to}
                    className={`col-start-2 justify-self-start sm:col-start-auto ${
                      index === nextIndex
                        ? buttonClasses('primary', 'sm')
                        : 'rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-300 hover:bg-white/5 hover:text-cyan-200'
                    }`}
                  >
                    {step.action}
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="recent-title" className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-blue-100/10 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">
                  Your reports
                </p>
                <h2 id="recent-title" className="mt-1 text-2xl font-bold text-white">
                  Recent analyses
                </h2>
              </div>
              <Link
                to="/app/analyses"
                className="text-sm font-semibold text-blue-300 hover:text-cyan-200"
              >
                View history <span aria-hidden="true">→</span>
              </Link>
            </div>

            {analyses.isPending ? (
              <p className="py-8 text-sm text-slate-400" role="status">
                Loading analyses…
              </p>
            ) : analyses.isError ? (
              <p role="alert" className="py-6 text-sm text-rose-200">
                Your analyses could not be loaded. Refresh to try again.
              </p>
            ) : recent.length === 0 ? (
              <p className="py-8 text-sm text-slate-400">
                Your analysis reports will appear here when they are complete.
              </p>
            ) : (
              <ul aria-label="Recent analyses" className="divide-y divide-blue-100/10">
                {recent.slice(0, 5).map((analysis) => (
                  <li key={analysis.request_id}>
                    <div className="flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-blue-300/[.025]">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-100">
                          {analysis.scenario
                            ? scenarioLabel(analysis.request_id)
                            : 'Business profile analysis'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(analysis.created_at)}
                        </p>
                        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>{plural(analysis.total_findings, 'risk')} assessed</span>
                          <span
                            className={analysis.potential_gaps ? 'font-semibold text-rose-300' : ''}
                          >
                            {plural(analysis.potential_gaps, 'potential gap')}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <AnalysisStatusBadge status={analysis.status} />
                        <Link
                          to={`/app/analyses/${analysis.request_id}${analysis.scenario ? '?source=scenario' : ''}`}
                          aria-label={`Open analysis from ${formatDateTime(analysis.created_at)}`}
                          className="text-sm font-bold text-blue-300 transition-colors hover:text-cyan-200"
                        >
                          Open <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="latest-analysis" className={`h-fit ${PANEL}`}>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">
            Coverage overview
          </p>
          <h2 id="latest-analysis" className="mt-1 text-xl font-bold text-white">
            Latest analysis
          </h2>
          <div className="mt-4">
            {analyses.isPending ? (
              <SkeletonLines label="Loading your latest analysis" lines={4} />
            ) : analyses.isError ? (
              <p className="text-sm text-slate-400">Your analyses could not be loaded right now.</p>
            ) : latest ? (
              <LatestAnalysis analysis={latest} total={rows.length} />
            ) : (
              <EmptyLatest hasPolicies={readyCount > 0} />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function StepMarker({ number, done }: { number: number; done: boolean | null }) {
  if (done === null) return <Spinner className="h-7 w-7" colour="text-blue-300" />;
  return done ? (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-300"
    >
      ✓
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-blue-400/40 text-sm font-bold text-blue-200"
    >
      {number}
    </span>
  );
}

function EmptyLatest({ hasPolicies }: { hasPolicies: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-blue-200/20 px-4 py-6 text-center">
      <DocumentIcon className="mx-auto h-6 w-6 text-blue-300" />
      <p className="mt-2 font-semibold text-white">No analyses yet</p>
      <p className="mt-1 text-sm text-slate-400">
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
        <span className="text-sm text-slate-400">{formatDateTime(analysis.created_at)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-100/10 bg-white/[.03] p-3">
          <dt className="text-xs text-slate-400">Risks checked</dt>
          <dd className="font-display text-3xl font-extrabold text-white">
            {analysis.total_findings}
          </dd>
        </div>
        <div className="rounded-xl border border-rose-300/15 bg-rose-500/[.08] p-3">
          <dt className="text-xs text-slate-400">Potential gaps</dt>
          <dd className="font-display text-3xl font-extrabold text-rose-200">
            {analysis.potential_gaps}
          </dd>
        </div>
      </dl>
      {full.data && <StatusBar counts={statusCounts(full.data)} className="mt-4" />}
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Review each finding against its cited policy wording and confirm questions with your insurer
        or broker.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <Link
          to={`/app/analyses/${analysis.request_id}`}
          className="text-blue-300 hover:text-cyan-200"
        >
          Open results →
        </Link>
        {total > 1 && (
          <Link to="/app/analyses" className="text-slate-300 hover:text-white">
            All {total} analyses
          </Link>
        )}
      </div>
    </div>
  );
}
