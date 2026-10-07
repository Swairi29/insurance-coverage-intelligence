import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStartScenarioAnalysis } from '../api/scenarioAnalyses';
import { MAX_POLICIES_PER_ANALYSIS, usePolicies } from '../api/policies';
import { isApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { rememberScenarioAnalysis } from '../lib/scenarioHistory';

export default function ScenarioAnalysis() {
  const navigate = useNavigate();
  const policies = usePolicies();
  const run = useStartScenarioAnalysis();
  const [scenario, setScenario] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const ready = policies.data?.filter((policy) => policy.status === 'ready') ?? [];
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < MAX_POLICIES_PER_ANALYSIS
          ? [...current, id]
          : current,
    );

  const start = () =>
    run.mutate(
      { scenario, policy_ids: selected },
      {
        onSuccess: (progress) => {
          rememberScenarioAnalysis(progress.request_id, progress.created_at);
          navigate(`/app/analyses/${progress.request_id}/running?source=scenario`, {
            state: { analysisLabel: 'Scenario analysis' },
          });
        },
      },
    );

  return (
    <section className="mx-auto max-w-4xl">
      <Link to="/app/analyses/new" className="text-sm font-semibold text-blue-700 hover:underline">
        ← New Analysis methods
      </Link>
      <PageHeader
        eyebrow="New analysis · scenario input"
        title="Describe a Scenario"
        description="Describe your business, situation, or risk in your own words. This follows the same four-agent analysis as a business profile."
      />

      {!reviewing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setReviewing(true);
          }}
          className="space-y-5"
        >
          <label className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <span className="font-bold text-slate-900">Describe your business or situation</span>
            <span className="mt-1 block text-xs text-slate-500">
              Include activities, equipment, employees, location, customers, or concerns.
            </span>
            <textarea
              required
              minLength={10}
              maxLength={4000}
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              rows={7}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm leading-6 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Describe your business, activities, equipment, employees, location, customers, or concerns..."
            />
            <span className="mt-2 block text-right text-xs text-slate-400">
              {scenario.length} / 4000
            </span>
          </label>
          <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <legend className="px-1 font-bold text-slate-900">Select policies</legend>
            <p className="mb-4 text-xs text-slate-500">
              Choose up to {MAX_POLICIES_PER_ANALYSIS} ready policy documents.
            </p>
            {policies.isError && (
              <ErrorMessage
                title="Policies could not be loaded"
                error={policies.error}
                onRetry={() => void policies.refetch()}
              />
            )}
            {ready.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                No ready policies are available.{' '}
                <Link to="/app/policies" className="font-bold underline">
                  Upload a policy first.
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {ready.map((policy) => (
                  <li key={policy.policy_id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition ${selected.includes(policy.policy_id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={selected.includes(policy.policy_id)}
                        disabled={
                          !selected.includes(policy.policy_id) &&
                          selected.length >= MAX_POLICIES_PER_ANALYSIS
                        }
                        onChange={() => toggle(policy.policy_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">
                          {policy.filename}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {policy.page_count} pages · Ready
                        </span>
                      </span>
                      <span className="text-xs font-medium text-slate-400">PDF</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Scenario input · {selected.length} policies selected
            </p>
            <Button
              type="submit"
              variant="ai"
              disabled={scenario.trim().length < 10 || selected.length === 0}
            >
              Review analysis <span aria-hidden="true">→</span>
            </Button>
          </div>
        </form>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
                Final review
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Review analysis</h2>
            </div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              Scenario input
            </span>
          </div>
          <dl className="mt-6 grid gap-5 sm:grid-cols-[140px_1fr]">
            <dt className="text-sm font-semibold text-slate-500">Scenario summary</dt>
            <dd className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">
              {scenario}
            </dd>
            <dt className="text-sm font-semibold text-slate-500">Policies selected</dt>
            <dd className="text-sm font-semibold text-slate-900">
              {selected.length} of {MAX_POLICIES_PER_ANALYSIS}
              <ul className="mt-2 flex flex-wrap gap-2">
                {ready
                  .filter((policy) => selected.includes(policy.policy_id))
                  .map((policy) => (
                    <li
                      key={policy.policy_id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    >
                      {policy.filename}
                    </li>
                  ))}
              </ul>
            </dd>
          </dl>
          {run.isError && (
            <div className="mt-5">
              <ErrorMessage
                title={
                  isApiError(run.error) && run.error.stage
                    ? `${run.error.stage.replaceAll('_', ' ')} failed`
                    : 'Analysis could not start'
                }
                error={run.error}
              />
            </div>
          )}
          <div className="mt-7 flex flex-wrap justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setReviewing(false)}
              disabled={run.isPending}
            >
              Back to edit
            </Button>
            <Button variant="ai" onClick={start} loading={run.isPending}>
              Start analysis <span aria-hidden="true">→</span>
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
