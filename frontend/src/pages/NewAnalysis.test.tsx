import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { BusinessProfile, PolicyDocument, SavedBusinessProfile } from '../api/types';
import { analysisRequestFor } from '../lib/analysisRequests';
import { db } from '../mocks/db';
import { policiesFixture } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

const location = () => screen.getByTestId('location').textContent;

const PROFILE_ID = 'BP-test000000000001';

function savedProfile(overrides: Partial<BusinessProfile> = {}, profileId = PROFILE_ID) {
  const saved: SavedBusinessProfile = {
    profile_id: profileId,
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
    profile: {
      business_name: 'Test Bakery',
      business_type: 'bakery',
      employee_count: 8,
      equipment: ['Ovens'],
      ...overrides,
    },
  };
  return saved;
}

/** The account has exactly these saved businesses. */
function saveProfiles(...profiles: SavedBusinessProfile[]) {
  db.businessProfiles = profiles;
}

async function openStep(query: string) {
  loginAsDemoUser();
  const result = renderApp(`/app/analyses/new/profile${query}`);
  await screen.findByRole('heading', { name: 'New analysis' });
  return result;
}

/** Step 3 for the saved "Test Bakery", with the default policies. */
async function openReview(overrides: Partial<BusinessProfile> = {}) {
  saveProfiles(savedProfile(overrides));
  const result = await openStep(`?profile=${PROFILE_ID}&step=review`);
  await screen.findByRole('list', { name: 'Chosen policies' });
  return result;
}

const currentStep = () =>
  within(screen.getByRole('list', { name: 'Steps' }))
    .getAllByRole('listitem')
    .find((item) => item.getAttribute('aria-current') === 'step')!.textContent;
const runButton = () => screen.getByRole('button', { name: 'Start analysis' });
const policyBox = (filename: string) =>
  screen.getByRole('checkbox', { name: new RegExp(filename) });

function manyPolicies(count: number): PolicyDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    ...policiesFixture[0],
    policy_id: `POL-many${i}`,
    filename: `policy-${i + 1}.pdf`,
  }));
}

describe('new analysis: step 1, the business', () => {
  it('asks a user without a saved business to add one, and comes back here after', async () => {
    saveProfiles();
    await openStep('');

    expect(await screen.findByText('Add your business first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add business profile' })).toHaveAttribute(
      'href',
      '/app/businesses/new?next=analysis',
    );
    expect(currentStep()).toContain('Business');
  });

  it('lists the saved businesses, picks the latest, and moves on to the policies', async () => {
    saveProfiles(
      savedProfile({ business_name: 'Newer Cafe', business_type: 'cafe' }, 'BP-newer'),
      savedProfile(),
    );
    const { user } = await openStep('');

    const newer = await screen.findByRole('radio', { name: /Newer Cafe/ });
    expect(newer).toBeChecked();
    expect(screen.getByRole('radio', { name: /Test Bakery/ })).not.toBeChecked();
    expect(screen.getByRole('link', { name: /Add a new business/ })).toHaveAttribute(
      'href',
      '/app/businesses/new?next=analysis',
    );

    await user.click(screen.getByRole('radio', { name: /Test Bakery/ }));
    expect(screen.getByRole('link', { name: 'Edit the chosen business' })).toHaveAttribute(
      'href',
      `/app/businesses/${PROFILE_ID}?next=analysis`,
    );
    await user.click(screen.getByRole('button', { name: /Continue to policies/ }));

    expect(
      await screen.findByRole('heading', { name: 'Which policies should be checked?' }),
    ).toBeInTheDocument();
    expect(location()).toBe(`/app/analyses/new/profile?profile=${PROFILE_ID}&step=policies`);
    expect(currentStep()).toContain('Policies');

    // Back keeps the choice: no need to fill anything in again.
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('radio', { name: /Test Bakery/ })).toBeChecked();
  });

  it('adds a new business without leaving the flow', async () => {
    saveProfiles(savedProfile());
    const { user } = await openStep('');

    await user.click(await screen.findByRole('link', { name: /Add a new business/ }));
    await screen.findByRole('heading', { name: 'Business profile' });
    await user.type(screen.getByLabelText(/Business name/), 'Corner Pharmacy');
    await user.selectOptions(screen.getByLabelText(/Type of business/), 'pharmacy');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    // Straight on to the policies, with the new business chosen.
    expect(
      await screen.findByRole('heading', { name: 'Which policies should be checked?' }),
    ).toBeInTheDocument();
    const added = db.businessProfiles.find((p) => p.profile.business_name === 'Corner Pharmacy')!;
    expect(added).toBeDefined();
    expect(location()).toBe(`/app/analyses/new/profile?profile=${added.profile_id}&step=policies`);
    expect(db.businessProfiles).toHaveLength(2);
  });

  it('starts again at step 1 when the business in the link no longer exists', async () => {
    saveProfiles(savedProfile());
    await openStep('?profile=BP-deleted&step=review');

    expect(await screen.findByRole('radio', { name: /Test Bakery/ })).toBeChecked();
    expect(currentStep()).toContain('Business');
  });
});

