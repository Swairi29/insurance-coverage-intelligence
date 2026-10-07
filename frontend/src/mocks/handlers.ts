// Mock gateway API (MSW). Answers like services/orchestration/api.py, with the same
// status codes and error bodies (docs/frontend-plan.md §3.2, §3.3).
//
// Demo login: demo@insureintel.test / demo-password-1 (any registered account works too).
// All accounts share the seeded policies and analyses.
//
// Magic inputs that trigger the error paths:
//   login     password "wrong"                -> 401 (the 6th in a row -> 429 with Retry-After)
//             password "server-down"          -> 503 login_unavailable
//   register  email taken@insureintel.test    -> 409 email_taken (so is an existing email)
//             password shorter than 8         -> 422 with details
//   token     "mock-token-expired"            -> 401 on any authenticated call
//   upload    not a .pdf, or bad.pdf          -> 400 invalid_pdf
//             big.pdf (or > 25 MB)            -> 413 file_too_large
//             agent-down.pdf                  -> 503 agent_unavailable, stage policy_upload
//             a name containing "flagged"     -> uploaded with 1 flagged chunk
//   analysis  POST answers 202; GET .../status then walks through the four agents.
//             business_name "Down Ltd"        -> fails at risk_profile (agent_unavailable)
//             business_name "Timeout Ltd"     -> fails at coverage (agent_timeout)
//             business_name "Broken Ltd"      -> fails at policy_evidence (agent_bad_response)
//             business_name "Partial Ltd"     -> status "partial" (Agent 4 down)
//             business_name "All Statuses"    -> one finding of every coverage status
//             business_name containing "Slow" -> each agent takes 6x longer
//             employee_count > 250            -> 422 with details
//             an unknown policy id            -> 404 policy_not_found
//   question  containing "too many"           -> 429 too_many_questions (Retry-After 42)
//             containing "agent down"         -> 503 agent_unavailable, stage question
//             otherwise a rule-based answer from the analysis (mocks/answers.ts)

import { delay, http, HttpResponse } from 'msw';
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisStage,
  AskQuestionRequest,
  BusinessProfile,
  ErrorResponse,
  GatewayError,
  LoginRequest,
  PolicyDocument,
  RegisterRequest,
  Stage,
  TokenResponse,
  UserResponse,
} from '../api/types';
import { CONSENT_VERSION } from '../lib/consent';
import { db, newId, sortNewestFirst } from './db';
import { allStatusesAnalysis, analysisByType, partialAnalysis } from './fixtures';
import { mockAnswer } from './answers';
import { progressAt, queuedProgress, type MockJob } from './jobs';

// '*' matches any origin: the page's own in the browser, http://localhost:3000 in tests.
const API = '*/api/v1';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 15 * 60;
const TOKEN_PREFIX = 'mock-token-';
/** Fake time per agent (risk, policy, coverage, report). Zero in tests. */
const STAGE_MS = [1200, 1500, 1800, 3500];
const SLOW_FACTOR = 6;

/** Fake server time, so loading states can be seen. Skipped in tests. */
const wait = (ms: number) => (import.meta.env.MODE === 'test' ? Promise.resolve() : delay(ms));

// --- helpers --------------------------------------------------------------------------------

function gatewayError(
  status: number,
  error: string,
  message: string,
  extra: { stage?: Stage; request_id?: string } = {},
) {
  const body: GatewayError = { error, message, ...extra };
  const headers: Record<string, string> = extra.request_id
    ? { 'X-Request-ID': extra.request_id }
    : {};
  return HttpResponse.json(body, { status, headers });
}

function validationError(details: ErrorResponse['details']) {
  const body: ErrorResponse = {
    error: 'validation_error',
    message: 'The request could not be processed because some input was invalid.',
    details,
  };
  return HttpResponse.json(body, { status: 422 });
}

const unauthorized = () =>
  HttpResponse.json({ detail: 'Invalid or expired token.' }, { status: 401 });

/** The user for a valid bearer token, or null. Tokens look like "mock-token-<email>". */
function currentUser(request: Request): UserResponse | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token.startsWith(TOKEN_PREFIX) || token === `${TOKEN_PREFIX}expired`) return null;
  const email = token.slice(TOKEN_PREFIX.length);
  // Unknown emails still pass, so a token kept in sessionStorage survives a page reload.
  return db.users.get(email)?.user ?? { ...db.users.values().next().value!.user, email };
}

