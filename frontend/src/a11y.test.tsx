// Automated accessibility check (axe-core) of every redesigned page. Colour contrast cannot be
// measured in jsdom (no layout or computed colours), so it is checked separately with the
// contrast script in docs/frontend-plan.md §4; every other axe rule runs here.
import { screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { SESSION_KEYS } from './lib/session';
import { allStatusesAnalysis } from './mocks/fixtures';
import { renderApp } from './test/renderApp';
import { loginAsDemoUser } from './test/session';

async function expectNoViolations() {
  const results = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const problems = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(problems).toEqual([]);
}

describe('accessibility (axe)', () => {
  it.each([
    ['landing', '/', 'Know what your insurance actually covers.'],
    ['login', '/login', 'Welcome back'],
    ['signup', '/register', 'Create your account'],
    ['privacy notice', '/privacy', 'How InsureIntel uses your data'],
  ])('%s page', async (_name, route, heading) => {
    renderApp(route);
    await screen.findByRole('heading', { level: 1, name: heading });
    await expectNoViolations();
  });

  it('dashboard', async () => {
    loginAsDemoUser();
    renderApp('/app');
    await screen.findByRole('link', { name: 'Open results →' });
    await expectNoViolations();
  });

  it('business profile', async () => {
    loginAsDemoUser();
    renderApp('/app/profile');
    await screen.findByRole('heading', { name: 'Business profile' });
    await expectNoViolations();
  });

  it('agent workspace', async () => {
    loginAsDemoUser();
    window.sessionStorage.setItem(
      SESSION_KEYS.profileDraft,
      JSON.stringify({ business_name: 'Test Bakery', business_type: 'bakery' }),
    );
    const { user } = renderApp('/app/analyses/new');
    await screen.findByRole('checkbox', { name: /sunrise-business-pack/ });
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    await screen.findByRole('heading', { name: 'Analysis complete' });
    await expectNoViolations();
  });

  it('results with the evidence drawer open', async () => {
    loginAsDemoUser();
    const { user } = renderApp(`/app/analyses/${allStatusesAnalysis.request_id}?tab=coverage`);
    const table = await screen.findByRole('table');
    await expectNoViolations();

    await user.click((await waitFor(() => table.querySelector('button')))!);
    await screen.findByRole('dialog');
    await expectNoViolations();
  });

  it('results with a question answered', async () => {
    loginAsDemoUser();
    const { user } = renderApp(`/app/analyses/${allStatusesAnalysis.request_id}`);
    await user.click(
      await screen.findByRole('button', { name: 'Which risks are potential gaps?' }),
    );
    await screen.findByRole('article', { name: /^Answer to:/ });
    await expectNoViolations();
  });
});
