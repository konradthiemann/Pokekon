import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAuth } from './auth.js';
import { getEnv } from './env.js';

/**
 * App factory. Creating the app requires no database: /health is fully
 * DB-free, and the Better Auth handler (which needs DATABASE_URL) is only
 * initialized on the first /api/auth/* request.
 */
export function createApp(): Hono {
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

  app.on(['POST', 'GET'], '/api/auth/*', (c) => getAuth().handler(c.req.raw));

  return app;
}
