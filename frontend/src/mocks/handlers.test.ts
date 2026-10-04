// @vitest-environment node
//
// The mock API must answer like the real gateway, or pages built on it will break on the
// real backend. These tests go through the real API client.
//
// Runs in Node, not jsdom: jsdom's File is not recognised by Node's fetch, so an uploaded
// file would arrive named "blob" and the filename-based magic inputs would not work.
// (Browsers are fine. Page tests override handlers with `server.use` instead.)

import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, api, configureApiClient } from '../api/client';
import type {
  AgentsHealth,
  AnalysisProgress,
  AnalysisResponse,
  AnalysisSummary,
  BusinessProfile,
  PolicyDocument,
  TokenResponse,
  UserResponse,
} from '../api/types';
import { ANALYSIS_STAGES, COVERAGE_STATUSES } from '../api/types';
import { db } from './db';
import { DEMO_PASSWORD, demoUser } from './fixtures';

let token: string | null = null;

// The base URL is set to an absolute origin in src/test/setup.ts.
beforeEach(() => {
  token = null;
  configureApiClient({ getToken: () => token, onUnauthorized: () => {} });
});

async function login(email = demoUser.email, password = DEMO_PASSWORD) {
  const body = await api.post<TokenResponse>(
    '/api/v1/auth/login',
    { email, password },
    { auth: false },
  );
  token = body.access_token;
  return body;
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected an ApiError');
}

function pdf(name: string, size = 10): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(size)], name, { type: 'application/pdf' }));
  return form;
}

const business = (overrides: Partial<BusinessProfile> = {}): BusinessProfile => ({
  business_name: 'Test Bakery',
  business_type: 'bakery',
  ...overrides,
});

async function policyIds(): Promise<string[]> {
  const policies = await api.get<PolicyDocument[]>('/api/v1/policies');
  return policies.map((p) => p.policy_id);
}

describe('health', () => {
  it('reports every agent as up', async () => {
    const health = await api.get<AgentsHealth>('/health/agents', { auth: false });
    expect(health.status).toBe('healthy');
    expect(Object.keys(health.agents).sort()).toEqual([...ANALYSIS_STAGES].sort());
  });
});

describe('auth', () => {
  it('logs in the demo user and returns them from /me', async () => {
    const body = await login();
    expect(body.token_type).toBe('bearer');

    const me = await api.get<UserResponse>('/api/v1/auth/me');
    expect(me.email).toBe(demoUser.email);
  });

  it('rejects a wrong password, then locks out with 429 and Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await failure(login(demoUser.email, 'wrong'))).status).toBe(401);
    }
    const locked = await failure(login());
    expect(locked.status).toBe(429);
    expect(locked.retryAfter).toBe(900);
  });

  it('returns 503 when login is unavailable', async () => {
    expect((await failure(login('a@b.co', 'server-down'))).error).toBe('login_unavailable');
  });

  it('registers a new user, and the account can log in', async () => {
    const user = await api.post<UserResponse>(
      '/api/v1/auth/register',
      { email: 'New@Shop.test', password: 'long-enough' },
      { auth: false },
    );
    expect(user.email).toBe('new@shop.test');
    await login('new@shop.test', 'long-enough');
  });

  it('returns 409 for a taken email and 422 for a short password', async () => {
    const taken = await failure(
      api.post(
        '/api/v1/auth/register',
        { email: 'taken@insureintel.test', password: 'long-enough' },
        { auth: false },
      ),
    );
    expect(taken.status).toBe(409);

    const invalid = await failure(
      api.post('/api/v1/auth/register', { email: 'x@y.co', password: 'short' }, { auth: false }),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.details[0].field).toBe('password');
  });

  it('returns 401 for a missing or expired token', async () => {
    expect((await failure(api.get('/api/v1/policies'))).status).toBe(401);
    token = 'mock-token-expired';
    expect((await failure(api.get('/api/v1/auth/me'))).status).toBe(401);
  });
});

describe('policies', () => {
  beforeEach(() => login());

  it('lists the seeded policies, including one with a flagged chunk', async () => {
    const policies = await api.get<PolicyDocument[]>('/api/v1/policies');
    expect(policies.length).toBeGreaterThanOrEqual(2);
    expect(policies.some((p) => p.flagged_chunk_count > 0)).toBe(true);
  });

  it('uploads a PDF and lists it first', async () => {
    const uploaded = await api.post<PolicyDocument>('/api/v1/policies', pdf('my-policy.pdf'));
    expect(uploaded.status).toBe('ready');

    const policies = await api.get<PolicyDocument[]>('/api/v1/policies');
    expect(policies[0].policy_id).toBe(uploaded.policy_id);
  });

  it.each([
    ['big.pdf', 413, 'file_too_large'],
    ['bad.pdf', 400, 'invalid_pdf'],
    ['notes.txt', 400, 'invalid_pdf'],
    ['agent-down.pdf', 503, 'agent_unavailable'],
  ])('rejects %s with %i %s', async (name, status, error) => {
    const err = await failure(api.post('/api/v1/policies', pdf(name)));
    expect(err.status).toBe(status);
    expect(err.error).toBe(error);
  });
});

