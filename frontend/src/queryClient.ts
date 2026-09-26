import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api/client';

/** Retry a failed read once, but never a 4xx: asking again gives the same answer. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 30_000 },
      // Writes (upload, analysis) are never retried automatically (plan §3.4).
      mutations: { retry: false },
    },
  });
}
