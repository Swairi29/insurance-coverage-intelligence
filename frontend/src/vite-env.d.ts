/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway origin. Empty in development: the Vite proxy forwards /api and /health. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
