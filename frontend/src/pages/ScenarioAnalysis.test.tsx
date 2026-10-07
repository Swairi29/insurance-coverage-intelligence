import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

it('submits a scenario with selected policies and displays identified and final results', async () => {
  const user = userEvent.setup();
  let submitted: unknown;
  loginAsDemoUser();
  server.use(
    http.post('/api/v1/scenario-analyses', async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json({
        request_id: 'scenario-1',
        state: 'complete',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:01Z',
        error: null,
        stages: ['risk_profile', 'policy_evidence', 'coverage', 'report'].map((stage) => ({
          stage,
          agent: stage,
          endpoint: `POST /api/v1/${stage}`,
          state: 'done',
          sent: null,
          received: 'done',
          started_at: null,
          finished_at: null,
          duration_ms: 1,
        })),
      });
    }),
    http.get('/api/v1/scenario-analyses/:id/status', () =>
      HttpResponse.json({
        request_id: 'scenario-1',
        state: 'complete',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:01Z',
        error: null,
        stages: ['risk_profile', 'policy_evidence', 'coverage', 'report'].map((stage) => ({
          stage,
          agent: stage,
          endpoint: `POST /api/v1/${stage}`,
          state: 'done',
          sent: null,
          received: 'done',
          started_at: null,
          finished_at: null,
          duration_ms: 1,
        })),
      }),
    ),
    http.get('/api/v1/scenario-analyses/:id', () => {
      return HttpResponse.json({
        request_id: 'scenario-1',
        business_id: 'B-demo',
        status: 'complete',
        created_at: '2026-01-01T00:00:00Z',
        risks: [
          {
            risk_id: 'oven_fire',
            name: 'Oven fire',
            category: 'property',
            description: 'Commercial ovens can cause fire.',
            reason: 'The scenario mentions commercial ovens.',
            confidence: 0.9,
            evidence: [{ text: 'commercial ovens', source: 'scenario' }],
          },
        ],
        llm_used: true,
        coverage: {
          assessments: [
            {
              risk_id: 'OVEN_FIRE',
              risk_name: 'Oven fire',
              status: 'conditional',
              reason: 'Subject to a fire safety condition.',
            },
          ],
        },
        report: {
          summary: { headline: 'Review fire conditions.' },
          findings: [
            {
              title: 'Oven fire',
              explanation: 'Check the fire safety wording.',
              recommendation: 'Confirm safeguards with your insurer.',
            },
          ],
        },
        warnings: [],
        stage_ms: {},
      });
    }),
  );
  renderApp('/app/scenario-analysis');
  await user.type(
    await screen.findByLabelText('Your scenario'),
    'Bakery uses commercial ovens with five staff.',
  );
  const policy = await screen.findByRole('checkbox', { name: /sunrise-business-pack/i });
  await user.click(policy);
  await user.click(screen.getByRole('button', { name: 'Start Scenario Analysis' }));
  expect(await screen.findByRole('heading', { name: 'Identified risks (1)' })).toBeInTheDocument();
  expect(screen.getByText(/Risk identification: Complete/)).toBeInTheDocument();
  expect(screen.getByText('The scenario mentions commercial ovens.')).toBeInTheDocument();
  expect(screen.getByText('Review fire conditions.')).toBeInTheDocument();
  expect(submitted).toEqual({
    scenario: 'Bakery uses commercial ovens with five staff.',
    policy_ids: [expect.any(String)],
  });
});

it('shows a safe error when scenario risk identification fails', async () => {
  const user = userEvent.setup();
  loginAsDemoUser();
  server.use(
    http.post('/api/v1/scenario-analyses', () =>
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
  renderApp('/app/scenario-analysis');
  await user.type(
    await screen.findByLabelText('Your scenario'),
    'A bakery uses commercial ovens every day.',
  );
  await user.click(await screen.findByRole('checkbox', { name: /sunrise-business-pack/i }));
  await user.click(screen.getByRole('button', { name: 'Start Scenario Analysis' }));
  expect(
    await screen.findByText(
      'Scenario risk identification could not be completed. Please try again.',
    ),
  ).toBeInTheDocument();
});
