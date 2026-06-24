import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAuth } from './auth.js';
import { getDb, type Db } from './db/index.js';
import { getEnv } from './env.js';
import { sessionMiddleware, type ApiEnv, type GetSessionUser } from './middleware/session.js';
import { createAnalysisRoutes } from './routes/analysis.js';
import { createAnalyticsRoutes } from './routes/analytics.js';
import { createDecksRoutes } from './routes/decks.js';
import { createDemoRoutes } from './routes/demo.js';
import { createLogsRoutes } from './routes/logs.js';
import { createMetaRoutes } from './routes/meta.js';
import { createSnapshotsRoutes } from './routes/snapshots.js';

/** Injection points for tests: a pre-built database and/or session resolver. */
export interface AppDeps {
  db?: Db;
  getSessionUser?: GetSessionUser;
}

/**
 * App factory. Creating the app requires no database: /health is fully
 * DB-free, and both the Better Auth handler and the pg pool (which need
 * DATABASE_URL) are only initialized on the first matching /api request.
 */
export function createApp(deps: AppDeps = {}): Hono {
  const env = getEnv();
  const app = new Hono();

  // CORS must be registered before the routes (Better Auth requirement).
  app.use(
    '*',
    cors({
      origin: env.webOrigin,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok', service: 'pokekon-api' }));

  // Registered before the session-guarded /api sub-app so Better Auth handles
  // its own routes (sign-in must work without a session).
  app.on(['POST', 'GET'], '/api/auth/*', (c) => getAuth().handler(c.req.raw));

  const api = new Hono<ApiEnv>();
  api.use('*', sessionMiddleware(deps.getSessionUser));
  api.use('*', async (c, next) => {
    c.set('db', deps.db ?? getDb());
    await next();
  });
  api.route('/decks', createDecksRoutes());
  api.route('/snapshots', createSnapshotsRoutes());
  api.route('/logs', createLogsRoutes());
  api.route('/analytics', createAnalyticsRoutes());
  api.route('/analysis', createAnalysisRoutes());
  api.route('/meta', createMetaRoutes());
  api.route('/demo', createDemoRoutes());
  app.route('/api', api);

  return app;
}
