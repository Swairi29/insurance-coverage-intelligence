import { readSession, SESSION_KEYS, writeSession } from './session';

export interface ScenarioHistoryEntry {
  request_id: string;
  created_at: string;
}

export function rememberScenarioAnalysis(requestId: string, createdAt: string): void {
  const entries = scenarioAnalysesInSession();
  const updated = entries.filter((entry) => entry.request_id !== requestId);
  updated.unshift({ request_id: requestId, created_at: createdAt });
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
