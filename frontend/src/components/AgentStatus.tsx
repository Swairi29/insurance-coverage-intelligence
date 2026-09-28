import { useAgentsHealth } from '../api/health';
import { AGENT_STAGES, STAGE_LABELS } from '../lib/labels';
import type { Tone } from './Brand';

type Health = 'up' | 'down' | 'unknown';

// The dark status shades disappear on navy (2:1), so the header uses the bright ones.
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
  light: 'text-muted-strong',
  dark: 'text-brand-muted',
};

/** A dot and short text in the nav: are all four analysis services up? */
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
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${TEXT[tone]}`}
      title={detail || text}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone][health]}`} />
      {text}
      {detail && <span className="sr-only"> {detail}</span>}
    </span>
  );
}
