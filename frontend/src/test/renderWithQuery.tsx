import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createQueryClient } from '../queryClient';

/** Renders a component that uses TanStack Query, with a fresh cache and no retries. */
export function renderWithQuery(ui: ReactElement) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}
