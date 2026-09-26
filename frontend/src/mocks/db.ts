// In-memory state behind the mock API, seeded from the fixtures. It resets on a page reload
// (the handlers run in the page) and before every test (`resetMockDb`).

import type { AnalysisResponse, AnalysisSummary, PolicyDocument, UserResponse } from '../api/types';
import {
  DEMO_PASSWORD,
  allStatusesAnalysis,
  analysesFixture,
  analysisByType,
  demoUser,
  partialAnalysis,
  policiesFixture,
} from './fixtures';

interface MockDb {
  users: Map<string, { password: string; user: UserResponse }>;
  failedLogins: Map<string, number>;
  policies: PolicyDocument[];
  analyses: Map<string, AnalysisResponse>;
  summaries: AnalysisSummary[];
}

function seed(): MockDb {
  const analyses = new Map<string, AnalysisResponse>();
  for (const analysis of [...Object.values(analysisByType), partialAnalysis, allStatusesAnalysis]) {
    analyses.set(analysis.request_id, structuredClone(analysis));
  }
  return {
    users: new Map([
      [demoUser.email, { password: DEMO_PASSWORD, user: structuredClone(demoUser) }],
    ]),
    failedLogins: new Map(),
    policies: structuredClone(policiesFixture),
    analyses,
    summaries: sortNewestFirst(structuredClone(analysesFixture)),
  };
}

export let db: MockDb = seed();

export function resetMockDb(): void {
  db = seed();
}

export function sortNewestFirst<T extends { created_at: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function newId(prefix = ''): string {
  const hex = crypto.randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}-${hex.slice(0, 12)}` : hex;
}
