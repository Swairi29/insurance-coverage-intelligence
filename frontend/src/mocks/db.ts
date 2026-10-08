// In-memory state behind the mock API, seeded from the fixtures. It resets on a page reload
// (the handlers run in the page) and before every test (`resetMockDb`).

import type {
  AnalysisResponse,
  AnalysisSummary,
  PolicyDocument,
  SavedBusinessProfile,
  UserResponse,
} from '../api/types';
import {
  DEMO_PASSWORD,
  allStatusesAnalysis,
  analysesFixture,
  analysisByType,
  demoUser,
  partialAnalysis,
  policiesFixture,
} from './fixtures';
import type { MockJob } from './jobs';

interface MockDb {
  users: Map<string, { password: string; user: UserResponse }>;
  failedLogins: Map<string, number>;
  policies: PolicyDocument[];
  /** Saved business profiles, most recently changed first. */
  businessProfiles: SavedBusinessProfile[];
  analyses: Map<string, AnalysisResponse>;
  summaries: AnalysisSummary[];
  /** Analyses started in this session, by request_id. */
  jobs: Map<string, MockJob>;
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
    businessProfiles: [structuredClone(DEMO_BUSINESS_PROFILE)],
    analyses,
    summaries: sortNewestFirst(structuredClone(analysesFixture)),
    jobs: new Map(),
  };
}

/** The demo account's saved business, so the analysis flow can be tried at once. */
const DEMO_BUSINESS_PROFILE: SavedBusinessProfile = {
  profile_id: 'BP-demo0000bakery1',
  created_at: '2026-09-01T09:00:00Z',
  updated_at: '2026-09-01T09:00:00Z',
  profile: {
    business_name: 'Sunrise Bakery',
    business_type: 'bakery',
    description: 'A bakery producing bread, cakes and pastries, with a small café area.',
    employee_count: 8,
    equipment: ['Ovens', 'Refrigerators', 'Mixers'],
    operations: {
      sales_channels: ['in_store', 'delivery'],
      accepts_card_payments: true,
      handles_cash: true,
      stores_customer_data: true,
      operates_single_location: true,
    },
    location: {
      city: 'Kandy',
      district: 'Kandy',
      country: 'Sri Lanka',
      flood_prone_area: true,
    },
  },
};

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
