import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPasswordResetEmail } from './email.js';

// ─── Test harness ─────────────────────────────────────────────────────────────
// The Resend SDK talks to api.resend.com through global fetch, so stubbing
// fetch covers the whole send path without any network access. Env vars are
// stubbed per test — email.ts reads them lazily via getEnv().

const RESET_URL = 'https://api.example.com/api/auth/reset-password/tok123?callbackURL=/reset';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendPasswordResetEmail', () => {
  it('logs the reset link instead of sending when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await sendPasswordResetEmail({ to: 'a@example.com', url: RESET_URL });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[password-reset] no RESEND_API_KEY — reset link for a@example.com: ${RESET_URL}`,
    );
  });

  it('sends via Resend with the default from address when the key is set', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123');
    vi.stubEnv('EMAIL_FROM', '');
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await sendPasswordResetEmail({ to: 'a@example.com', url: RESET_URL });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(String(requestUrl)).toContain('api.resend.com');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer re_test_123');
    const body = JSON.parse(init.body as string) as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(body.from).toBe('Pokekon <onboarding@resend.dev>');
    expect(body.to).toBe('a@example.com');
    expect(body.subject).toContain('Pokekon');
    expect(body.text).toContain(RESET_URL);
    expect(body.html).toContain('href=');
  });

  it('honors EMAIL_FROM when configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123');
    vi.stubEnv('EMAIL_FROM', 'Pokekon <reset@pokekon.app>');
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await sendPasswordResetEmail({ to: 'a@example.com', url: RESET_URL });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { from: string };
    expect(body.from).toBe('Pokekon <reset@pokekon.app>');
  });

  it('never throws when the send fails — it must not leak account existence', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      sendPasswordResetEmail({ to: 'a@example.com', url: RESET_URL }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it('never throws when Resend rejects the request', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ name: 'validation_error', message: 'bad from' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      sendPasswordResetEmail({ to: 'a@example.com', url: RESET_URL }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
