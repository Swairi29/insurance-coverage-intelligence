import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { analysisQueryKey } from '../api/analyses';
import type { AnalysisResponse, BusinessProfile, PolicyDocument } from '../api/types';
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

describe('new analysis: running', () => {
  it('shows the progress screen, sends one request, then opens the result', async () => {
    saveDraft();
    let requests = 0;
    let sentBody: unknown;
    server.use(
      http.post('*/api/v1/analyses', async ({ request }) => {
        requests++;
        sentBody = await request.clone().json();
        await delay(300);
        return undefined; // fall through to the normal mock handler
      }),
    );
    const { user, client } = await openNewAnalysis();
    await screen.findByRole('checkbox', { name: new RegExp(policiesFixture[0].filename) });

    await user.click(runButton());

    expect(
      await screen.findByRole('heading', { name: 'Analysing your coverage…' }),
    ).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Analysis steps' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1Risk profiling', '2Policy evidence', '3Coverage analysis', '4Report writing']);
    expect(screen.getByText(/You can leave this page/)).toBeInTheDocument();
    const progress = screen.getByRole('region', { name: 'Analysing your coverage…' });
    expect(within(progress).getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/app/analyses',
    );
    expect(screen.queryByRole('button', { name: 'Run analysis' })).not.toBeInTheDocument();

    await waitFor(() => expect(location()).toMatch(/^\/app\/analyses\/[0-9a-f]{32}$/));
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

    const requestId = location()!.split('/').pop()!;
    const cached = client.getQueryData<AnalysisResponse>(analysisQueryKey(requestId));
    expect(cached?.status).toBe('complete');
  });
});

describe('new analysis: errors', () => {
  it.each([
    ['Down Ltd', 'Risk profiling', 'A required analysis service is not available.'],
    ['Timeout Ltd', 'Coverage analysis', 'took too long to respond'],
    ['Broken Ltd', 'Policy evidence', 'could not complete the request'],
  ])('"%s": names the failed step (%s) and offers a retry', async (name, step, message) => {
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

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The analysis could not finish');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent(`The problem happened at this step: ${step}.`);
    expect(location()).toBe('/app/analyses/new');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('alert');
    expect(requests).toBe(2);
  });

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
