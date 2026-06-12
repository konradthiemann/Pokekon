import { Resend } from 'resend';
import { getEnv } from './env.js';

export interface PasswordResetEmail {
  readonly to: string;
  readonly url: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Sends the password-reset email via Resend. Without RESEND_API_KEY the
 * reset URL is logged to stdout instead (readable via `railway logs`), so
 * the flow stays testable in every environment.
 *
 * This function never throws: a failure in the email path must not turn
 * into a response difference that leaks whether the account exists.
 */
export async function sendPasswordResetEmail({ to, url }: PasswordResetEmail): Promise<void> {
  try {
    const env = getEnv();

    if (env.resendApiKey === undefined) {
      console.log(`[password-reset] no RESEND_API_KEY — reset link for ${to}: ${url}`);
      return;
    }

    const resend = new Resend(env.resendApiKey);
    const safeUrl = escapeHtml(url);
    const { error } = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject: 'Passwort zurücksetzen / Reset your password — Pokekon',
      text: [
        'Hallo,',
        '',
        'jemand hat angefordert, das Passwort für dieses Pokekon-Konto zurückzusetzen.',
        'Öffne den folgenden Link, um ein neues Passwort zu setzen:',
        '',
        url,
        '',
        'Wenn du das nicht warst, kannst du diese E-Mail ignorieren.',
        '',
        '---',
        '',
        'Hi,',
        '',
        'someone requested a password reset for this Pokekon account.',
        'Open the link below to choose a new password:',
        '',
        url,
        '',
        "If this wasn't you, you can safely ignore this email.",
      ].join('\n'),
      html: [
        '<p>Hallo,</p>',
        '<p>jemand hat angefordert, das Passwort für dieses Pokekon-Konto zurückzusetzen.',
        ' Öffne den folgenden Link, um ein neues Passwort zu setzen:</p>',
        `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
        '<p>Wenn du das nicht warst, kannst du diese E-Mail ignorieren.</p>',
        '<hr>',
        '<p>Hi,</p>',
        '<p>someone requested a password reset for this Pokekon account.',
        ' Open the link below to choose a new password:</p>',
        `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
        "<p>If this wasn't you, you can safely ignore this email.</p>",
      ].join(''),
    });

    if (error) {
      console.error(`[password-reset] Resend rejected the email: ${error.message}`);
    }
  } catch (err) {
    // Swallow everything: the auth response must look identical either way.
    console.error('[password-reset] failed to send reset email:', err);
  }
}
