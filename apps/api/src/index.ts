import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { getEnv } from './env.js';
import { registerStaticServing, resolveWebDistPath } from './static.js';

const env = getEnv();
const app = createApp();

// Single-origin deployment: serve the built web app from this process so the
// session cookie is first-party. Must run after createApp registered /api/*.
const webDist = resolveWebDistPath(process.env.WEB_DIST_PATH);
const servingWeb = registerStaticServing(app, webDist);

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`pokekon-api listening on http://localhost:${info.port}`);
  console.log(servingWeb ? `serving web app from ${webDist}` : 'no web build found — API only');
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down…`);
  server.close((err) => {
    void closeDb().finally(() => {
      process.exit(err === undefined ? 0 : 1);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
