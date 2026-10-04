import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithQuery } from '../test/renderWithQuery';
import { AgentStatus } from './AgentStatus';

describe('AgentStatus', () => {
  it('shows all services up', async () => {
    renderWithQuery(<AgentStatus />);
    expect(await screen.findByText('All services up')).toBeInTheDocument();
  });

  it('names the services that are down', async () => {
    server.use(
      http.get('*/health/agents', () =>
        HttpResponse.json({
          status: 'degraded',
          agents: { risk_profile: 'up', policy_evidence: 'up', coverage: 'down', report: 'down' },
        }),
      ),
    );
    renderWithQuery(<AgentStatus />);

    const status = await screen.findByText('2 services down');
    expect(status).toHaveAttribute(
      'title',
      expect.stringContaining('Coverage analysis, Report writing'),
    );
  });

  it('uses the bright dot on the navy header', async () => {
    renderWithQuery(<AgentStatus tone="dark" />);

    const status = await screen.findByText('All services up');
    expect(status.querySelector('[aria-hidden="true"]')).toHaveClass('bg-status-covered-dot');
  });

  it('opens a list of the four agents with their own state', async () => {
    server.use(
      http.get('*/health/agents', () =>
        HttpResponse.json({
          status: 'degraded',
          agents: { risk_profile: 'up', policy_evidence: 'up', coverage: 'down', report: 'up' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<AgentStatus />);
    await screen.findByText('1 service down');

    await user.click(screen.getByRole('button', { expanded: false }));
    const list = screen.getByRole('list', { name: 'Agent status' });
    const rows = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual([
      'Risk Profiling AgentUp',
      'Policy Intelligence AgentUp',
      'Coverage & Gap Analysis AgentDown',
      'Explanation & Recommendation AgentUp',
    ]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Agent status' })).not.toBeInTheDocument();
  });

  it('says the status is unknown when the gateway cannot be reached', async () => {
    server.use(http.get('*/health/agents', () => new HttpResponse(null, { status: 502 })));
    renderWithQuery(<AgentStatus />);

    expect(await screen.findByText('Service status unknown')).toBeInTheDocument();
  });
});
