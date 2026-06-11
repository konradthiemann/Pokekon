import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { getEnv } from './env.js';

const env = getEnv();
const app = createApp();

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`pokekon-api listening on http://localhost:${info.port}`);
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
