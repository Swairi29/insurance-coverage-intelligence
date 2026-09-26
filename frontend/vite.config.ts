/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend only talks to the orchestration gateway (port 8000). The proxy keeps the
// browser on one origin, so the gateway needs no CORS. Use 127.0.0.1: on Windows,
// "localhost" added about 2 s to every call. An analysis can take up to 10 minutes,
// so the proxy must never time out (docs/frontend-plan.md §3.1, §3.4).
const GATEWAY_URL = 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: GATEWAY_URL, proxyTimeout: 0, timeout: 0 },
      '/health': { target: GATEWAY_URL },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
