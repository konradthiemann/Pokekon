import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono, MiddlewareHandler } from 'hono';

/**
 * Static serving of the built web app (single-origin deployment).
 *
 * Serving the SPA from the API process keeps the Better Auth session cookie
 * first-party in production — the browser talks to exactly one origin for
 * both the app shell and /api/*.
 */

/**
 * The apps/api package directory, derived from this module's own location.
 * Works identically for src/static.ts (tsx, vitest) and the compiled
 * dist/static.js — both live exactly one level below the package root — and
 * is therefore independent of the process CWD (repo root on Railway,
 * apps/api in local dev).
 */
const API_PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Resolves the web build directory to an absolute path.
 *
 * - `WEB_DIST_PATH` set: absolute paths are used as-is, relative paths are
 *   resolved against the process CWD (`path.resolve` handles both).
 * - Unset: defaults to the sibling workspace build, `<repo>/apps/web/dist`,
 *   anchored at the api package — never at the CWD.
 */
export function resolveWebDistPath(webDistPath: string | undefined): string {
  if (webDistPath !== undefined) {
    return path.resolve(process.cwd(), webDistPath);
  }
  return path.resolve(API_PACKAGE_DIR, '..', 'web', 'dist');
}

const INDEX_FILE = 'index.html';

/** index.html must always be revalidated — it references the hashed assets. */
const INDEX_CACHE_CONTROL = 'no-cache';
/** Vite emits content-hashed filenames under /assets — safe to cache forever. */
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Sets Cache-Control on successful downstream responses. The node-server
 * serveStatic only invokes `onFound` after the response body has been
 * created, at which point header changes no longer apply — so caching is
 * applied by wrapping the static handlers instead.
 */
function cacheControl(value: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.res.headers.set('Cache-Control', value);
    }
  };
}

/**
 * Registers static serving of the web build on `app`. Must be called AFTER
 * all API routes so that /api/* and /health keep precedence (middleware
 * added here only wraps the static handlers registered below it).
 *
 * If `distPath` does not contain an index.html (local dev without a web
 * build), this is a no-op: the API keeps its current behavior and unknown
 * paths simply 404.
 *
 * Routing order added here:
 * 1. GET /assets/*  → hashed build assets, cached aggressively.
 * 2. GET *          → other real files in the dist dir (favicon, manifest, …)
 *    and "/" via the directory index, revalidated on every request.
 * 3. GET *          → SPA fallback to index.html (client-side routing /
 *    reload safety). /api paths are excluded and keep returning 404.
 */
export function registerStaticServing(app: Hono, distPath: string): boolean {
  if (!existsSync(path.join(distPath, INDEX_FILE))) {
    return false;
  }

  app.use('/assets/*', cacheControl(ASSET_CACHE_CONTROL));
  app.get('/assets/*', serveStatic({ root: distPath }));

  app.use('*', cacheControl(INDEX_CACHE_CONTROL));
  app.get('*', serveStatic({ root: distPath }));

  const serveIndex = serveStatic({ root: distPath, path: INDEX_FILE });

  app.get('*', async (c, next) => {
    // Unknown API paths must stay API errors, never the app shell.
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) {
      return c.notFound();
    }
    return await serveIndex(c, next);
  });

  return true;
}
