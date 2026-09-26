import { screen } from '@testing-library/react';
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

  it('says the status is unknown when the gateway cannot be reached', async () => {
    server.use(http.get('*/health/agents', () => new HttpResponse(null, { status: 502 })));
    renderWithQuery(<AgentStatus />);

    expect(await screen.findByText('Service status unknown')).toBeInTheDocument();
  });
});
