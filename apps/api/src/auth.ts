import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { getDb } from './db/index.js';
import * as schema from './db/schema.js';
import { getEnv } from './env.js';

function createAuth() {
  const env = getEnv();
  const googleEnabled = env.googleClientId !== undefined && env.googleClientSecret !== undefined;

  const options: BetterAuthOptions = {
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    emailAndPassword: { enabled: true },
    trustedOrigins: [env.webOrigin],
    ...(env.betterAuthSecret !== undefined ? { secret: env.betterAuthSecret } : {}),
    ...(env.betterAuthUrl !== undefined ? { baseURL: env.betterAuthUrl } : {}),
    ...(googleEnabled
      ? {
          socialProviders: {
            google: {
              clientId: env.googleClientId as string,
              clientSecret: env.googleClientSecret as string,
            },
          },
        }
      : {}),
  };

  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/**
 * Lazily initialized Better Auth instance. Initialization touches the
 * database configuration (DATABASE_URL, BETTER_AUTH_SECRET), so it only
 * happens on the first /api/auth/* request — never at import time.
 */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
