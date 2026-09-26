import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { AppProviders } from '../AppProviders';
import { createQueryClient } from '../queryClient';

/** Shows the current URL, so tests can check redirects. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/**
 * Renders the whole app (providers, routes) at `route`, against the mock API. `route` can
 * carry navigation state: `{ pathname: '/app/profile', state: {...} }`.
 */
export function renderApp(route: string | { pathname: string; state?: unknown } = '/') {
  const client = createQueryClient({ retryDelay: 0 });
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders client={client}>
        <App />
        <LocationProbe />
      </AppProviders>
    </MemoryRouter>,
  );
  return { ...result, user, client };
}