describe('analyses', () => {
  beforeEach(() => login());

  /** Start a run (202), read its status, then fetch the result like the frontend does. */
  async function run(overrides: Partial<BusinessProfile>) {
    const started = await api.post<AnalysisProgress>('/api/v1/analyses', {
      business: business(overrides),
      policy_ids: await policyIds(),
    });
    expect(started.state).toBe('running');
    const status = await api.get<AnalysisProgress>(`/api/v1/analyses/${started.request_id}/status`);
    return { started, status };
  }

  it.each(['bakery', 'restaurant', 'retail_shop'] as const)(
    'runs a complete %s analysis and adds it to the history',
    async (type) => {
      const { started, status } = await run({ business_type: type, business_name: 'My Business' });
      expect(started.stages.map((s) => s.state)).toEqual(['queued', 'queued', 'queued', 'queued']);
      expect(status.state).toBe('complete');
      expect(status.stages.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
      expect(status.stages[0].received).toMatch(/risks? identified$/);

      const result = await api.get<AnalysisResponse>(`/api/v1/analyses/${started.request_id}`);
      expect(result.status).toBe('complete');
      expect(result.report).not.toBeNull();
      expect(result.risk_profile.business_type).toBe(type);
      expect(result.risk_profile.business_name).toBe('My Business');

      const history = await api.get<AnalysisSummary[]>('/api/v1/analyses');
      expect(history[0].request_id).toBe(started.request_id);
    },
  );

  it('returns a partial result for "Partial Ltd"', async () => {
    const { started, status } = await run({ business_name: 'Partial Ltd' });
    expect(status.state).toBe('partial');
    expect(status.stages.at(-1)!.state).toBe('failed');
    const result = await api.get<AnalysisResponse>(`/api/v1/analyses/${started.request_id}`);
    expect(result.status).toBe('partial');
    expect(result.report).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns every coverage status for "All Statuses"', async () => {
    const { started } = await run({ business_name: 'All Statuses' });
    const result = await api.get<AnalysisResponse>(`/api/v1/analyses/${started.request_id}`);
    const statuses = new Set(result.coverage.assessments.map((a) => a.status));
    expect([...statuses].sort()).toEqual([...COVERAGE_STATUSES].sort());
    expect(result.report!.findings.some((f) => f.generated_by === 'llm')).toBe(true);
  });

  it.each([
    ['Down Ltd', 'agent_unavailable', 'risk_profile', ['failed', 'skipped', 'skipped', 'skipped']],
    ['Timeout Ltd', 'agent_timeout', 'coverage', ['done', 'done', 'failed', 'skipped']],
    [
      'Broken Ltd',
      'agent_bad_response',
      'policy_evidence',
      ['done', 'failed', 'skipped', 'skipped'],
    ],
  ])('fails "%s" with %s at %s', async (name, error, stage, states) => {
    const { started, status } = await run({ business_name: name });
    expect(status.state).toBe('failed');
    expect(status.error).toMatchObject({ error, stage, request_id: started.request_id });
    expect(status.stages.map((s) => s.state)).toEqual(states);
    const err = await failure(api.get(`/api/v1/analyses/${started.request_id}`));
    expect(err).toMatchObject({ status: 404, error: 'analysis_not_found' });
  });

  it('answers 409 for the result of a run that is still going', async () => {
    const started = await api.post<AnalysisProgress>('/api/v1/analyses', {
      business: business(),
      policy_ids: await policyIds(),
    });
    // Make the run take an hour.
    db.jobs.get(started.request_id)!.durations = [3_600_000, 0, 0, 0];
    const err = await failure(api.get(`/api/v1/analyses/${started.request_id}`));
    expect(err).toMatchObject({ status: 409, error: 'analysis_running' });
  });

  it('rebuilds the status of a seeded analysis from its result', async () => {
    const seeded = (await api.get<AnalysisSummary[]>('/api/v1/analyses'))[0];
    const status = await api.get<AnalysisProgress>(`/api/v1/analyses/${seeded.request_id}/status`);
    expect(['complete', 'partial']).toContain(status.state);
    expect(status.stages[0].state).toBe('done');
  });

  it('returns 422 for too many employees and 404 for an unknown policy', async () => {
    const invalid = await failure(
      api.post('/api/v1/analyses', {
        business: business({ employee_count: 300 }),
        policy_ids: await policyIds(),
      }),
    );
    expect(invalid.details[0].field).toBe('business.employee_count');

    const missing = await failure(
      api.post('/api/v1/analyses', { business: business(), policy_ids: ['POL-nope'] }),
    );
    expect(missing).toMatchObject({ status: 404, error: 'policy_not_found' });
  });

  it('returns 404 for an unknown analysis id', async () => {
    const err = await failure(api.get('/api/v1/analyses/does-not-exist'));
    expect(err).toMatchObject({ status: 404, error: 'analysis_not_found' });
  });

  it('lists the history newest first', async () => {
    const history = await api.get<AnalysisSummary[]>('/api/v1/analyses');
    const dates = history.map((h) => h.created_at);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
