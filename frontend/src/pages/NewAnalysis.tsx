import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useStartAnalysis } from '../api/analyses';
import { isApiError } from '../api/client';
import { MAX_POLICIES_PER_ANALYSIS, policiesQueryKey, usePolicies } from '../api/policies';
import type { AnalysisRequest, BusinessProfile, PolicyDocument } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { DocumentIcon, SparkleIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { SkeletonList } from '../components/ui/Skeleton';
import { formatDateTime, plural } from '../lib/format';
import { rememberAnalysisRequest } from '../lib/analysisRequests';
import { SALES_CHANNEL_LABELS, businessTypeLabel, loadProfileDraft } from '../lib/profile';
import type { ProfilePageState } from './BusinessProfile';

export default function NewAnalysis({ profileFlow = false }: { profileFlow?: boolean }) {
  return profileFlow ? <BusinessProfileAnalysis /> : <AnalysisMethodChooser />;
}

function BusinessProfileAnalysis() {
  const [profile] = useState(loadProfileDraft);
  if (!profile) {
    const state: ProfilePageState = {
      notice: 'Add your business profile first. It is sent with every analysis.',
    };
    return <Navigate to="/app/profile" replace state={state} />;
  }
  return <NewAnalysisForm profile={profile} />;
}

function AnalysisMethodChooser() {
  return (
    <section className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
        New analysis · step 1 of 2
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
        How would you like to describe your business?
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        Choose an input method. Both options continue through the same risk, policy, coverage, and
        report workflow.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <article className="relative overflow-hidden rounded-3xl border border-blue-200 bg-white p-6 shadow-[0_14px_45px_rgba(20,50,100,.08)] sm:p-8">
          <span className="absolute right-5 top-5 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700">
            Recommended
          </span>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-extrabold text-white">
            01
          </div>
          <h2 className="mt-6 text-xl font-bold text-slate-950">Business Profile</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
            Use your saved business information, operations, location, and equipment.
          </p>
          <Link
            to="/app/analyses/new/profile"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#102449] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
          >
            Continue <span aria-hidden="true">→</span>
          </Link>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_45px_rgba(20,50,100,.05)] sm:p-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-sm font-extrabold text-cyan-700">
            02
          </div>
          <h2 className="mt-6 text-xl font-bold text-slate-950">Describe a Scenario</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
            Describe a business or situation in your own words for flexible risk profiling.
          </p>
          <Link
            to="/app/analyses/new/scenario"
            className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-800 hover:border-blue-300 hover:bg-white/5"
          >
            Continue <span aria-hidden="true">→</span>
          </Link>
        </article>
      </div>
      <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
        <span className="font-bold">One analysis experience.</span> Both inputs are checked against
        your selected policies and produce the same coverage and report sections.
      </div>
    </section>
  );
}

