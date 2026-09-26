import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useRunAnalysis } from '../api/analyses';
import { isApiError } from '../api/client';
import { MAX_POLICIES_PER_ANALYSIS, policiesQueryKey, usePolicies } from '../api/policies';
import type { AnalysisRequest, BusinessProfile, PolicyDocument } from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { DocumentIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime, plural } from '../lib/format';
import { AGENT_STAGES, STAGE_LABELS } from '../lib/labels';
import { BUSINESS_TYPE_LABELS, SALES_CHANNEL_LABELS, loadProfileDraft } from '../lib/profile';
import type { ProfilePageState } from './BusinessProfile';

export default function NewAnalysis() {
  const [profile] = useState(loadProfileDraft);
  if (!profile) {
    const state: ProfilePageState = {
      notice: 'Add your business profile first. It is sent with every analysis.',
    };
    return <Navigate to="/app/profile" replace state={state} />;
  }
  return <NewAnalysisForm profile={profile} />;
}

function NewAnalysisForm({ profile }: { profile: BusinessProfile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const policies = usePolicies();
  const run = useRunAnalysis();
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
      onSuccess: (analysis) => navigate(`/app/analyses/${analysis.request_id}`),
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

  if (run.isPending) return <AnalysisProgress />;

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
            title="The analysis could not finish"
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
              <div role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Loading your policies…
              </div>
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
          onClick={() => start({ business: profile, policy_ids: chosen })}
          disabled={chosen.length === 0}
        >
          Run analysis
        </Button>
        <p className="text-sm text-muted">
          {chosen.length === 0
            ? 'Choose at least one policy.'
            : `${plural(chosen.length, 'policy', 'policies')} selected. This can take a few minutes.`}
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
    ['Type', BUSINESS_TYPE_LABELS[profile.business_type]],
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

/** Shown while POST /analyses runs (plan §3.4). The API reports no progress, only the end. */
function AnalysisProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const elapsed = minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;

  return (
    <section
      aria-labelledby="progress-title"
      aria-busy="true"
      className="mx-auto max-w-xl rounded-card border border-line bg-white p-6 text-center sm:p-8"
    >
      <Spinner className="mx-auto h-10 w-10" />
      <h1 id="progress-title" className="mt-4 text-2xl font-extrabold">
        Analysing your coverage…
      </h1>
      <p className="mt-2 text-sm text-muted" role="timer" aria-live="off">
        Elapsed: {elapsed}
      </p>
      <div
        role="progressbar"
        aria-label="Analysis in progress"
        className="mx-auto mt-5 h-1.5 w-full overflow-hidden rounded-full bg-brand-tint"
      >
        <div className="h-full w-1/3 motion-safe:animate-[progress_1.6s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>

      <ol className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm" aria-label="Analysis steps">
        {AGENT_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand">
              {index + 1}
            </span>
            <span className="text-ink-heading">{STAGE_LABELS[stage]}</span>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm text-muted">
        The first three steps take seconds. Writing the report can take a few minutes when an AI
        model writes it.
      </p>
      <p className="mt-3 rounded-lg bg-brand-soft px-4 py-3 text-sm text-muted-strong">
        You can leave this page. The analysis keeps running and is saved to your{' '}
        <Link to="/app/analyses" className="font-semibold text-brand hover:underline">
          History
        </Link>{' '}
        when it finishes.
      </p>
    </section>
  );
}
