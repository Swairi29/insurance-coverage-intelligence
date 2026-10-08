import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStartAnalysis } from '../api/analyses';
import { useBusinessProfiles } from '../api/businessProfiles';
import { isApiError } from '../api/client';
import { MAX_POLICIES_PER_ANALYSIS, policiesQueryKey, usePolicies } from '../api/policies';
import type {
  AnalysisRequest,
  BusinessProfile,
  PolicyDocument,
  SavedBusinessProfile,
} from '../api/types';
import { ErrorMessage } from '../components/ErrorMessage';
import { DocumentIcon, SparkleIcon } from '../components/icons';
import { PolicyUploader } from '../components/PolicyUploader';
import { Button } from '../components/ui/Button';
import { buttonClasses } from '../components/ui/buttonClasses';
import { SkeletonList } from '../components/ui/Skeleton';
import { formatDateTime, plural } from '../lib/format';
import { rememberAnalysisRequest } from '../lib/analysisRequests';
import {
  ANALYSIS_STEPS,
  SALES_CHANNEL_LABELS,
  analysisFlowPath,
  businessTypeLabel,
  profileFormPath,
  type AnalysisStep,
} from '../lib/profile';
import type { ProfilePageState } from './BusinessProfile';

export default function NewAnalysis({ profileFlow = false }: { profileFlow?: boolean }) {
  return profileFlow ? <BusinessProfileAnalysis /> : <AnalysisMethodChooser />;
}

