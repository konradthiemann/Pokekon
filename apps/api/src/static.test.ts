import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import { registerStaticServing, resolveWebDistPath } from './static.js';

const dist = mkdtempSync(path.join(tmpdir(), 'pokekon-dist-'));
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>pokekon</title>');
mkdirSync(path.join(dist, 'assets'));
writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log("ok");');

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

function buildApp(distPath: string): { app: Hono; registered: boolean } {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/decks', (c) => c.json({ error: 'Unauthorized' }, 401));
  const registered = registerStaticServing(app, distPath);
  return { app, registered };
}

describe('registerStaticServing', () => {
  it('is a no-op when the dist dir has no index.html', () => {
    const { registered } = buildApp(path.join(tmpdir(), 'does-not-exist'));
    expect(registered).toBe(false);
  });

  it('serves index.html at / with revalidation caching', async () => {
    const { app } = buildApp(dist);
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('pokekon');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed assets with immutable caching', async () => {
    const { app } = buildApp(dist);
    const res = await app.request('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for unknown non-API paths (SPA routing)', async () => {
    const { app } = buildApp(dist);
    const res = await app.request('/some/client/route');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('pokekon');
  });

  it('keeps API routes and API 404s untouched', async () => {
    const { app } = buildApp(dist);
    const guarded = await app.request('/api/decks');
    expect(guarded.status).toBe(401);
    const unknownApi = await app.request('/api/nope');
    expect(unknownApi.status).toBe(404);
    expect((await unknownApi.text()).includes('pokekon')).toBe(false);
  });

  it('keeps /health JSON', async () => {
    const { app } = buildApp(dist);
    const res = await app.request('/health');
    expect((await res.json()) as { status: string }).toEqual({ status: 'ok' });
  });
});

describe('resolveWebDistPath', () => {
  it('defaults to the sibling web workspace build', () => {
    expect(resolveWebDistPath(undefined).endsWith(path.join('apps', 'web', 'dist'))).toBe(true);
  });

  it('resolves explicit relative paths against the CWD', () => {
    expect(resolveWebDistPath('./custom')).toBe(path.resolve(process.cwd(), 'custom'));
  });

  it('keeps absolute paths as-is', () => {
    expect(resolveWebDistPath(dist)).toBe(dist);
  });
});