const AGENT_MESSAGES: Record<string, string> = {
  agent_unavailable: 'A required analysis service is not available. Please try again later.',
  agent_timeout: 'An analysis service took too long to respond. Please try again.',
  agent_bad_response: 'An analysis service could not complete the request.',
};

const FAILING_BUSINESSES: Record<string, { status: number; error: string; stage: AnalysisStage }> =
  {
    'down ltd': { status: 503, error: 'agent_unavailable', stage: 'risk_profile' },
    'timeout ltd': { status: 504, error: 'agent_timeout', stage: 'coverage' },
    'broken ltd': { status: 502, error: 'agent_bad_response', stage: 'policy_evidence' },
  };

function buildAnalysis(business: BusinessProfile, requestId: string): AnalysisResponse {
  const name = business.business_name.trim().toLowerCase();
  const template =
    name === 'partial ltd'
      ? partialAnalysis
      : name === 'all statuses'
        ? allStatusesAnalysis
        : ((analysisByType as Partial<Record<string, AnalysisResponse>>)[business.business_type] ??
          analysisByType.bakery);
  const analysis = structuredClone(template);
  analysis.request_id = requestId;
  analysis.created_at = new Date().toISOString();
  analysis.risk_profile.request_id = requestId;
  analysis.risk_profile.business_name = business.business_name;
  analysis.coverage.request_id = requestId;
  if (analysis.report) analysis.report.request_id = requestId;
  return analysis;
}

/** Store a finished run once, like the gateway does when the pipeline ends. */
function saveFinished(job: MockJob): void {
  if (job.saved || !job.result) return;
  job.saved = true;
  const analysis = job.result;
  db.analyses.set(job.requestId, analysis);
  const counts = analysis.report
    ? analysis.report.summary
    : {
        total_findings: analysis.coverage.assessments.length,
        potential_gaps: analysis.coverage.assessments.filter((a) => a.potential_gap).length,
      };
  db.summaries = sortNewestFirst([
    {
      request_id: job.requestId,
      status: analysis.status,
      created_at: analysis.created_at,
      total_findings: counts.total_findings,
      potential_gaps: counts.potential_gaps,
    },
    ...db.summaries,
  ]);
}

/** The status of a seeded analysis, rebuilt from its result like the gateway does. */
function progressFromSaved(analysis: AnalysisResponse) {
  const start = Date.parse(analysis.created_at);
  const durations = (['risk_profile', 'policy_evidence', 'coverage', 'report'] as const).map(
    (stage) => analysis.stage_ms[stage] ?? 0,
  );
  const job: MockJob = {
    requestId: analysis.request_id,
    startedAt: start - durations.reduce((a, b) => a + b, 0),
    durations,
    result: analysis,
    policyCount: new Set(
      analysis.coverage.assessments.flatMap((a) => a.evidence.map((e) => e.policy_id)),
    ).size,
    saved: true,
  };
  return progressAt(job, Date.now());
}

// --- handlers -------------------------------------------------------------------------------

