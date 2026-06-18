/**
 * Typed environment access without extra dependencies.
 *
 * All values are read lazily from `process.env` so that importing this module
 * (e.g. in tests or during build) never throws. `databaseUrl` and
 * `betterAuthSecret` are exposed as getters and only validated when actually
 * accessed — the /health endpoint and the test suite never touch them.
 */

const DEFAULT_PORT = 8080;
const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';
const DEFAULT_EMAIL_FROM = 'Pokekon <onboarding@resend.dev>';

export interface Env {
  /** HTTP port the server listens on. Default: 8080. */
  readonly port: number;
  /** Allowed browser origin for CORS (with credentials). Default: http://localhost:5173. */
  readonly webOrigin: string;
  /** Public base URL of this API (used by Better Auth for callbacks). Optional. */
  readonly betterAuthUrl: string | undefined;
  /** Google OAuth credentials. Both must be set to enable the Google provider. */
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  /** Resend API key. When unset, emails are logged to stdout instead of sent. */
  readonly resendApiKey: string | undefined;
  /** From address for transactional emails. Default: Pokekon <onboarding@resend.dev>. */
  readonly emailFrom: string;
  /** Postgres connection string. Required at runtime for DB access — throws when missing. */
  readonly databaseUrl: string;
  /** Better Auth signing secret. Required in production — throws when missing there. */
  readonly betterAuthSecret: string | undefined;
  /** AES key (32 bytes, hex/base64) for encrypting per-user LLM API keys. Throws when accessed unset. */
  readonly encryptionKey: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

function parsePort(value: string | undefined): number {
  if (nonEmpty(value) === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${value}" — expected an integer between 0 and 65535.`);
  }
  return port;
}

export function getEnv(): Env {
  return {
    port: parsePort(process.env.PORT),
    webOrigin: nonEmpty(process.env.WEB_ORIGIN) ?? DEFAULT_WEB_ORIGIN,
    betterAuthUrl: nonEmpty(process.env.BETTER_AUTH_URL),
    googleClientId: nonEmpty(process.env.GOOGLE_CLIENT_ID),
    googleClientSecret: nonEmpty(process.env.GOOGLE_CLIENT_SECRET),
    resendApiKey: nonEmpty(process.env.RESEND_API_KEY),
    emailFrom: nonEmpty(process.env.EMAIL_FROM) ?? DEFAULT_EMAIL_FROM,

    get databaseUrl(): string {
      const url = nonEmpty(process.env.DATABASE_URL);
      if (url === undefined) {
        throw new Error(
          'DATABASE_URL is not set. It is required for database access (auth endpoints, migrations).',
        );
      }
      return url;
    },

    get betterAuthSecret(): string | undefined {
      const secret = nonEmpty(process.env.BETTER_AUTH_SECRET);
      if (secret === undefined && process.env.NODE_ENV === 'production') {
        throw new Error('BETTER_AUTH_SECRET is required in production.');
      }
      return secret;
    },

    get encryptionKey(): string {
      const key = nonEmpty(process.env.ENCRYPTION_KEY);
      if (key === undefined) {
        throw new Error(
          'ENCRYPTION_KEY is not set. It is required to encrypt per-user LLM API keys at rest (32 bytes, hex or base64).',
        );
      }
      return key;
    },
  };
}
