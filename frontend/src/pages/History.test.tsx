import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { analysesFixture } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

async function openHistory() {
  loginAsDemoUser();
  const result = renderApp('/app/analyses');
  await screen.findByRole('heading', { name: 'History', level: 1 });
  return result;
}

describe('history page', () => {
  it('lists every analysis newest first, with status, risks and gaps', async () => {
    await openHistory();

    const list = await screen.findByRole('list', { name: 'Past analyses' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(analysesFixture.length);

    const newest = [...analysesFixture].sort((a, b) => b.created_at.localeCompare(a.created_at));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      newest.map((a) => `/app/analyses/${a.request_id}`),
    );

    const partial = links.find((l) => l.textContent?.includes('Partial'))!;
    expect(partial).toHaveTextContent('14 risks checked · 14 potential gaps');
  });

  it('opens an analysis from the list', async () => {
    const { user } = await openHistory();
    const list = await screen.findByRole('list', { name: 'Past analyses' });

    await user.click(within(list).getAllByRole('link')[0]);

    expect(await screen.findByRole('tablist', { name: 'Result sections' })).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(http.get('*/api/v1/analyses', () => HttpResponse.json([])));
    await openHistory();

    expect(await screen.findByText('No analyses yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run your first analysis' })).toHaveAttribute(
      'href',
      '/app/analyses/new',
    );
  });

  it('shows an error with a retry', async () => {
    let failures = 0;
    server.use(
      http.get('*/api/v1/analyses', () =>
        failures++ < 2 ? new HttpResponse(null, { status: 502 }) : undefined,
      ),
    );
    const { user } = await openHistory();

    expect(await screen.findByText('Your history could not be loaded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Past analyses' })).toBeInTheDocument();
  });
});
