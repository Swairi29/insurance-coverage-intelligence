import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AnalysisProgress, ScenarioAnalysisResponse, StageProgress } from '../api/types';
import { allStatusesAnalysis } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

const SCENARIO = 'Bakery uses commercial ovens with five staff.';
const location = () => screen.getByTestId('location').textContent;

function progress(
  requestId: string,
  state: AnalysisProgress['state'],
  error: AnalysisProgress['error'] = null,
): AnalysisProgress {
  const stages = (['risk_profile', 'policy_evidence', 'coverage', 'report'] as const).map(
    (stage, index): StageProgress => ({
      stage,
      agent: stage,
      endpoint: `POST /api/v1/${stage}`,
      state: state === 'failed' ? (index === 0 ? 'failed' : 'skipped') : 'done',
      sent: null,
      received: state === 'failed' ? null : 'done',
      started_at: null,
      finished_at: null,
      duration_ms: 1,
    }),
  );
  return {
    schema_version: '1.0',
    request_id: requestId,
    state,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:01Z',
    error,
    stages,
  };
}

/** A scenario result with the same coverage and report as the all-statuses fixture. */
const scenarioResult = (requestId: string): ScenarioAnalysisResponse => ({
  request_id: requestId,
  business_id: allStatusesAnalysis.business_id,
  status: 'complete',
  created_at: '2026-01-01T00:00:01Z',
  risks: allStatusesAnalysis.risk_profile.risks.map((risk) => ({
    risk_id: risk.risk_id,
    name: risk.name,
    category: risk.category,
    description: risk.reason,
    reason: risk.reason,
    confidence: 0.9,
    evidence: [{ text: 'commercial ovens', source: 'scenario' }],
  })),
  llm_used: true,
  coverage: allStatusesAnalysis.coverage,
  report: allStatusesAnalysis.report,
  warnings: [],
  stage_ms: {},
});

/** Write the scenario, pick a policy, review it and start the run. */
async function startScenario(user: ReturnType<typeof userEvent.setup>) {
  renderApp('/app/analyses/new/scenario');
  await user.type(await screen.findByRole('textbox'), SCENARIO);
  await user.click(await screen.findByRole('checkbox', { name: /sunrise-business-pack/i }));
  await user.click(screen.getByRole('button', { name: /Review analysis/ }));
  expect(screen.getByRole('heading', { name: 'Review analysis' })).toBeInTheDocument();
  expect(screen.getByText(SCENARIO)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Start analysis/ }));
}

it('reviews and starts a scenario, then shows the workspace and the report', async () => {
  const user = userEvent.setup();
  let submitted: unknown;
  loginAsDemoUser();
  server.use(
    http.post('*/api/v1/scenario-analyses', async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json(progress('scenario-1', 'running'), { status: 202 });
    }),
    http.get('*/api/v1/scenario-analyses/:id/status', () =>
      HttpResponse.json(progress('scenario-1', 'complete')),
    ),
    http.get('*/api/v1/scenario-analyses/:id', () =>
      HttpResponse.json(scenarioResult('scenario-1')),
    ),
  );

  await startScenario(user);

  expect(submitted).toEqual({ scenario: SCENARIO, policy_ids: [expect.any(String)] });
  expect(await screen.findByRole('heading', { name: 'Analysis complete' })).toBeInTheDocument();
  expect(location()).toBe('/app/analyses/scenario-1/progress?source=scenario');
  // The run is labelled with what the user wrote.
  expect(screen.getByText(SCENARIO)).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'View results →' }));
  expect(
    await screen.findByRole('heading', { name: 'Scenario analysis report', level: 1 }),
  ).toBeInTheDocument();
  const firstFinding = allStatusesAnalysis.report!.findings[0];
  expect(screen.getByRole('heading', { name: firstFinding.title })).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Risks' }));
  const risks = screen.getByRole('tabpanel', { name: 'Risks' });
  expect(
    within(risks).getByText(allStatusesAnalysis.risk_profile.risks[0].name),
  ).toBeInTheDocument();
});

it('shows a safe error when scenario risk identification fails', async () => {
  const user = userEvent.setup();
  loginAsDemoUser();
  server.use(
    http.post('*/api/v1/scenario-analyses', () =>
      HttpResponse.json(
        {
          error: 'scenario_risk_failed',
          message: 'Scenario risk identification could not be completed. Please try again.',
          stage: 'risk_profile',
          request_id: 'scenario-failed',
        },
        { status: 502 },
      ),
    ),
  );

  await startScenario(user);

  expect(
    await screen.findByText(
      'Scenario risk identification could not be completed. Please try again.',
    ),
  ).toBeInTheDocument();
  // Still on the review step, so the user can go back and edit.
  expect(screen.getByRole('button', { name: 'Back to edit' })).toBeInTheDocument();
});

it('retries a failed scenario run with the same scenario and policies', async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  loginAsDemoUser();
  server.use(
    http.post('*/api/v1/scenario-analyses', async ({ request }) => {
      bodies.push(await request.json());
      const id = bodies.length === 1 ? 'scenario-failed' : 'scenario-retry';
      return HttpResponse.json(progress(id, 'running'), { status: 202 });
    }),
    http.get('*/api/v1/scenario-analyses/:id/status', ({ params }) =>
      HttpResponse.json(
        params.id === 'scenario-failed'
          ? progress('scenario-failed', 'failed', {
              error: 'agent_unavailable',
              message: 'A required analysis service is not available.',
              stage: 'risk_profile',
              request_id: 'scenario-failed',
            })
          : progress('scenario-retry', 'complete'),
      ),
    ),
  );

  await startScenario(user);
  expect(
    await screen.findByRole('heading', { name: 'The analysis could not finish' }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Retry analysis' }));

  expect(await screen.findByRole('heading', { name: 'Analysis complete' })).toBeInTheDocument();
  expect(location()).toBe('/app/analyses/scenario-retry/progress?source=scenario');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});
