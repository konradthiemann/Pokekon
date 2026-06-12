import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Zap } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { DeckSpriteBackground } from '../DeckSpriteBackground';

const MIN_PASSWORD_LENGTH = 8;

type ViewState = 'form' | 'success' | 'tokenError';

/**
 * Full-screen view for /reset-password (served via the SPA fallback — the
 * app has no router). Better Auth redirects the email link here with either
 * `?token=…` or `?error=INVALID_TOKEN`; a missing/invalid token shows an
 * error card with a link back to '/' to request a fresh one.
 */
export function ResetPasswordView() {
  const { t } = useTranslation('auth');

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const linkInvalid = params.get('error') === 'INVALID_TOKEN' || token === null;

  const [view, setView] = useState<ViewState>(linkInvalid ? 'tokenError' : 'form');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || token === null) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorKey('reset.tooShort');
      return;
    }
    if (password !== repeat) {
      setErrorKey('reset.mismatch');
      return;
    }

    setSubmitting(true);
    setErrorKey(null);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        if (error.code === 'INVALID_TOKEN') {
          setView('tokenError');
        } else {
          setErrorKey('errors.generic');
        }
        return;
      }
      setView('success');
    } catch {
      setErrorKey('errors.network');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500';

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <DeckSpriteBackground />

      <main className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.10] bg-white/[0.05] p-8 shadow-xl backdrop-blur-md">
        {/* Logo / app name */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <Zap className="h-7 w-7 text-brand-400" aria-hidden="true" />
          <span className="text-xl font-bold tracking-wide text-white">TCG Meta</span>
        </div>

        <h1 className="mb-2 flex items-center justify-center gap-2 text-center text-lg font-semibold text-white">
          <KeyRound className="h-4 w-4 text-brand-400" aria-hidden="true" />
          {t('reset.title')}
        </h1>

        {view === 'tokenError' && (
          <div className="space-y-4 text-center">
            <div role="alert" className="rounded-lg border border-red-800/40 bg-red-900/20 p-3">
              <p className="text-sm text-red-400">
                {token === null && params.get('error') === null
                  ? t('reset.missingToken')
                  : t('reset.invalidToken')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="btn-primary w-full justify-center py-2.5 text-sm font-bold"
            >
              {t('reset.requestNew')}
            </button>
          </div>
        )}

        {view === 'success' && (
          <div className="space-y-4 text-center">
            <div role="status" className="rounded-lg border border-gray-700 bg-gray-800 p-3">
              <p className="text-sm text-gray-300">{t('reset.success')}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="btn-primary w-full justify-center py-2.5 text-sm font-bold"
            >
              {t('reset.goToApp')}
            </button>
          </div>
        )}

        {view === 'form' && (
          <>
            <p className="mb-5 text-center text-sm text-white/60">{t('reset.description')}</p>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <div>
                <label htmlFor="reset-password" className="mb-1 block text-xs text-gray-400">
                  {t('reset.newPassword')}
                </label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="reset-password-repeat" className="mb-1 block text-xs text-gray-400">
                  {t('reset.repeatPassword')}
                </label>
                <input
                  id="reset-password-repeat"
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>

              {errorKey && (
                <div role="alert" className="rounded-lg border border-red-800/40 bg-red-900/20 p-3">
                  <p className="text-xs text-red-400">{t(errorKey)}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {submitting ? t('reset.submitting') : t('reset.submit')}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 flex justify-center border-t border-white/[0.08] pt-4">
          <LanguageSwitcher />
        </div>
      </main>
    </div>
  );
}
