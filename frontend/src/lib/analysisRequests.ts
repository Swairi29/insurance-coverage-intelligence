// The request behind each analysis started in this tab, by request_id, so "Retry analysis" on
// a failed run's workspace re-runs exactly that request (not whichever one was started last).
// sessionStorage, cleared on logout like the profile draft.

import type { AnalysisRequest } from '../api/types';
import { SESSION_KEYS, readSession, writeSession } from './session';

const KEEP = 10;

function readAll(): Record<string, AnalysisRequest> {
  const raw = readSession(SESSION_KEYS.analysisRequests);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, AnalysisRequest>) : {};
  } catch {
    return {};
  }
}

/** Remember the request that started `requestId`; only the last 10 are kept. */
export function rememberAnalysisRequest(requestId: string, body: AnalysisRequest): void {
  const entries = Object.entries(readAll()).filter(([id]) => id !== requestId);
  entries.push([requestId, body]);
  writeSession(
    SESSION_KEYS.analysisRequests,
    JSON.stringify(Object.fromEntries(entries.slice(-KEEP))),
  );
}

/** The request that started `requestId`, if it was started in this tab. */
export function analysisRequestFor(requestId: string): AnalysisRequest | null {
  const value = readAll()[requestId];
  return value?.business && Array.isArray(value.policy_ids) ? value : null;
}
