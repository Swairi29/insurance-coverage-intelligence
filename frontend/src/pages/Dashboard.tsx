import { Link } from 'react-router-dom';
import { useAnalyses } from '../api/analyses';
import { usePolicies } from '../api/policies';
import { useAuth } from '../auth/AuthContext';
import { AnalysisStatusBadge } from '../components/StatusBadge';
import { buttonClasses } from '../components/ui/buttonClasses';
import { formatDateTime, plural } from '../lib/format';
import { loadProfileDraft } from '../lib/profile';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Dashboard() {
  const { user } = useAuth();
  const profile = loadProfileDraft();
  const policies = usePolicies();
  const analyses = useAnalyses();
  const rows = [...(analyses.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const readyCount = policies.data?.filter((policy) => policy.status === 'ready').length ?? 0;
  const gaps = rows.reduce((sum, analysis) => sum + analysis.potential_gaps, 0);
  const name = profile?.business_name || user?.email?.split('@')[0] || 'there';

  const metrics = [
    {
      label: 'Businesses',
      value: profile ? 1 : 0,
      detail: profile?.business_name ?? 'No profile saved yet',
      accent: 'text-blue-300',
    },
    {
      label: 'Ready policies',
      value: policies.isPending ? '—' : readyCount,
      detail: policies.isError ? 'Could not load policies' : 'Available to analyze',
      accent: 'text-cyan-200',
    },
    {
      label: 'Analyses',
      value: analyses.isPending ? '—' : rows.length,
      detail: 'Saved reports',
      accent: 'text-sky-200',
    },
    {
      label: 'Potential gaps',
      value: analyses.isPending ? '—' : gaps,
      detail: 'Across saved reports',
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

      <header className="relative border-b border-blue-200/10 pb-8 pt-2 sm:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[.24em] text-cyan-300">
              {greeting()} · Insurance intelligence workspace
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-[-.035em] text-white sm:text-5xl">
              Welcome back<span className="text-blue-400">.</span>
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              {name === 'there' ? 'Understand your insurance coverage' : `Workspace for ${name}`} —
              identify potential gaps with evidence from your policies.
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

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
          <span className="font-semibold uppercase tracking-[.16em] text-slate-500">
            One evidence-led workflow
          </span>
          {['Risk profile', 'Policy evidence', 'Coverage analysis', 'Report'].map(
            (stage, index) => (
              <span key={stage} className="inline-flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="text-blue-500/70">
                    /
                  </span>
                )}
                {stage}
              </span>
            ),
          )}
        </div>
      </header>

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

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,.75fr)]">
        <section aria-labelledby="recent-title" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-blue-100/10 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">
                Your reports
              </p>
              <h2 id="recent-title" className="mt-1 text-2xl font-bold text-white">
                Recent analyses
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Your latest insurance intelligence reports.
              </p>
            </div>
            <Link
              to="/app/history"
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
          ) : rows.length === 0 ? (
            <div className="py-9">
              <p className="text-lg font-semibold text-white">No saved reports yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Your analysis reports will appear here when they are complete.
              </p>
              <Link
                to="/app/analyses/new"
                className="mt-4 inline-flex text-sm font-bold text-cyan-300 hover:text-white"
              >
                Start your first analysis{' '}
                <span className="ml-2" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          ) : (
            <ul aria-label="Recent analyses" className="divide-y divide-blue-100/10">
              {rows.slice(0, 5).map((analysis) => (
                <li key={analysis.request_id}>
                  <div className="flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-blue-300/[.025]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">Insurance analysis</p>
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
                        to={`/app/analyses/${analysis.request_id}`}
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

        <aside className="space-y-7">
          <section
            aria-labelledby="coverage-title"
            className="relative overflow-hidden border-y border-blue-200/15 py-6 sm:border sm:rounded-2xl sm:px-6"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 top-1 h-48 w-48 rounded-full bg-rose-500/[.10] blur-[65px]"
            />
            <p className="relative text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">
              Coverage overview
            </p>
            <h2 id="coverage-title" className="relative mt-2 text-xl font-bold text-white">
              Potential gaps to review
            </h2>
            <p className="relative mt-5 font-display text-7xl font-extrabold tracking-[-.06em] text-rose-200">
              {analyses.isPending ? '—' : gaps}
            </p>
            <p className="relative mt-1 text-sm text-slate-400">Found across saved analyses</p>
            <div className="relative mt-5 border-t border-blue-100/10 pt-4">
              <p className="text-xs leading-5 text-slate-400">
                Review each finding against its cited policy wording and confirm questions with your
                insurer or broker.
              </p>
              <Link
                to="/app/analyses"
                className="mt-4 inline-flex text-sm font-bold text-blue-300 hover:text-cyan-200"
              >
                Review reports{' '}
                <span className="ml-2" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </section>

          <section className="border-t border-blue-100/10 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">
              Next step
            </p>
            <h2 className="mt-2 text-lg font-bold text-white">
              {!profile
                ? 'Add your business details'
                : readyCount === 0
                  ? 'Add your policy documents'
                  : 'Explore your coverage'}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">
              {!profile
                ? 'Save structured details to start with a guided risk profile.'
                : readyCount === 0
                  ? 'Upload a policy PDF to find relevant wording.'
                  : 'Start with your profile or describe a scenario in your own words.'}
            </p>
            <Link
              to={
                !profile
                  ? '/app/businesses'
                  : readyCount === 0
                    ? '/app/policies'
                    : '/app/analyses/new'
              }
              className="mt-3 inline-flex text-sm font-semibold text-blue-300 hover:text-cyan-200"
            >
              {!profile ? 'Set up business' : readyCount === 0 ? 'Manage policies' : 'New analysis'}
              <span className="ml-2" aria-hidden="true">
                →
              </span>
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}