function AnalysisMethodChooser() {
  return (
    <section className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">New analysis</p>
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
            Pick one of your saved businesses (or add one), choose the policies, and run.
          </p>
          <Link
            to={analysisFlowPath()}
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

// --- the business profile flow: 1 business → 2 policies → 3 review and run -------------------
//
// Everything chosen is kept in the URL (?profile=…&step=…&policies=…), so the browser's Back
// button goes back one step and a reload keeps the choices.

const STEP_LABELS: Record<AnalysisStep, string> = {
  business: 'Business',
  policies: 'Policies',
  review: 'Review and run',
};

/** The chosen policy ids: from the URL, else the first 5 ready policies. */
function chosenPolicies(params: URLSearchParams, ready: PolicyDocument[]): string[] {
  const fromUrl = params.get('policies');
  if (fromUrl === null) return ready.slice(0, MAX_POLICIES_PER_ANALYSIS).map((p) => p.policy_id);
  return fromUrl.split(',').filter(Boolean).slice(0, MAX_POLICIES_PER_ANALYSIS);
}

function BusinessProfileAnalysis() {
  const [params, setParams] = useSearchParams();
  const profiles = useBusinessProfiles();
  const policies = usePolicies();

  const profileId = params.get('profile');
  const chosenProfile = profiles.data?.find((p) => p.profile_id === profileId) ?? null;
  const requested = params.get('step');
  // Steps 2 and 3 need a business that still exists; otherwise start at step 1.
  const later = requested === 'policies' || requested === 'review' ? requested : null;
  const step: AnalysisStep = chosenProfile && later ? later : 'business';
  // While the businesses load, the step indicator trusts the URL rather than flashing step 1.
  const shownStep: AnalysisStep = profiles.isPending ? (later ?? 'business') : step;

  const ready = policies.data?.filter((p) => p.status === 'ready') ?? [];
  const readyIds = new Set(ready.map((p) => p.policy_id));
  // Only ready policies the user still has can be sent.
  const chosen = chosenPolicies(params, ready).filter((id) => readyIds.has(id));

  /** Moves to another step: a new history entry, so Back returns to this one. */
  const goTo = (next: AnalysisStep, change: { profile?: string; resetPolicies?: boolean } = {}) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (change.profile) updated.set('profile', change.profile);
      if (change.resetPolicies) updated.delete('policies');
      if (next === 'business') updated.delete('step');
      else updated.set('step', next);
      return updated;
    });

  /** Changes the policy choice in place (no history entry per tick). */
  const setChosen = (update: (current: string[]) => string[]) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('policies', update(chosenPolicies(current, ready)).join(','));
        return updated;
      },
      { replace: true },
    );

  return (
    <section className="max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
        Business profile analysis
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">New analysis</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Pick the business, choose the policies to check, then run. The analysis identifies your
        business risks, finds the matching policy wording and explains any potential gaps.
      </p>

      <ol aria-label="Steps" className="mt-6 grid grid-cols-3 gap-2 text-sm">
        {ANALYSIS_STEPS.map((name, index) => {
          const current = name === shownStep;
          const done = ANALYSIS_STEPS.indexOf(shownStep) > index;
          return (
            <li
              key={name}
              aria-current={current ? 'step' : undefined}
              className={`rounded-lg border px-3 py-2 ${
                current
                  ? 'border-brand bg-brand-soft font-bold text-brand'
                  : done
                    ? 'border-line bg-white text-ink-heading'
                    : 'border-line bg-white text-muted'
              }`}
            >
              <span className="block text-xs font-semibold">Step {index + 1}</span>
              {STEP_LABELS[name]}
              {done && <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {profiles.isPending ? (
          <SkeletonList label="Loading your businesses" rows={2} />
        ) : profiles.isError ? (
          <ErrorMessage
            title="Your businesses could not be loaded"
            error={profiles.error}
            onRetry={() => void profiles.refetch()}
          />
        ) : step === 'business' || !chosenProfile ? (
          <ChooseBusiness
            profiles={profiles.data}
            initial={profileId}
            onContinue={(id) => goTo('policies', { profile: id })}
          />
        ) : step === 'review' && policies.isPending ? (
          <SkeletonList label="Loading your policies" rows={2} />
        ) : step === 'review' && policies.isError ? (
          <ErrorMessage
            title="Your policies could not be loaded"
            error={policies.error}
            onRetry={() => void policies.refetch()}
          />
        ) : step === 'policies' ? (
          <ChoosePolicies
            policies={policies}
            chosen={chosen}
            onToggle={(policyId) =>
              setChosen((current) =>
                current.includes(policyId)
                  ? current.filter((id) => id !== policyId)
                  : [...current, policyId],
              )
            }
            onUploaded={(policyId) =>
              setChosen((current) =>
                current.length < MAX_POLICIES_PER_ANALYSIS && !current.includes(policyId)
                  ? [...current, policyId]
                  : current,
              )
            }
            onBack={() => goTo('business')}
            onContinue={() => goTo('review')}
          />
        ) : (
          <ReviewAndRun
            saved={chosenProfile}
            policies={ready.filter((p) => chosen.includes(p.policy_id))}
            onChangeBusiness={() => goTo('business')}
            onChangePolicies={() => goTo('policies')}
            // Back to step 2, with the refreshed list's default choice.
            onPoliciesGone={() => goTo('policies', { resetPolicies: true })}
          />
        )}
      </div>
    </section>
  );
}

// --- step 1 ------------------------------------------------------------------------------

function ChooseBusiness({
  profiles,
  initial,
  onContinue,
}: {
  profiles: SavedBusinessProfile[];
  initial: string | null;
  onContinue: (profileId: string) => void;
}) {
  // The business from the URL, else the most recently changed one.
  const [picked, setPicked] = useState(
    () => profiles.find((p) => p.profile_id === initial)?.profile_id ?? profiles[0]?.profile_id,
  );

  if (profiles.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong bg-white px-6 py-10 text-center">
        <h2 className="font-bold text-ink-heading">Add your business first</h2>
        <p className="mt-1 text-sm text-muted">
          Its details are saved to your account, so next time you can just pick it.
        </p>
        <Link
          to={profileFormPath(undefined, { forAnalysis: true })}
          className={`mt-5 ${buttonClasses('primary')}`}
        >
          Add business profile
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="choose-business"
      className="rounded-card border border-line bg-white p-5 sm:p-6"
    >
      <h2 id="choose-business" className="text-lg font-bold">
        Which business is this analysis for?
      </h2>
      <p className="mt-1 text-sm text-muted">
        Pick one of your saved businesses. If it is not listed, add it.
      </p>
      <fieldset className="mt-4">
        <legend className="sr-only">Saved businesses</legend>
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((saved) => {
            const { profile } = saved;
            const checked = saved.profile_id === picked;
            const place = [profile.location?.city, profile.location?.country]
              .filter(Boolean)
              .join(', ');
            return (
              <li key={saved.profile_id}>
                <label
                  className={`flex h-full cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                    checked ? 'border-brand bg-brand-soft' : 'border-line bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="business"
                    value={saved.profile_id}
                    checked={checked}
                    onChange={() => setPicked(saved.profile_id)}
                    className="mt-1 h-4 w-4 accent-brand"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink-heading">
                      {profile.business_name}
                    </span>
                    <span className="block text-xs text-muted">
                      {businessTypeLabel(profile)}
                      {place && ` · ${place}`}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          <li>
            <Link
              to={profileFormPath(undefined, { forAnalysis: true })}
              className="flex h-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-brand hover:border-brand hover:bg-brand-soft"
            >
              <span aria-hidden="true">+</span> Add a new business
            </Link>
          </li>
        </ul>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button disabled={!picked} onClick={() => picked && onContinue(picked)}>
          Continue to policies <span aria-hidden="true">→</span>
        </Button>
        {picked && (
          <Link
            to={profileFormPath(picked, { forAnalysis: true })}
            className="text-sm font-semibold text-brand hover:underline"
          >
            Edit the chosen business
          </Link>
        )}
      </div>
    </section>
  );
}

// --- step 2 ------------------------------------------------------------------------------

function ChoosePolicies({
  policies,
  chosen,
  onToggle,
  onUploaded,
  onBack,
  onContinue,
}: {
  policies: ReturnType<typeof usePolicies>;
  chosen: string[];
  onToggle: (policyId: string) => void;
  onUploaded: (policyId: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const atLimit = chosen.length >= MAX_POLICIES_PER_ANALYSIS;
  const hasReady = policies.data?.some((p) => p.status === 'ready') ?? false;

  return (
    <section
      aria-labelledby="choose-policies"
      className="rounded-card border border-line bg-white p-5 sm:p-6"
    >
      <h2 id="choose-policies" className="text-lg font-bold">
        Which policies should be checked?
      </h2>
      <p className="mt-1 text-sm text-muted">
        Up to {MAX_POLICIES_PER_ANALYSIS} policies. Only policies that are ready can be used. A
        policy you upload here is ticked for you.
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
        ) : !hasReady ? (
          <div className="rounded-lg bg-brand-soft px-4 py-5 text-sm">
            <p className="font-semibold text-ink-heading">No policies are ready yet</p>
            <p className="mt-1 text-muted">Upload a policy PDF below to continue.</p>
          </div>
        ) : (
          <PolicyChoices
            policies={policies.data}
            chosen={chosen}
            atLimit={atLimit}
            onToggle={onToggle}
          />
        )}
      </div>

      <div className="mt-5">
        <PolicyUploader
          compact
          onUploaded={(policy) => policy.status === 'ready' && onUploaded(policy.policy_id)}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          <span aria-hidden="true">←</span> Back
        </Button>
        <Button disabled={chosen.length === 0} onClick={onContinue}>
          Continue to review <span aria-hidden="true">→</span>
        </Button>
        <p className="text-sm text-muted">
          {chosen.length === 0
            ? 'Choose at least one policy.'
            : `${plural(chosen.length, 'policy', 'policies')} selected.`}
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

// --- step 3 ------------------------------------------------------------------------------

function ReviewAndRun({
  saved,
  policies,
  onChangeBusiness,
  onChangePolicies,
  onPoliciesGone,
}: {
  saved: SavedBusinessProfile;
  policies: PolicyDocument[];
  onChangeBusiness: () => void;
  onChangePolicies: () => void;
  /** A chosen policy no longer exists for this account. */
  onPoliciesGone: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const run = useStartAnalysis();
  const [lastRequest, setLastRequest] = useState<AnalysisRequest | null>(null);
  const profile = saved.profile;

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
          void queryClient.invalidateQueries({ queryKey: policiesQueryKey });
          onPoliciesGone();
        }
        // A 422 about the profile: fix it in the saved profile, next to the right fields.
        if (error.status === 422 && error.details.some((d) => d.field.startsWith('business.'))) {
          const state: ProfilePageState = { serverErrors: error.details };
          navigate(profileFormPath(saved.profile_id, { forAnalysis: true }), { state });
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {run.isError && (
        <ErrorMessage
          title="The analysis could not start"
          error={run.error}
          onRetry={lastRequest ? () => start(lastRequest) : undefined}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="review-business"
          className="rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="review-business" className="text-lg font-bold">
              Business
            </h2>
            <button
              type="button"
              onClick={onChangeBusiness}
              className="text-sm font-semibold text-brand hover:underline"
            >
              Change business
            </button>
          </div>
          <ProfileSummary profile={profile} />
        </section>

        <section
          aria-labelledby="review-policies"
          className="rounded-card border border-line bg-white p-5 sm:p-6"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="review-policies" className="text-lg font-bold">
              Policies
            </h2>
            <button
              type="button"
              onClick={onChangePolicies}
              className="text-sm font-semibold text-brand hover:underline"
            >
              Change policies
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm" aria-label="Chosen policies">
            {policies.map((policy) => (
              <li key={policy.policy_id} className="flex items-start gap-2">
                <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 break-words font-medium text-ink-heading">
                  {policy.filename}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onChangePolicies}>
          <span aria-hidden="true">←</span> Back
        </Button>
        <Button
          variant="ai"
          onClick={() => start({ business: profile, policy_ids: policies.map((p) => p.policy_id) })}
          disabled={policies.length === 0}
          loading={run.isPending}
        >
          <SparkleIcon className="h-4 w-4" />
          Start analysis
        </Button>
        <p className="text-sm text-muted">
          {policies.length === 0
            ? 'Choose at least one policy.'
            : `${plural(policies.length, 'policy', 'policies')} selected. You can watch each agent work.`}
        </p>
      </div>
    </div>
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
