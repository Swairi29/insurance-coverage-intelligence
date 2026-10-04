import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { BusinessProfile, PolicyDocument } from '../api/types';
import { SESSION_KEYS } from '../lib/session';
import { policiesFixture } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

const location = () => screen.getByTestId('location').textContent;

function saveDraft(overrides: Partial<BusinessProfile> = {}) {
  const profile: BusinessProfile = {
    business_name: 'Test Bakery',
    business_type: 'bakery',
    employee_count: 8,
    equipment: ['Ovens'],
    ...overrides,
  };
  window.sessionStorage.setItem(SESSION_KEYS.profileDraft, JSON.stringify(profile));
}

async function openNewAnalysis() {
  loginAsDemoUser();
  const result = renderApp('/app/analyses/new');
  await screen.findByRole('heading', { name: 'New analysis' });
  return result;
}

const runButton = () => screen.getByRole('button', { name: 'Run analysis' });
const policyBox = (filename: string) =>
  screen.getByRole('checkbox', { name: new RegExp(filename) });

function manyPolicies(count: number): PolicyDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    ...policiesFixture[0],
    policy_id: `POL-many${i}`,
    filename: `policy-${i + 1}.pdf`,
  }));
}

describe('new analysis: setup', () => {
  it('sends a user without a profile to the profile page first', async () => {
    loginAsDemoUser();
    renderApp('/app/analyses/new');

    expect(
      await screen.findByText('Add your business profile first. It is sent with every analysis.'),
    ).toBeInTheDocument();
    expect(location()).toBe('/app/profile');
  });

  it('shows the profile summary and preselects the ready policies', async () => {
    saveDraft();
    await openNewAnalysis();

    const summary = screen.getByRole('complementary', { name: '2. Check your profile' });
    expect(summary).toHaveTextContent('Test Bakery');
    expect(summary).toHaveTextContent('Bakery');
    expect(summary).toHaveTextContent('Ovens');
    expect(within(summary).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/app/profile',
    );

    for (const policy of policiesFixture) {
      expect(
        await screen.findByRole('checkbox', { name: new RegExp(policy.filename) }),
      ).toBeChecked();
    }
    expect(runButton()).toBeEnabled();
    // Starting the AI pipeline is an AI action, so it gets the indigo button.
    expect(runButton()).toHaveClass('bg-ai');
  });

  it('allows at most 5 policies', async () => {
    saveDraft();
    server.use(http.get('*/api/v1/policies', () => HttpResponse.json(manyPolicies(7))));
    const { user } = await openNewAnalysis();

    await screen.findByRole('checkbox', { name: /policy-1\.pdf/ });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(5);
    expect(policyBox('policy-6.pdf')).toBeDisabled();
    expect(screen.getByText(/5 policies is the most one analysis can use/)).toBeInTheDocument();

    await user.click(policyBox('policy-1.pdf'));
    expect(policyBox('policy-6.pdf')).toBeEnabled();
    await user.click(policyBox('policy-6.pdf'));
    expect(policyBox('policy-6.pdf')).toBeChecked();
    expect(policyBox('policy-7.pdf')).toBeDisabled();
  });

  it('needs at least one policy to run', async () => {
    saveDraft();
    const { user } = await openNewAnalysis();

    for (const policy of policiesFixture) {
      await user.click(await screen.findByRole('checkbox', { name: new RegExp(policy.filename) }));
    }
    expect(runButton()).toBeDisabled();
    expect(screen.getByText('Choose at least one policy.')).toBeInTheDocument();
  });

  it('explains what to do when no policy is ready', async () => {
    saveDraft();
    server.use(http.get('*/api/v1/policies', () => HttpResponse.json([])));
    await openNewAnalysis();

    expect(await screen.findByText('No policies are ready yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload a policy PDF' })).toHaveAttribute(
      'href',
      '/app/policies',
    );
    expect(runButton()).toBeDisabled();
  });
});

