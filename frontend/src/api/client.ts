// fetch wrapper for the orchestration gateway (docs/frontend-plan.md §3).
//
// Every failed call throws an `ApiError` with a message that is safe to show to the user.
// The auth code (step 4) plugs in the token and the 401 handler with `configureApiClient`,
// so this file does not depend on React.

import type { ErrorResponse, GatewayError, Stage, ValidationErrorDetail } from './types';

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and try again.';
export const UNAVAILABLE_MESSAGE = 'The server is not available right now. Please try again later.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number;
  /** Machine-readable code, e.g. "file_too_large", "agent_timeout", "validation_error". */
  readonly error: string;
  /** Pipeline step that failed (502/503/504 from an analysis or upload). */
  readonly stage?: Stage;
  /** Per-field problems from a 422. */
  readonly details: ValidationErrorDetail[];
  /** Seconds to wait before trying again (429). */
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(init: {
    status: number;
    error: string;
    message: string;
    stage?: Stage;
    details?: ValidationErrorDetail[];
    retryAfter?: number;
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.error = init.error;
    this.stage = init.stage;
    this.details = init.details ?? [];
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

// --- configuration (set by the auth code) -----------------------------------------------------

interface ClientConfig {
  getToken: () => string | null;
  /** Called when a request that carried a token gets 401 (the token expired or was revoked). */
  onUnauthorized: () => void;
}

const config: ClientConfig = {
  getToken: () => null,
  onUnauthorized: () => {},
};

export function configureApiClient(options: Partial<ClientConfig>): void {
  Object.assign(config, options);
}

// --- requests ---------------------------------------------------------------------------------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON, or as multipart when it is a FormData. */
  body?: unknown;
  signal?: AbortSignal;
  /** Send the bearer token (default true). Login and register set this to false. */
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, auth = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };

  const token = auth ? config.getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, error: 'network_error', message: NETWORK_ERROR_MESSAGE });
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    if (response.status === 401 && token) config.onUnauthorized();
    throw apiError;
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      status: response.status,
      error: 'bad_response',
      message: GENERIC_ERROR_MESSAGE,
    });
  }
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
};

// --- error mapping (plan §3.3) ----------------------------------------------------------------

async function toApiError(response: Response): Promise<ApiError> {
  const { status } = response;
  const body = await readJson(response);
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  const requestId = response.headers.get('X-Request-ID') ?? undefined;

  // 401 from the auth code: {"detail": "..."}
  if (status === 401) {
    const detail = isRecord(body) && typeof body.detail === 'string' ? body.detail : null;
    return new ApiError({
      status,
      error: 'unauthorized',
      message: detail ?? SESSION_EXPIRED_MESSAGE,
    });
  }

  // 422: ErrorResponse with per-field details
  if (isValidationError(body)) {
    return new ApiError({
      status,
      error: body.error,
      message: body.message,
      details: body.details,
      retryAfter,
      requestId,
    });
  }

  // Every other gateway error: GatewayError
  if (isGatewayError(body)) {
    return new ApiError({
      status,
      error: body.error,
      message: body.message,
      stage: body.stage,
      retryAfter,
      requestId: body.request_id ?? requestId,
    });
  }

  // No usable body, e.g. the dev proxy answering 502 because the gateway is not running.
  const unavailable = status === 502 || status === 503 || status === 504;
  return new ApiError({
    status,
    error: unavailable ? 'server_unavailable' : 'http_error',
    message: unavailable ? UNAVAILABLE_MESSAGE : GENERIC_ERROR_MESSAGE,
    retryAfter,
    requestId,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

/** Retry-After is either seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidationError(body: unknown): body is ErrorResponse {
  return (
    isRecord(body) &&
    body.error === 'validation_error' &&
    typeof body.message === 'string' &&
    Array.isArray(body.details)
  );
}

function isGatewayError(body: unknown): body is GatewayError {
  return isRecord(body) && typeof body.error === 'string' && typeof body.message === 'string';
}