describe('new analysis: step 2, the policies', () => {
  beforeEach(() => saveProfiles(savedProfile()));
  const openPolicies = () => openStep(`?profile=${PROFILE_ID}&step=policies`);

  it('preselects the ready policies', async () => {
    await openPolicies();

    for (const policy of policiesFixture) {
      expect(
        await screen.findByRole('checkbox', { name: new RegExp(policy.filename) }),
      ).toBeChecked();
    }
    expect(screen.getByRole('button', { name: /Continue to review/ })).toBeEnabled();
  });

  it('allows at most 5 policies', async () => {
    server.use(http.get('*/api/v1/policies', () => HttpResponse.json(manyPolicies(7))));
    const { user } = await openPolicies();

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

  it('needs at least one policy to continue', async () => {
    const { user } = await openPolicies();

    for (const policy of policiesFixture) {
      await user.click(await screen.findByRole('checkbox', { name: new RegExp(policy.filename) }));
    }
    expect(screen.getByRole('button', { name: /Continue to review/ })).toBeDisabled();
    expect(screen.getByText('Choose at least one policy.')).toBeInTheDocument();
  });

  it('uploads a missing policy here and ticks it', async () => {
    db.policies = [];
    server.use(
      http.post('*/api/v1/policies', () => {
        const document: PolicyDocument = {
          ...policiesFixture[0],
          policy_id: 'POL-new000000001',
          filename: 'new-cover.pdf',
          uploaded_at: new Date().toISOString(),
        };
        db.policies = [document];
        return HttpResponse.json({ ...document, warnings: [] });
      }),
    );
    const { user } = await openPolicies();

    expect(await screen.findByText('No policies are ready yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue to review/ })).toBeDisabled();

    const file = new File(['%PDF-1.4'], 'new-cover.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Upload policy PDFs'), file);

    expect(await screen.findByRole('checkbox', { name: /new-cover\.pdf/ })).toBeChecked();
    expect(screen.getByRole('button', { name: /Continue to review/ })).toBeEnabled();
  });

  it('keeps the choice when moving to the review', async () => {
    const { user } = await openPolicies();
    await user.click(
      await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) }),
    );

    await user.click(screen.getByRole('button', { name: /Continue to review/ }));

    const chosen = await screen.findByRole('list', { name: 'Chosen policies' });
    expect(chosen).not.toHaveTextContent(policiesFixture[0].filename);
    expect(chosen).toHaveTextContent(policiesFixture[1].filename);
    expect(location()).toContain('step=review');
  });
});

describe('new analysis: step 3, review and run', () => {
  it('shows the business and the policies, with a way back to each', async () => {
    const { user } = await openReview();

    const business = screen.getByRole('region', { name: 'Business' });
    expect(business).toHaveTextContent('Test Bakery');
    expect(business).toHaveTextContent('Ovens');
    // Starting the AI pipeline is an AI action, so it gets the indigo button.
    expect(runButton()).toHaveClass('bg-ai');

    await user.click(screen.getByRole('button', { name: 'Change policies' }));
    expect(
      await screen.findByRole('heading', { name: 'Which policies should be checked?' }),
    ).toBeInTheDocument();
  });

  it('starts one run, opens the workspace and shows every agent finishing', async () => {
    let requests = 0;
    let sentBody: unknown;
    server.use(
      http.post('*/api/v1/analyses', async ({ request }) => {
        requests++;
        sentBody = await request.clone().json();
        return undefined; // fall through to the normal mock handler
      }),
    );
    const { user } = await openReview();

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
    // Kept, under this run's id, so a failed run can be retried from the workspace.
    const runId = location()!.split('/')[3];
    expect(analysisRequestFor(runId)).toEqual(sentBody);

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

    expect(screen.getByRole('link', { name: 'View results →' })).toHaveAttribute(
      'href',
      `/app/analyses/${runId}`,
    );
  });

  it('shows the agent that is working while the run is in progress', async () => {
    // "Slow" names keep real timings in the mock, so the first agent is still running.
    const { user } = await openReview({ business_name: 'Slow Bakery' });

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
      let requests = 0;
      server.use(
        http.post('*/api/v1/analyses', () => {
          requests++;
          return undefined;
        }),
      );
      const { user } = await openReview({ business_name: name });

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

  it('offers a new analysis, not a retry, for a failed run started elsewhere', async () => {
    // A failed run this tab did not start (e.g. opened from a link): its request is unknown.
    db.jobs.set('failed-run', {
      requestId: 'failed-run',
      startedAt: Date.now(),
      durations: [0, 0, 0, 0],
      result: null,
      policyCount: 1,
      failure: {
        stage: 'risk_profile',
        error: {
          error: 'agent_unavailable',
          message: 'A required analysis service is not available.',
        },
      },
      saved: false,
    });
    loginAsDemoUser();
    renderApp('/app/analyses/failed-run/progress');

    expect(
      await screen.findByRole('heading', { name: 'The analysis could not finish' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry analysis' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a new analysis' })).toHaveAttribute(
      'href',
      '/app/analyses/new/profile',
    );
  });

  it('goes back to the policies, refreshed, after a 404 policy_not_found', async () => {
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
    const { user } = await openReview();

    await user.click(runButton());

    expect(
      await screen.findByRole('heading', { name: 'Which policies should be checked?' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(policyListLoads).toBe(2));
    expect(location()).toBe(`/app/analyses/new/profile?profile=${PROFILE_ID}&step=policies`);
  });

  it('sends a 422 about the profile to the saved profile, next to the field', async () => {
    const { user } = await openReview({ employee_count: 300 });

    await user.click(runButton());

    expect(
      await screen.findByText('Input should be less than or equal to 250'),
    ).toBeInTheDocument();
    expect(location()).toBe(`/app/businesses/${PROFILE_ID}?next=analysis`);
    expect(screen.getByLabelText('Number of employees')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a 422 that is not about the profile on this page', async () => {
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
    const { user } = await openReview();

    await user.click(runButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'policy_ids must not contain duplicates.',
    );
    expect(location()).toBe(`/app/analyses/new/profile?profile=${PROFILE_ID}&step=review`);
  });
});
