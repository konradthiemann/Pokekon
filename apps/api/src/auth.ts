import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { getDb } from './db/index.js';
import * as schema from './db/schema.js';
import { getEnv } from './env.js';
import { sendPasswordResetEmail } from './email.js';

function createAuth() {
  const env = getEnv();
  const googleEnabled = env.googleClientId !== undefined && env.googleClientSecret !== undefined;

  // Stable placeholder domain for the throwaway emails the anonymous plugin
  // generates (temp-<id>@<domain>) — derived from the web origin so it never
  // collides with a real user's email, regardless of deploy environment.
  let emailDomainName = 'pokekon.local';
  try {
    emailDomainName = new URL(env.webOrigin).hostname || emailDomainName;
  } catch {
    // keep the fallback when webOrigin isn't a parseable absolute URL
  }

  const options: BetterAuthOptions = {
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    // Guest/demo accounts: a single click creates a throwaway user (isAnonymous),
    // which the /api/demo/seed route then fills with sample decks + matches.
    plugins: [anonymous({ emailDomainName })],
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ to: user.email, url });
      },
    },
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
