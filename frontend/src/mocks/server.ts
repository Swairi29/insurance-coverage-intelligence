// The mock API for tests (Node). Started in src/test/setup.ts.
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
