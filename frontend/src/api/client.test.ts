import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  UNAVAILABLE_MESSAGE,
  api,
  configureApiClient,
  parseRetryAfter,
} from './client';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

function sentHeaders(): Record<string, string> {
  return (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
}

const onUnauthorized = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  onUnauthorized.mockReset();
  configureApiClient({ getToken: () => 'token-123', onUnauthorized });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('successful requests', () => {
  it('returns parsed JSON and sends the bearer token', async () => {
    vi.stubEnv('VITE_API_BASE_URL', ''); // as in development: relative URLs, the Vite proxy
    fetchMock.mockResolvedValue(jsonResponse(200, [{ policy_id: 'p1' }]));

    const result = await api.get<{ policy_id: string }[]>('/api/v1/policies');

    expect(result).toEqual([{ policy_id: 'p1' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/policies');
    expect(sentHeaders().Authorization).toBe('Bearer token-123');
  });

  it('prefixes VITE_API_BASE_URL when it is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://gateway.example');
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await api.get('/api/v1/policies');

    expect(fetchMock.mock.calls[0][0]).toBe('https://gateway.example/api/v1/policies');
  });

  it('sends a JSON body with a content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await api.post('/api/v1/analyses', { policy_ids: ['p1'] });

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"policy_ids":["p1"]}');
    expect(sentHeaders()['Content-Type']).toBe('application/json');
  });

  it('sends FormData as-is so the browser sets the multipart boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { policy_id: 'p1' }));
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4']), 'policy.pdf');

    await api.post('/api/v1/policies', form);

    expect(fetchMock.mock.calls[0][1]!.body).toBe(form);
    expect(sentHeaders()['Content-Type']).toBeUndefined();
  });

  it('does not send the token when auth is false', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 't' }));

    await api.post('/api/v1/auth/login', { email: 'a@b.co', password: 'x' }, { auth: false });

    expect(sentHeaders().Authorization).toBeUndefined();
  });

  it('returns undefined for an empty body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.post('/api/v1/something')).resolves.toBeUndefined();
  });
});

describe('401', () => {
  it('uses the detail message and calls onUnauthorized when a token was sent', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid or expired token.' }));

    const err = await catchError(api.get('/api/v1/auth/me'));

    expect(err.status).toBe(401);
    expect(err.error).toBe('unauthorized');
    expect(err.message).toBe('Invalid or expired token.');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not call onUnauthorized for a wrong login (no token sent)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid email or password.' }));

    const err = await catchError(
      api.post('/api/v1/auth/login', { email: 'a@b.co', password: 'bad' }, { auth: false }),
    );

    expect(err.message).toBe('Invalid email or password.');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('falls back to a session-expired message without a detail', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    const err = await catchError(api.get('/api/v1/policies'));

    expect(err.message).toBe(SESSION_EXPIRED_MESSAGE);
  });
});

describe('error bodies', () => {
  it('maps a 422 ErrorResponse with field details', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: 'validation_error',
        message: 'The request could not be processed because some input was invalid.',
        details: [
          {
            field: 'business.employee_count',
            message: 'Input should be less than or equal to 250',
          },
        ],
      }),
    );

    const err = await catchError(api.post('/api/v1/analyses', {}));

    expect(err.status).toBe(422);
    expect(err.error).toBe('validation_error');
    expect(err.details).toEqual([
      { field: 'business.employee_count', message: 'Input should be less than or equal to 250' },
    ]);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('maps a 429 with Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        429,
        {
          error: 'too_many_attempts',
          message: 'Too many failed logins. Please wait a few minutes and try again.',
        },
        { 'Retry-After': '840' },
      ),
    );

    const err = await catchError(api.post('/api/v1/auth/login', {}, { auth: false }));

    expect(err.status).toBe(429);
    expect(err.error).toBe('too_many_attempts');
    expect(err.retryAfter).toBe(840);
  });

  it('maps a GatewayError with stage and request id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(504, {
        error: 'agent_timeout',
        message: 'An analysis service took too long to respond. Please try again.',
        stage: 'coverage',
        request_id: 'abc123',
      }),
    );

    const err = await catchError(api.post('/api/v1/analyses', {}));

    expect(err.status).toBe(504);
    expect(err.error).toBe('agent_timeout');
    expect(err.stage).toBe('coverage');
    expect(err.requestId).toBe('abc123');
    expect(err.message).toBe('An analysis service took too long to respond. Please try again.');
  });

  it('maps a GatewayError without stage (e.g. 413)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(413, { error: 'file_too_large', message: 'The file is larger than 25 MB.' }),
    );

    const err = await catchError(api.post('/api/v1/policies', new FormData()));

    expect(err.error).toBe('file_too_large');
    expect(err.stage).toBeUndefined();
  });

  it('gives a friendly message for a 502 with no body (gateway not running)', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502 }));

    const err = await catchError(api.get('/api/v1/policies'));

    expect(err.error).toBe('server_unavailable');
    expect(err.message).toBe(UNAVAILABLE_MESSAGE);
  });

  it('never exposes a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Traceback ...</html>', { status: 500 }));

    const err = await catchError(api.get('/api/v1/policies'));

    expect(err.error).toBe('http_error');
    expect(err.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('treats an unparseable success body as an error', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    const err = await catchError(api.get('/api/v1/policies'));

    expect(err.error).toBe('bad_response');
  });
});

describe('network failures', () => {
  it('throws a network_error with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await catchError(api.get('/api/v1/policies'));

    expect(err.status).toBe(0);
    expect(err.error).toBe('network_error');
    expect(err.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('rethrows an abort unchanged', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(api.get('/api/v1/policies')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('reads an HTTP date', () => {
    const now = Date.parse('2026-09-26T10:00:00Z');
    expect(parseRetryAfter('Sat, 26 Sep 2026 10:02:00 GMT', now)).toBe(120);
  });

  it('ignores missing or invalid values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});
