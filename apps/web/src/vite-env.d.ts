/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API server (Better Auth routes at /api/auth/*). */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
