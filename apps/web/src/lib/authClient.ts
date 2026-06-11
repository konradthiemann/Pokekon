import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client. The auth routes live under /api/auth/*.
 *
 * baseURL resolution:
 * - Dev: VITE_API_URL is unset — requests go to the same origin
 *   (localhost:5173) and the Vite proxy forwards /api to the API server.
 *   This keeps the session cookie first-party; a direct cross-origin call
 *   to the API would get its cookie dropped by modern browsers.
 * - Production: VITE_API_URL is set when web and API are served from
 *   different origins of the same site, or left unset behind a shared domain.
 *
 * Session state is shared app-wide via the `useSession` hook (nanostore
 * under the hood), so signing in anywhere updates every consumer reactively.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || window.location.origin,
});
