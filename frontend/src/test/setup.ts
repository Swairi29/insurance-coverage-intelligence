import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { resetMockDb } from '../mocks/db';
import { server } from '../mocks/server';

// Every test talks to the mock API. A request with no handler fails the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetMockDb());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
