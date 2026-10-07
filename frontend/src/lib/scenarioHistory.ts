import type { ScenarioAnalysisRequest } from '../api/scenarioAnalyses';
import { readSession, SESSION_KEYS, writeSession } from './session';

export interface ScenarioHistoryEntry {
  request_id: string;
  created_at: string;
  /** What the user sent, so the run can be labelled and retried. Missing on older entries. */
  request?: ScenarioAnalysisRequest;
}

export function rememberScenarioAnalysis(
  requestId: string,
  createdAt: string,
  request: ScenarioAnalysisRequest,
): void {
  const entries = scenarioAnalysesInSession();
  const updated = entries.filter((entry) => entry.request_id !== requestId);
  updated.unshift({ request_id: requestId, created_at: createdAt, request });
  writeSession(SESSION_KEYS.scenarioAnalysisIds, JSON.stringify(updated.slice(0, 20)));
}

export function scenarioAnalysesInSession(): ScenarioHistoryEntry[] {
  try {
    const entries = JSON.parse(
      readSession(SESSION_KEYS.scenarioAnalysisIds) ?? '[]',
    ) as ScenarioHistoryEntry[];
    return Array.isArray(entries)
      ? entries.filter((entry) => typeof entry.request_id === 'string')
      : [];
  } catch {
    return [];
  }
}

/** The request behind a scenario run started in this tab, if any. */
export function scenarioRequestFor(requestId: string): ScenarioAnalysisRequest | undefined {
  return scenarioAnalysesInSession().find((entry) => entry.request_id === requestId)?.request;
}

/** A one-line label for a scenario run: the start of what the user wrote. */
export function scenarioLabel(requestId: string, maxLength = 90): string {
  const text = scenarioRequestFor(requestId)?.scenario.trim().replace(/\s+/g, ' ');
  if (!text) return 'Scenario analysis';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
