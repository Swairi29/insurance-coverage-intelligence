/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway origin. Empty in development: the Vite proxy forwards /api and /health. */
  readonly VITE_API_BASE_URL?: string;
  /** "true" answers every API call from the mock API in src/mocks (no backend needed). */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
