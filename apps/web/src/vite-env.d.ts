/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API server (Better Auth routes at /api/auth/*). */
  readonly VITE_API_URL: string;
  /** Build-time default for the `archetypeCoachUi` feature flag (exactly "true" = on). */
  readonly VITE_FF_ARCHETYPE_COACH_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