export const handlers = [
  // health
  http.get('*/health', () =>
    HttpResponse.json({ status: 'healthy', agent: 'orchestration-gateway' }),
  ),
  http.get('*/health/agents', () =>
    HttpResponse.json({
      status: 'healthy',
      agents: { risk_profile: 'up', policy_evidence: 'up', coverage: 'up', report: 'up' },
    }),
  ),

  // auth
  http.post(`${API}/auth/register`, async ({ request }) => {
    const {
      email = '',
      password = '',
      consent_version: consentVersion,
    } = (await request.json()) as Partial<RegisterRequest>;
    const normalised = email.trim().toLowerCase();
    const details: ErrorResponse['details'] = [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
      details.push({ field: 'email', message: 'email must be a valid email address.' });
    }
    if (password.length < 8) {
      details.push({ field: 'password', message: 'String should have at least 8 characters' });
    }
    if (consentVersion !== CONSENT_VERSION) {
      details.push({
        field: 'consent_version',
        message: 'Please agree to the current privacy and data processing notice.',
      });
    }
    if (details.length) return validationError(details);
    if (normalised === 'taken@insureintel.test' || db.users.has(normalised)) {
      return gatewayError(409, 'email_taken', 'An account with this email already exists.');
    }
    const user: UserResponse = {
      user_id: crypto.randomUUID(),
      email: normalised,
      business_id: db.users.values().next().value!.user.business_id,
      created_at: new Date().toISOString(),
      consent_version: consentVersion,
      consented_at: new Date().toISOString(),
    };
    db.users.set(normalised, { password, user });
    return HttpResponse.json(user, { status: 201 });
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email = '', password = '' } = (await request.json()) as Partial<LoginRequest>;
    const normalised = email.trim().toLowerCase();
    const failures = db.failedLogins.get(normalised) ?? 0;
    if (failures >= MAX_FAILED_LOGINS) {
      return HttpResponse.json(
        {
          error: 'too_many_attempts',
          message: 'Too many failed logins. Please wait a few minutes and try again.',
        } satisfies GatewayError,
        { status: 429, headers: { 'Retry-After': String(LOCKOUT_SECONDS) } },
      );
    }
    if (password === 'server-down') {
      return gatewayError(503, 'login_unavailable', 'Login is not available right now.');
    }
    const account = db.users.get(normalised);
    const wrong = password === 'wrong' || (account !== undefined && account.password !== password);
    if (wrong || !normalised) {
      db.failedLogins.set(normalised, failures + 1);
      return HttpResponse.json({ detail: 'Invalid email or password.' }, { status: 401 });
    }
    db.failedLogins.delete(normalised);
    const body: TokenResponse = {
      access_token: `${TOKEN_PREFIX}${normalised}`,
      token_type: 'bearer',
      expires_in: 3600,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const user = currentUser(request);
    return user ? HttpResponse.json(user) : unauthorized();
  }),

  // policies
  http.get(`${API}/policies`, ({ request }) => {
    if (!currentUser(request)) return unauthorized();
    return HttpResponse.json(db.policies);
  }),

  http.post(`${API}/policies`, async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const requestId = newId();
    const file = (await request.formData()).get('file');
    if (!file || typeof file === 'string') {
      return validationError([{ field: 'file', message: 'Field required' }]);
    }
    const name = file.name.toLowerCase();
    await wait(800);
    if (name === 'big.pdf' || file.size > MAX_UPLOAD_BYTES) {
      return gatewayError(413, 'file_too_large', 'The file is larger than 25 MB.', {
        request_id: requestId,
      });
    }
    if (!name.endsWith('.pdf') || name === 'bad.pdf') {
      return gatewayError(400, 'invalid_pdf', 'The file is not a valid PDF.', {
        request_id: requestId,
      });
    }
    if (name === 'agent-down.pdf') {
      return gatewayError(503, 'agent_unavailable', AGENT_MESSAGES.agent_unavailable, {
        stage: 'policy_upload',
        request_id: requestId,
      });
    }
    const document: PolicyDocument = {
      policy_id: newId('POL'),
      business_id: user.business_id,
      filename: file.name,
      status: 'ready',
      page_count: 3,
      chunk_count: 6,
      flagged_chunk_count: name.includes('flagged') ? 1 : 0,
      uploaded_at: new Date().toISOString(),
    };
    db.policies = [document, ...db.policies]; // newest first, like the gateway
    return HttpResponse.json(
      { ...document, warnings: [] },
      { headers: { 'X-Request-ID': requestId } },
    );
  }),

  // analyses
  http.post(`${API}/analyses`, async ({ request }) => {
    if (!currentUser(request)) return unauthorized();
    const requestId = newId();
    const body = (await request.json()) as AnalysisRequest;
    const { business, policy_ids: policyIds = [] } = body;

    if ((business?.employee_count ?? 0) > 250) {
      return validationError([
        { field: 'business.employee_count', message: 'Input should be less than or equal to 250' },
      ]);
    }
    if (policyIds.length < 1 || policyIds.length > 5) {
      return validationError([
        { field: 'policy_ids', message: 'List should have between 1 and 5 items' },
      ]);
    }
    const known = new Set(db.policies.map((p) => p.policy_id));
    if (!policyIds.every((id) => known.has(id))) {
      return gatewayError(
        404,
        'policy_not_found',
        'One or more policies were not found for your account.',
        {
          request_id: requestId,
        },
      );
    }

    const name = business.business_name.trim().toLowerCase();
    const failure = FAILING_BUSINESSES[name];
    const factor = name.includes('slow') ? SLOW_FACTOR : 1;
    const job: MockJob = {
      requestId,
      startedAt: Date.now(),
      // Instant in tests, except "Slow" names, which let a test see a run in progress.
      durations: STAGE_MS.map((ms) =>
        import.meta.env.MODE === 'test' && factor === 1 ? 0 : ms * factor,
      ),
      result: failure ? null : buildAnalysis(business, requestId),
      policyCount: policyIds.length,
      failure: failure && {
        stage: failure.stage,
        error: {
          error: failure.error,
          message: AGENT_MESSAGES[failure.error],
          stage: failure.stage,
          request_id: requestId,
        },
      },
      saved: false,
    };
    db.jobs.set(requestId, job);
    return HttpResponse.json(queuedProgress(job), {
      status: 202,
      headers: { 'X-Request-ID': requestId },
    });
  }),

  http.get(`${API}/analyses/:requestId/status`, ({ request, params }) => {
    if (!currentUser(request)) return unauthorized();
    const requestId = String(params.requestId);
    const job = db.jobs.get(requestId);
    if (job) {
      const progress = progressAt(job, Date.now());
      if (progress.state !== 'running' && progress.state !== 'failed') saveFinished(job);
      return HttpResponse.json(progress);
    }
    const saved = db.analyses.get(requestId);
    return saved
      ? HttpResponse.json(progressFromSaved(saved))
      : gatewayError(404, 'analysis_not_found', 'Analysis not found.');
  }),

  http.post(`${API}/analyses/:requestId/questions`, async ({ request, params }) => {
    if (!currentUser(request)) return unauthorized();
    const requestId = String(params.requestId);
    const { question = '' } = (await request.json()) as Partial<AskQuestionRequest>;
    const text = question.replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 500 || !/[\p{L}\p{N}]/u.test(text)) {
      return validationError([
        { field: 'question', message: 'String should have between 3 and 500 characters' },
      ]);
    }
    const analysis = db.analyses.get(requestId);
    if (!analysis) return gatewayError(404, 'analysis_not_found', 'Analysis not found.');
    const lower = text.toLowerCase();
    if (lower.includes('too many')) {
      return HttpResponse.json(
        {
          error: 'too_many_questions',
          message: 'Too many questions in a short time. Please wait 42 seconds.',
        } satisfies GatewayError,
        { status: 429, headers: { 'Retry-After': '42' } },
      );
    }
    if (lower.includes('agent down')) {
      return gatewayError(503, 'agent_unavailable', AGENT_MESSAGES.agent_unavailable, {
        stage: 'question',
        request_id: newId(),
      });
    }
    await wait(900);
    return HttpResponse.json(mockAnswer(analysis, text));
  }),

  http.get(`${API}/analyses`, ({ request }) => {
    if (!currentUser(request)) return unauthorized();
    return HttpResponse.json(db.summaries);
  }),

  // The mock API runs no scenario analyses, so the saved list is always empty.
  http.get(`${API}/scenario-analyses`, ({ request }) => {
    if (!currentUser(request)) return unauthorized();
    return HttpResponse.json([]);
  }),

  http.get(`${API}/analyses/:requestId`, ({ request, params }) => {
    if (!currentUser(request)) return unauthorized();
    const requestId = String(params.requestId);
    const job = db.jobs.get(requestId);
    if (job && progressAt(job, Date.now()).state === 'running') {
      return gatewayError(409, 'analysis_running', 'The analysis is still running.', {
        request_id: requestId,
      });
    }
    if (job) saveFinished(job);
    const analysis = db.analyses.get(requestId);
    return analysis
      ? HttpResponse.json(analysis)
      : gatewayError(404, 'analysis_not_found', 'Analysis not found.');
  }),
];