describe('new analysis: agent workspace', () => {
  it('starts one run, opens the workspace and shows every agent finishing', async () => {
    saveDraft();
    let requests = 0;
    let sentBody: unknown;
    server.use(
      http.post('*/api/v1/analyses', async ({ request }) => {
        requests++;
        sentBody = await request.clone().json();
        return undefined; // fall through to the normal mock handler
      }),
    );
    const { user } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    await waitFor(() => expect(location()).toMatch(/^\/app\/analyses\/[0-9a-f]{32}\/progress$/));
    expect(await screen.findByRole('heading', { name: 'Analysis complete' })).toBeInTheDocument();
    expect(requests).toBe(1);
    expect(sentBody).toEqual({
      business: {
        business_name: 'Test Bakery',
        business_type: 'bakery',
        employee_count: 8,
        equipment: ['Ovens'],
      },
      policy_ids: policiesFixture.map((p) => p.policy_id),
    });
    // Kept so a failed run can be retried from the workspace.
    expect(JSON.parse(window.sessionStorage.getItem(SESSION_KEYS.lastAnalysis)!)).toEqual(sentBody);

    const agents = within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');
    expect(agents.map((a) => within(a).getByRole('heading').textContent)).toEqual([
      'Risk Profiling Agent',
      'Policy Intelligence Agent',
      'Coverage & Gap Analysis Agent',
      'Explanation & Recommendation Agent',
    ]);
    for (const agent of agents) expect(agent).toHaveTextContent('Done');

    // Hub and spoke: every message goes between the gateway and one agent.
    const log = screen.getByRole('log', { name: 'Messages between the gateway and the agents' });
    const lines = within(log).getAllByRole('listitem');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toHaveTextContent('Gateway → Risk agent');
    expect(lines[0]).toHaveTextContent('POST /api/v1/risk-profile');
    expect(lines[1]).toHaveTextContent('Risk agent → Gateway');
    for (const line of lines) expect(line).toHaveTextContent(/Gateway/);

    const requestId = location()!.split('/')[3];
    expect(screen.getByRole('link', { name: 'View results →' })).toHaveAttribute(
      'href',
      `/app/analyses/${requestId}`,
    );
  });

  it('shows the agent that is working while the run is in progress', async () => {
    // "Slow" names keep real timings in the mock, so the first agent is still running.
    saveDraft({ business_name: 'Slow Bakery' });
    const { user } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    expect(
      await screen.findByRole('heading', { name: 'Analysing your coverage…' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Step 1 of 4: Risk Profiling Agent')).toBeInTheDocument();
    const agents = within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');
    expect(agents[0]).toHaveTextContent('Running');
    expect(agents[1]).toHaveTextContent('Queued');
    expect(screen.getByRole('progressbar', { name: 'Analysis progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    const leaveNote = screen.getByText(/You can leave this page/).closest('p')!;
    expect(within(leaveNote).getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/app/analyses',
    );
  });
});

describe('new analysis: errors', () => {
  it.each([
    ['Down Ltd', 0, 'A required analysis service is not available.'],
    ['Timeout Ltd', 2, 'took too long to respond'],
    ['Broken Ltd', 1, 'could not complete the request'],
  ])(
    '"%s": marks agent %i as failed, skips the rest and offers a retry',
    async (name, failedIndex, message) => {
      saveDraft({ business_name: name });
      let requests = 0;
      server.use(
        http.post('*/api/v1/analyses', () => {
          requests++;
          return undefined;
        }),
      );
      const { user } = await openNewAnalysis();
      await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

      await user.click(runButton());

      expect(
        await screen.findByRole('heading', { name: 'The analysis could not finish' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      const agents = within(screen.getByRole('list', { name: 'Agents' })).getAllByRole('listitem');
      agents.forEach((agent, index) => {
        if (index < failedIndex) expect(agent).toHaveTextContent('Done');
        if (index === failedIndex) expect(agent).toHaveTextContent('Failed');
        if (index > failedIndex) expect(agent).toHaveTextContent('Skipped');
      });
      const firstRun = location();

      await user.click(screen.getByRole('button', { name: 'Retry analysis' }));
      await waitFor(() => expect(location()).not.toBe(firstRun));
      expect(location()).toMatch(/\/progress$/);
      expect(requests).toBe(2);
    },
  );

  it('refreshes the policy list after a 404 policy_not_found', async () => {
    saveDraft();
    let policyListLoads = 0;
    server.use(
      http.get('*/api/v1/policies', () => {
        policyListLoads++;
        return undefined;
      }),
      http.post('*/api/v1/analyses', () =>
        HttpResponse.json(
          {
            error: 'policy_not_found',
            message: 'One or more policies were not found for your account.',
          },
          { status: 404 },
        ),
      ),
    );
    const { user } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'One or more policies were not found for your account.',
    );
    await waitFor(() => expect(policyListLoads).toBe(2));
  });

  it('sends a 422 about the profile back to the profile page, next to the field', async () => {
    saveDraft({ employee_count: 300 });
    const { user } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    expect(
      await screen.findByText('Input should be less than or equal to 250'),
    ).toBeInTheDocument();
    expect(location()).toBe('/app/profile');
    expect(screen.getByLabelText('Number of employees')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a 422 that is not about the profile on this page', async () => {
    saveDraft();
    server.use(
      http.post('*/api/v1/analyses', () =>
        HttpResponse.json(
          {
            error: 'validation_error',
            message: 'The request could not be processed because some input was invalid.',
            details: [{ field: 'policy_ids', message: 'policy_ids must not contain duplicates.' }],
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'policy_ids must not contain duplicates.',
    );
    expect(location()).toBe('/app/analyses/new');
  });
});
