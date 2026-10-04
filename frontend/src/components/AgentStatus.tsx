import { useAgentsHealth } from '../api/health';
import { AGENTS, AGENT_STAGES, STAGE_LABELS } from '../lib/labels';
import type { Tone } from './Brand';
import { Popover } from './Popover';

type Health = 'up' | 'down' | 'unknown';

// The dark status shades disappear on navy (2:1), so a navy background uses the bright ones.
const DOT: Record<Tone, Record<Health, string>> = {
  light: {
    up: 'bg-status-covered',
    down: 'bg-status-conditional',
    unknown: 'bg-status-unclear',
  },
  dark: {
    up: 'bg-status-covered-dot',
    down: 'bg-status-conditional-dot',
    unknown: 'bg-status-unclear-dot',
  },
};

const TEXT: Record<Tone, string> = {
  light: 'text-muted-strong hover:bg-brand-soft hover:text-ink-heading',
  dark: 'text-brand-muted hover:bg-white/10 hover:text-white',
};

/**
 * Are all four analysis services up? A button in the header; it opens a list of the four
 * agents, each with its own state.
 */
export function AgentStatus({ tone = 'light' }: { tone?: Tone }) {
  const { data, isError, isPending } = useAgentsHealth();

  let health: Health = 'unknown';
  let text = 'Checking services…';
  let detail = '';
  if (isError) {
    text = 'Service status unknown';
    detail = 'The server could not be reached.';
  } else if (!isPending && data) {
    const down = AGENT_STAGES.filter((stage) => data.agents[stage] !== 'up');
    if (down.length === 0) {
      health = 'up';
      text = 'All services up';
    } else {
      health = 'down';
      text = `${down.length} service${down.length === 1 ? '' : 's'} down`;
      detail = `Not available: ${down.map((stage) => STAGE_LABELS[stage]).join(', ')}. An analysis may fail or have no written report.`;
    }
  }

  return (
    <Popover
      title={detail || text}
      triggerClassName={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs font-medium transition-colors ${TEXT[tone]}`}
      trigger={
        <span role="status" className="inline-flex items-center gap-1.5" title={detail || text}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone][health]}`} />
          {text}
          {detail && <span className="sr-only"> {detail}</span>}
        </span>
      }
    >
      {() => (
        <div>
          <p className="px-1 text-meta font-semibold text-ink-heading">Analysis services</p>
          <ul className="mt-2 space-y-1" aria-label="Agent status">
            {AGENT_STAGES.map((stage) => {
              const state: Health = data
                ? data.agents[stage] === 'up'
                  ? 'up'
                  : 'down'
                : 'unknown';
              return (
                <li
                  key={stage}
                  className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 text-sm"
                >
                  <span className="text-ink">{AGENTS[stage].name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-strong">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${DOT.light[state]}`}
                    />
                    {state === 'up' ? 'Up' : state === 'down' ? 'Down' : 'Unknown'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">Checked every 30 seconds.</p>
        </div>
      )}
    </Popover>
  );
}
