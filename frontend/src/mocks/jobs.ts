// Mock background analyses: like services/orchestration/jobs.py, each run moves through the
// four agents over time, and GET /status reports where it is. In tests every stage takes 0 ms,
// so the first status call already sees the finished run.

import type {
  AnalysisProgress,
  AnalysisResponse,
  AnalysisStage,
  GatewayError,
  StageProgress,
} from '../api/types';
import { ANALYSIS_STAGES } from '../api/types';
import { AGENTS } from '../lib/labels';

const PATHS: Record<AnalysisStage, string> = {
  risk_profile: 'POST /api/v1/risk-profile',
  policy_evidence: 'POST /api/v1/retrieve-policy-evidence',
  coverage: 'POST /api/v1/analyse-coverage',
  report: 'POST /api/v1/generate-report',
};

const FAILURE_REASONS: Record<string, string> = {
  agent_unavailable: 'Service not reachable',
  agent_timeout: 'Took too long to respond',
  agent_bad_response: 'Unexpected response',
};

export interface MockJob {
  requestId: string;
  startedAt: number;
  /** Planned milliseconds per stage. */
  durations: number[];
  /** The finished result (null when the run fails). */
  result: AnalysisResponse | null;
  policyCount: number;
  failure?: { stage: AnalysisStage; error: GatewayError };
  saved: boolean;
}

const count = (n: number, noun: string, many = `${noun}s`) => `${n} ${n === 1 ? noun : many}`;

function summaries(job: MockJob): Record<AnalysisStage, { sent: string; received: string }> {
  const a = job.result;
  const risks = a?.risk_profile.risks.length ?? 14;
  const clauses = a
    ? new Set(a.coverage.assessments.flatMap((x) => x.evidence.map((e) => e.chunk_id))).size
    : 0;
  const gaps = a?.coverage.assessments.filter((x) => x.potential_gap).length ?? 0;
  return {
    risk_profile: { sent: 'business profile', received: `${count(risks, 'risk')} identified` },
    policy_evidence: {
      sent: `${count(risks, 'risk')}, ${count(job.policyCount, 'policy', 'policies')}`,
      received: `${count(clauses, 'clause')} found`,
    },
    coverage: {
      sent: `${count(risks, 'risk')} + ${count(clauses, 'clause')}`,
      received: `${count(risks, 'risk')} assessed, ${count(gaps, 'potential gap')}`,
    },
    report: {
      sent: count(risks, 'assessment'),
      received: a?.report
        ? `${count(a.report.findings.length, 'finding')} written (${a.report.metadata.llm_findings} by AI)`
        : 'Service error',
    },
  };
}

/** Where the run is at `now`. */
export function progressAt(job: MockJob, now: number): AnalysisProgress {
  const text = summaries(job);
  const stages: StageProgress[] = [];
  let cursor = job.startedAt;
  let failed = false;
  let running = false;

  ANALYSIS_STAGES.forEach((stage, index) => {
    const entry: StageProgress = {
      stage,
      agent: AGENTS[stage].name,
      endpoint: PATHS[stage],
      state: 'queued',
      sent: null,
      received: null,
      started_at: null,
      finished_at: null,
      duration_ms: null,
    };
    stages.push(entry);
    if (failed) {
      entry.state = 'skipped';
      entry.received = 'Skipped: an earlier agent failed';
      return;
    }
    if (running) return;
    const end = cursor + job.durations[index];
    entry.started_at = new Date(cursor).toISOString();
    entry.sent = text[stage].sent;
    if (now < end) {
      entry.state = 'running';
      running = true;
      return;
    }
    entry.finished_at = new Date(end).toISOString();
    entry.duration_ms = job.durations[index];
    const reportFailed = stage === 'report' && job.result !== null && job.result.report === null;
    if (job.failure?.stage === stage) {
      entry.state = 'failed';
      entry.received = FAILURE_REASONS[job.failure.error.error] ?? 'Service error';
      failed = true;
    } else if (reportFailed) {
      entry.state = 'failed';
      entry.received = 'Service error';
    } else {
      entry.state = 'done';
      entry.received = text[stage].received;
    }
    cursor = end;
  });

  const state = running
    ? 'running'
    : failed
      ? 'failed'
      : job.result?.status === 'partial'
        ? 'partial'
        : 'complete';
  return {
    schema_version: '1.0',
    request_id: job.requestId,
    state,
    created_at: new Date(job.startedAt).toISOString(),
    updated_at: new Date(Math.min(now, cursor)).toISOString(),
    stages,
    error: failed ? job.failure!.error : null,
  };
}

/** What POST /analyses answers: every agent queued, like the gateway's 202. */
export function queuedProgress(job: MockJob): AnalysisProgress {
  const at = new Date(job.startedAt).toISOString();
  return {
    schema_version: '1.0',
    request_id: job.requestId,
    state: 'running',
    created_at: at,
    updated_at: at,
    stages: ANALYSIS_STAGES.map((stage) => ({
      stage,
      agent: AGENTS[stage].name,
      endpoint: PATHS[stage],
      state: 'queued',
      sent: null,
      received: null,
      started_at: null,
      finished_at: null,
      duration_ms: null,
    })),
    error: null,
  };
}
