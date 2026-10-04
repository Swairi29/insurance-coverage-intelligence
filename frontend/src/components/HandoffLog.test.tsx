import { render, screen, within } from '@testing-library/react';
import type { StageProgress } from '../api/types';
import { HandoffLog } from './HandoffLog';

const START = '2026-10-04T10:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();

function stage(overrides: Partial<StageProgress> & Pick<StageProgress, 'stage'>): StageProgress {
  return {
    agent: 'Agent',
    endpoint: 'POST /api/v1/x',
    state: 'queued',
    sent: null,
    received: null,
    started_at: null,
    finished_at: null,
    duration_ms: null,
    ...overrides,
  };
}

describe('HandoffLog', () => {
  it('shows each call as gateway -> agent and each answer as agent -> gateway, in order', () => {
    render(
      <HandoffLog
        startedAt={START}
        stages={[
          stage({
            stage: 'risk_profile',
            endpoint: 'POST /api/v1/risk-profile',
            state: 'done',
            sent: 'business profile',
            received: '14 risks identified',
            started_at: at(0),
            finished_at: at(1200),
            duration_ms: 1200,
          }),
          stage({
            stage: 'policy_evidence',
            endpoint: 'POST /api/v1/retrieve-policy-evidence',
            state: 'failed',
            sent: '14 risks, 2 policies',
            received: 'Service not reachable',
            started_at: at(1200),
            finished_at: at(1300),
            duration_ms: 100,
          }),
          stage({ stage: 'coverage', state: 'skipped', received: 'Skipped' }),
          stage({ stage: 'report' }),
        ]}
      />,
    );

    const lines = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      'Gateway → Risk agent+0 msPOST /api/v1/risk-profile · business profile',
      'Risk agent → Gateway+1.2 s14 risks identified · 1.2 s',
      'Gateway → Policy agent+1.2 sPOST /api/v1/retrieve-policy-evidence · 14 risks, 2 policies',
      'Policy agent → Gateway+1.3 sService not reachable · 100 ms',
    ]);
    // Agents never message each other: every line starts or ends at the gateway.
    for (const line of lines) expect(line.textContent).toMatch(/^Gateway →|→ Gateway/);
  });

  it('waits for the first agent', () => {
    render(<HandoffLog startedAt={START} stages={[stage({ stage: 'risk_profile' })]} />);
    expect(screen.getByText('Waiting for the first agent…')).toBeInTheDocument();
  });
});
