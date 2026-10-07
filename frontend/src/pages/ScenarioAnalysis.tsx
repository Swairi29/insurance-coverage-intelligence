import { useState } from 'react';
import {
  useScenarioAnalysis,
  useScenarioAnalysisStatus,
  useStartScenarioAnalysis,
} from '../api/scenarioAnalyses';
import { MAX_POLICIES_PER_ANALYSIS, usePolicies } from '../api/policies';
import { isApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/ui/Button';

const STAGES = [
  ['risk_profile', 'Risk identification'],
  ['policy_evidence', 'Policy evidence'],
  ['coverage', 'Coverage analysis'],
  ['report', 'Explanation/report'],
] as const;

export default function ScenarioAnalysis() {
  const policies = usePolicies();
  const run = useStartScenarioAnalysis();
  const status = useScenarioAnalysisStatus(run.data?.request_id);
  const terminal = status.data?.state === 'complete' || status.data?.state === 'partial';
  const result = useScenarioAnalysis(run.data?.request_id, terminal);
  const active = run.isPending || status.data?.state === 'running';
  const [scenario, setScenario] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const ready = policies.data?.filter((policy) => policy.status === 'ready') ?? [];
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < MAX_POLICIES_PER_ANALYSIS
          ? [...current, id]
          : current,
    );

  return (
    <section className="max-w-4xl">
      <h1 className="text-2xl font-extrabold">Scenario Analysis</h1>
      <p className="mt-2 text-sm text-muted">
        Describe a business or insurance scenario and check it against your uploaded policies.
      </p>
      <form
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate({ scenario, policy_ids: selected });
        }}
      >
        <label className="block rounded-card border border-line bg-white p-5">
          <span className="font-bold">Your scenario</span>
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            rows={5}
            className="mt-3 w-full rounded-control border border-line p-3 text-sm"
            placeholder="Describe your business, activities, equipment, and concerns..."
          />
        </label>
        <fieldset className="rounded-card border border-line bg-white p-5">
          <legend className="px-1 font-bold">
            Select policies (up to {MAX_POLICIES_PER_ANALYSIS})
          </legend>
          {policies.isError && (
            <ErrorMessage
              title="Policies could not be loaded"
              error={policies.error}
              onRetry={() => void policies.refetch()}
            />
          )}
          {ready.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No ready policies are available. Upload a policy first.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ready.map((policy) => (
                <li key={policy.policy_id}>
                  <label className="flex gap-3 rounded-lg border border-line p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(policy.policy_id)}
                      disabled={
                        !selected.includes(policy.policy_id) &&
                        selected.length >= MAX_POLICIES_PER_ANALYSIS
                      }
                      onChange={() => toggle(policy.policy_id)}
                    />
                    {policy.filename}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <Button
          type="submit"
          variant="ai"
          loading={active}
          disabled={scenario.trim().length < 10 || selected.length === 0 || active}
        >
          Start Scenario Analysis
        </Button>
      </form>
      {run.data && status.data && (
        <section aria-live="polite" className="mt-6 rounded-card border border-line bg-white p-5">
          <h2 className="font-bold">
            {status.data.state === 'running'
              ? 'Scenario Analysis in progress'
              : 'Scenario Analysis progress'}
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {STAGES.map(([key, label]) => {
              const stage = status.data?.stages.find((item) => item.stage === key);
              const state = stage?.state ?? 'queued';
              return (
                <li key={key} aria-current={state === 'running' ? 'step' : undefined}>
                  {label}:{' '}
                  {state === 'done'
                    ? 'Complete'
                    : state === 'running'
                      ? 'In progress'
                      : state === 'failed'
                        ? 'Failed'
                        : state === 'skipped'
                          ? 'Skipped'
                          : 'Waiting'}
                  {stage?.received ? ` — ${stage.received}` : ''}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {run.isError && (
        <div className="mt-6">
          <ErrorMessage
            title={
              isApiError(run.error) && run.error.stage
                ? `${run.error.stage.replaceAll('_', ' ')} failed`
                : 'Scenario Analysis failed'
            }
            error={run.error}
          />
        </div>
      )}
      {status.data?.state === 'failed' && status.data.error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {status.data.error.message}
        </p>
      )}
      {result.isError && (
        <div className="mt-6">
          <ErrorMessage
            title="Scenario Analysis results could not be loaded"
            error={result.error}
            onRetry={() => void result.refetch()}
          />
        </div>
      )}
      {result.data && (
        <article className="mt-8 space-y-6">
          <h2 className="text-xl font-bold">Scenario Analysis results</h2>
          {result.data.warnings.map((warning) => (
            <p key={warning} className="rounded-lg bg-amber-50 p-3 text-sm">
              {warning}
            </p>
          ))}
          <section className="rounded-card border border-line bg-white p-5">
            <h3 className="font-bold">Identified risks ({result.data.risks.length})</h3>
            {result.data.risks.length ? (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {result.data.risks.map((risk) => (
                  <li key={risk.risk_id} className="rounded-lg border border-line p-4">
                    <h4 className="font-semibold">{risk.name}</h4>
                    <p className="mt-2 text-sm">{risk.reason}</p>
                    <p className="mt-2 text-xs text-muted">
                      {risk.category} · confidence {Math.round(risk.confidence * 100)}%
                    </p>
                    {risk.evidence.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs">
                        {risk.evidence.map((item, index) => (
                          <li key={`${item.source}-${index}`}>{item.text}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No risks were identified.</p>
            )}
          </section>
          <section className="rounded-card border border-line bg-white p-5">
            <h3 className="font-bold">Coverage analysis</h3>
            <ul className="mt-3 space-y-3">
              {result.data.coverage.assessments.map((item) => (
                <li key={item.risk_id} className="border-b border-line pb-3">
                  <strong>{item.risk_name}</strong> · {item.status}
                  <p className="text-sm">{item.reason}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-card border border-line bg-white p-5">
            <h3 className="font-bold">Explanation and report</h3>
            {result.data.report ? (
              <p className="mt-2 text-sm">{result.data.report.summary.headline}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                The report could not be generated; coverage results are shown above.
              </p>
            )}
            {result.data.report?.findings.map((finding, index) => (
              <div key={`${finding.title}-${index}`} className="mt-3">
                <h4 className="font-semibold">{finding.title}</h4>
                <p className="text-sm">{finding.explanation}</p>
                <p className="text-sm">{finding.recommendation}</p>
              </div>
            ))}
          </section>
        </article>
      )}
    </section>
  );
}
