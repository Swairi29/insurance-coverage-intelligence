import type { StageProgress } from '../api/types';
import { formatDuration } from '../lib/format';
import { AGENTS } from '../lib/labels';

interface LogEntry {
  key: string;
  at: number;
  from: string;
  to: string;
  detail: string;
  endpoint?: string;
  failed?: boolean;
}

/**
 * Every message of one run, in order. The gateway calls each agent and gets its answer back;
 * agents never message each other, so every line starts or ends at the gateway.
 */
function buildLog(stages: StageProgress[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const stage of stages) {
    const agent = AGENTS[stage.stage].short;
    if (stage.started_at) {
      entries.push({
        key: `${stage.stage}-request`,
        at: Date.parse(stage.started_at),
        from: 'Gateway',
        to: agent,
        endpoint: stage.endpoint,
        detail: stage.sent ?? '',
      });
    }
    if (stage.finished_at && (stage.state === 'done' || stage.state === 'failed')) {
      const took = stage.duration_ms === null ? '' : ` · ${formatDuration(stage.duration_ms)}`;
      entries.push({
        key: `${stage.stage}-reply`,
        at: Date.parse(stage.finished_at),
        from: agent,
        to: 'Gateway',
        detail: `${stage.received ?? ''}${took}`,
        failed: stage.state === 'failed',
      });
    }
  }
  return entries.sort((a, b) => a.at - b.at);
}

export function HandoffLog({ stages, startedAt }: { stages: StageProgress[]; startedAt: string }) {
  const entries = buildLog(stages);
  const start = Date.parse(startedAt);
  return (
    <div>
      <p className="text-meta text-muted">
        The gateway calls each agent in turn and passes its result to the next. Agents never call
        each other. Only counts are shown here, never your business or policy details.
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Waiting for the first agent…</p>
      ) : (
        <div role="log" aria-label="Messages between the gateway and the agents" className="mt-4">
          <ol className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.key}
                className={`rounded-control border px-3 py-2 text-sm ${
                  entry.failed
                    ? 'border-status-excluded-border bg-status-excluded-bg'
                    : 'border-line bg-white'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold text-ink-heading">
                    {entry.from} <span aria-label="to">→</span> {entry.to}
                  </p>
                  <span className="font-mono text-xs text-muted">
                    +{formatDuration(Math.max(0, entry.at - start))}
                  </span>
                </div>
                <p
                  className={`mt-0.5 break-words text-meta ${entry.failed ? 'font-semibold text-status-excluded' : 'text-muted-strong'}`}
                >
                  {entry.endpoint && (
                    <code className="font-mono text-xs text-ai">{entry.endpoint}</code>
                  )}
                  {entry.endpoint && entry.detail && ' · '}
                  {entry.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
