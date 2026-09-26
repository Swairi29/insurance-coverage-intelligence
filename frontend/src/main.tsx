import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProviders } from './AppProviders';
import { createQueryClient } from './queryClient';
import { ROUTER_FUTURE } from './routerFuture';
import './index.css';

/** With VITE_USE_MOCKS=true (`npm run dev:mocks`) the mock API answers instead of the gateway. */
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter future={ROUTER_FUTURE}>
        <AppProviders client={createQueryClient()}>
          <App />
        </AppProviders>
      </BrowserRouter>
    </StrictMode>,
  );
});