function NewAnalysisForm({ profile }: { profile: BusinessProfile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const policies = usePolicies();
  const run = useStartAnalysis();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [lastRequest, setLastRequest] = useState<AnalysisRequest | null>(null);

  const ready = policies.data?.filter((p) => p.status === 'ready') ?? [];
  // Until the user changes it, the first 5 ready policies are selected.
  const chosen = selected ?? ready.slice(0, MAX_POLICIES_PER_ANALYSIS).map((p) => p.policy_id);
  const atLimit = chosen.length >= MAX_POLICIES_PER_ANALYSIS;

  const toggle = (policyId: string) =>
    setSelected(
      chosen.includes(policyId) ? chosen.filter((id) => id !== policyId) : [...chosen, policyId],
    );

  const start = (body: AnalysisRequest) => {
    if (run.isPending) return; // never start two analyses
    setLastRequest(body);
    run.mutate(body, {
      onSuccess: (progress) => {
        // Kept for the workspace's "Retry analysis" button.
        rememberAnalysisRequest(progress.request_id, body);
        navigate(`/app/analyses/${progress.request_id}/progress`, {
          state: { analysisLabel: profile.business_name },
        });
      },
      onError: (error) => {
        if (!isApiError(error)) return;
        if (error.status === 404) {
          // A chosen policy no longer exists for this account: refresh the list.
          setSelected(null);
          void queryClient.invalidateQueries({ queryKey: policiesQueryKey });
        }
        // A 422 about the profile: fix it on the profile page, next to the right fields.
        if (error.status === 422 && error.details.some((d) => d.field.startsWith('business.'))) {
          const state: ProfilePageState = { serverErrors: error.details };
          navigate('/app/profile', { state });
        }
      },
    });
  };

  return (
    <section className="max-w-4xl">
      <h1 className="text-2xl font-extrabold">New analysis</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Choose the policies to check against your business profile. The analysis identifies your
        business risks, finds the matching policy wording and explains any potential gaps.
      </p>

      {run.isError && (
        <div className="mt-6">
          <ErrorMessage
            title="The analysis could not start"
            error={run.error}
            onRetry={lastRequest ? () => start(lastRequest) : undefined}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section
          aria-labelledby="choose-policies"
          className="rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <h2 id="choose-policies" className="text-lg font-bold">
            1. Choose policies
          </h2>
          <p className="mt-1 text-sm text-muted">
            Up to {MAX_POLICIES_PER_ANALYSIS} policies. Only policies that are ready can be used.
          </p>
          <div className="mt-4">
            {policies.isPending ? (
              <SkeletonList label="Loading your policies" rows={2} />
            ) : policies.isError ? (
              <ErrorMessage
                title="Your policies could not be loaded"
                error={policies.error}
                onRetry={() => void policies.refetch()}
              />
            ) : ready.length === 0 ? (
              <div className="rounded-lg bg-brand-soft px-4 py-5 text-sm">
                <p className="font-semibold text-ink-heading">No policies are ready yet</p>
                <p className="mt-1 text-muted">
                  <Link to="/app/policies" className="font-semibold text-brand hover:underline">
                    Upload a policy PDF
                  </Link>{' '}
                  first, then come back here.
                </p>
              </div>
            ) : (
              <PolicyChoices
                policies={policies.data}
                chosen={chosen}
                atLimit={atLimit}
                onToggle={toggle}
              />
            )}
          </div>
        </section>

        <aside
          aria-labelledby="profile-summary"
          className="h-fit rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="profile-summary" className="text-lg font-bold">
              2. Check your profile
            </h2>
            <Link to="/app/profile" className="text-sm font-semibold text-brand hover:underline">
              Edit
            </Link>
          </div>
          <ProfileSummary profile={profile} />
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="ai"
          onClick={() => start({ business: profile, policy_ids: chosen })}
          disabled={chosen.length === 0}
          loading={run.isPending}
        >
          <SparkleIcon className="h-4 w-4" />
          Start analysis
        </Button>
        <p className="text-sm text-muted">
          {chosen.length === 0
            ? 'Choose at least one policy.'
            : `${plural(chosen.length, 'policy', 'policies')} selected. You can watch each agent work.`}
        </p>
      </div>
    </section>
  );
}

function PolicyChoices({
  policies,
  chosen,
  atLimit,
  onToggle,
}: {
  policies: PolicyDocument[];
  chosen: string[];
  atLimit: boolean;
  onToggle: (policyId: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Policies to include</legend>
      <ul className="space-y-2">
        {policies.map((policy) => {
          const isReady = policy.status === 'ready';
          const checked = chosen.includes(policy.policy_id);
          const disabled = !isReady || (atLimit && !checked);
          return (
            <li key={policy.policy_id}>
              <label
                className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                  checked ? 'border-brand bg-brand-soft' : 'border-line bg-white'
                } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(policy.policy_id)}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-heading">
                    {policy.filename}
                  </span>
                  <span className="block text-xs text-muted">
                    {isReady
                      ? `${plural(policy.page_count, 'page')} · uploaded ${formatDateTime(policy.uploaded_at)}`
                      : policy.status === 'processing'
                        ? 'Still processing'
                        : 'Could not be read'}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {atLimit && (
        <p className="mt-2 text-xs text-muted">
          {MAX_POLICIES_PER_ANALYSIS} policies is the most one analysis can use. Untick one to
          choose another.
        </p>
      )}
    </fieldset>
  );
}

function ProfileSummary({ profile }: { profile: BusinessProfile }) {
  const ops = profile.operations ?? {};
  const place = [profile.location?.city, profile.location?.country].filter(Boolean).join(', ');
  const rows: [string, string][] = [
    ['Business', profile.business_name],
    ['Type', businessTypeLabel(profile)],
    ['Employees', profile.employee_count == null ? 'Not given' : String(profile.employee_count)],
    ['Equipment', profile.equipment?.length ? profile.equipment.join(', ') : 'Not given'],
    [
      'Sales channels',
      ops.sales_channels?.length
        ? ops.sales_channels.map((c) => SALES_CHANNEL_LABELS[c]).join(', ')
        : 'Not given',
    ],
    ['Location', place || 'Not given'],
  ];
  return (
    <dl className="mt-4 space-y-2 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted">{term}</dt>
          <dd className="break-words font-medium text-ink-heading">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
