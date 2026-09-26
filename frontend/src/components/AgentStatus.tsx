import { useAgentsHealth } from '../api/health';
import { AGENT_STAGES, STAGE_LABELS } from '../lib/labels';

type Tone = 'up' | 'down' | 'unknown';

const DOT: Record<Tone, string> = {
  up: 'bg-status-covered',
  down: 'bg-status-conditional',
  unknown: 'bg-status-unclear',
};

/** A dot and short text in the nav: are all four analysis services up? */
export function AgentStatus() {
  const { data, isError, isPending } = useAgentsHealth();

  let tone: Tone = 'unknown';
  let text = 'Checking services…';
  let detail = '';
  if (isError) {
    text = 'Service status unknown';
    detail = 'The server could not be reached.';
  } else if (!isPending && data) {
    const down = AGENT_STAGES.filter((stage) => data.agents[stage] !== 'up');
    if (down.length === 0) {
      tone = 'up';
      text = 'All services up';
    } else {
      tone = 'down';
      text = `${down.length} service${down.length === 1 ? '' : 's'} down`;
      detail = `Not available: ${down.map((stage) => STAGE_LABELS[stage]).join(', ')}. An analysis may fail or have no written report.`;
    }
  }

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-strong"
      title={detail || text}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      {text}
      {detail && <span className="sr-only"> {detail}</span>}
    </span>
  );
}
