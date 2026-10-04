import type { StageProgress, StageState } from '../api/types';
import { formatDuration } from '../lib/format';
import { AGENTS } from '../lib/labels';
import { WarningIcon } from './icons';
import { Spinner } from './ui/Spinner';

const STATE_LABELS: Record<StageState, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
};

const BADGE: Record<StageState, string> = {
  queued: 'border-line bg-white text-muted-strong',
  running: 'border-ai-border bg-ai-tint text-ai',
  done: 'border-status-covered-border bg-status-covered-bg text-status-covered',
  failed: 'border-status-excluded-border bg-status-excluded-bg text-status-excluded',
  skipped: 'border-line bg-canvas text-muted',
};

const CARD: Record<StageState, string> = {
  queued: 'border-line bg-white',
  running: 'border-ai-bright bg-white ring-2 ring-ai-border motion-safe:animate-pulse-ring',
  done: 'border-line bg-white',
  failed: 'border-status-excluded bg-status-excluded-bg',
  skipped: 'border-dashed border-line bg-canvas',
};

/** The four agents of one run, connected in the order the gateway calls them. */
export function AgentRail({ stages }: { stages: StageProgress[] }) {
  return (
    <ol className="relative space-y-3" aria-label="Agents">
      {stages.map((stage, index) => (
        <li key={stage.stage} className="relative pl-12">
          {/* The connecting line, behind the markers. */}
          {index < stages.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[19px] top-10 h-[calc(100%-1.25rem)] w-0.5 ${
                stage.state === 'done' ? 'bg-status-covered-dot' : 'bg-line'
              }`}
            />
          )}
          <Marker state={stage.state} number={index + 1} />
          <AgentCard stage={stage} />
        </li>
      ))}
    </ol>
  );
}

function Marker({ state, number }: { state: StageState; number: number }) {
  const base =
    'absolute left-0 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold';
  if (state === 'running') {
    return (
      <span aria-hidden="true" className={`${base} border-ai-bright bg-ai-tint`}>
        <Spinner className="h-5 w-5" colour="text-ai-bright" />
      </span>
    );
  }
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className={`${base} border-status-covered bg-status-covered text-white`}
      >
        ✓
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span
        aria-hidden="true"
        className={`${base} border-status-excluded bg-status-excluded text-white`}
      >
        <WarningIcon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${base} border-line bg-white text-muted-strong`}>
      {number}
    </span>
  );
}

function AgentCard({ stage }: { stage: StageProgress }) {
  const agent = AGENTS[stage.stage];
  return (
    <div className={`rounded-panel border p-4 shadow-soft transition-colors ${CARD[stage.state]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{agent.name}</h3>
          <p className="text-meta text-muted">{agent.role}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-pill border px-2.5 py-0.5 text-xs font-semibold ${BADGE[stage.state]}`}
        >
          {STATE_LABELS[stage.state]}
        </span>
      </div>
      {(stage.received || stage.duration_ms !== null) && (
        <p
          className={`mt-2 flex flex-wrap items-center gap-x-2 text-sm ${
            stage.state === 'failed' ? 'font-semibold text-status-excluded' : 'text-ink'
          }`}
        >
          {stage.received && <span>{stage.received}</span>}
          {stage.duration_ms !== null && (
            <span className="text-meta text-muted">· {formatDuration(stage.duration_ms)}</span>
          )}
        </p>
      )}
    </div>
  );
}
