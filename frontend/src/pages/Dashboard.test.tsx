import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SESSION_KEYS } from '../lib/session';
import { analysesFixture } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

async function openDashboard() {
  loginAsDemoUser();
  const result = renderApp('/app');
  await screen.findByRole('heading', { name: 'Your workspace' });
  return result;
}

const steps = () =>
  within(screen.getByRole('list', { name: 'Getting started steps' })).getAllByRole('listitem');

describe('dashboard', () => {
  it('starts a new user at step 1 when nothing is done yet', async () => {
    server.use(
      http.get('*/api/v1/policies', () => HttpResponse.json([])),
      http.get('*/api/v1/analyses', () => HttpResponse.json([])),
    );
    await openDashboard();

    expect(await screen.findByText('0 policies ready.')).toBeInTheDocument();
    const [profile, policies, analysis] = steps();
    expect(profile).toHaveAttribute('aria-current', 'step');
    expect(profile).toHaveTextContent('(to do)');
    expect(policies).toHaveTextContent('(to do)');
    expect(analysis).toHaveTextContent('(to do)');
    expect(within(profile).getByRole('link', { name: 'Add profile' })).toHaveAttribute(
      'href',
      '/app/profile',
    );
    expect(await screen.findByText(/No analyses yet/)).toBeInTheDocument();
  });

  it('points to the next unfinished step', async () => {
    window.sessionStorage.setItem(
      SESSION_KEYS.profileDraft,
      JSON.stringify({ business_name: 'Test Bakery', business_type: 'bakery' }),
    );
    server.use(http.get('*/api/v1/analyses', () => HttpResponse.json([])));
    await openDashboard();

    await screen.findByText('2 policies ready.');
    const [profile, policies, analysis] = steps();
    expect(profile).toHaveTextContent('(done)');
    expect(policies).toHaveTextContent('(done)');
    expect(analysis).toHaveAttribute('aria-current', 'step');
    expect(within(analysis).getByRole('link', { name: 'New analysis' })).toHaveAttribute(
      'href',
      '/app/analyses/new',
    );
  });

  it('shows the latest analysis with its counts and a link to it', async () => {
    await openDashboard();

    const latestCard = screen.getByRole('region', { name: 'Latest analysis' });
    const latest = [...analysesFixture].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const open = await within(latestCard).findByRole('link', { name: 'Open results →' });
    expect(open).toHaveAttribute('href', `/app/analyses/${latest.request_id}`);
    expect(latestCard).toHaveTextContent(`Risks checked${latest.total_findings}`);
    expect(latestCard).toHaveTextContent(`Potential gaps${latest.potential_gaps}`);
    expect(
      within(latestCard).getByRole('link', { name: `All ${analysesFixture.length} analyses` }),
    ).toHaveAttribute('href', '/app/analyses');
    expect(steps()[2]).toHaveTextContent('(done)');
  });
});
