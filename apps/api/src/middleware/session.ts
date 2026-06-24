import type { MiddlewareHandler } from 'hono';
import { getAuth } from '../auth.js';
import type { Db } from '../db/index.js';

/** The slice of the Better Auth user the domain routes need. */
export interface SessionUser {
  id: string;
  /** True for throwaway guest accounts created by the `anonymous` plugin. */
  isAnonymous: boolean;
}

/** Resolves the authenticated user from request headers, or null when unauthenticated. */
export type GetSessionUser = (headers: Headers) => Promise<SessionUser | null>;

/** Hono environment for everything mounted under /api (except /api/auth). */
export interface ApiEnv {
  Variables: {
    user: SessionUser;
    db: Db;
  };
}

const defaultGetSessionUser: GetSessionUser = async (headers) => {
  const session = await getAuth().api.getSession({ headers });
  if (session === null) return null;
  // `isAnonymous` is contributed by the anonymous plugin; default to false for
  // ordinary accounts (and older sessions issued before the column existed).
  const isAnonymous = (session.user as { isAnonymous?: boolean | null }).isAnonymous ?? false;
  return { id: session.user.id, isAnonymous };
};

/**
 * Requires a valid Better Auth session: responds 401 without one, otherwise
 * puts the session user on the context. The session lookup is injectable so
 * tests can authenticate without a Better Auth instance (and without a
 * DATABASE_URL).
 */
export function sessionMiddleware(
  getSessionUser: GetSessionUser = defaultGetSessionUser,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (user === null) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', user);
    await next();
  };
}
