import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

// Runs without a database: createApp() never initializes auth or the pg pool.
const app = createApp();

describe('GET /health', () => {
  it('returns 200 with the expected JSON shape', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'pokekon-api' });
  });
});

describe('CORS', () => {
  it('allows the configured web origin with credentials', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('answers preflight requests for the auth routes', async () => {
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
