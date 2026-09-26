import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { clearToken } from '../auth/tokenStorage';
import { resetMockDb } from '../mocks/db';
import { server } from '../mocks/server';

// findBy*/waitFor wait up to 3 s (default 1 s), so tests stay steady on a busy laptop.
configure({ asyncUtilTimeout: 3000 });

// Every test talks to the mock API. A request with no handler fails the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  // Node's fetch cannot resolve relative URLs, so API calls get an absolute origin.
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  resetMockDb();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllEnvs();
  clearToken();
  try {
    window.sessionStorage.clear();
  } catch {
    // no DOM in node-environment tests
  }
});
afterAll(() => server.close());
