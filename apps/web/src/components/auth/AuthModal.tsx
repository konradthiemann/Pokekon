import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { authClient } from '../../lib/authClient';

type AuthMode = 'signIn' | 'signUp';

interface Props {
  onClose: () => void;
}

/**
 * Inline Google "G" logo so we don't pull in an extra icon dependency.
 * Official brand colors on a light button per Google's sign-in guidelines.
 */
function GoogleLogo() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Maps a Better Auth API error (code/status) to a translated, generic
 * message — never echoes raw server strings into the UI.
 */
function errorKeyFor(code: string | undefined, status: number): string {
  if (code === 'USER_ALREADY_EXISTS') return 'errors.userExists';
  if (code === 'PASSWORD_TOO_SHORT') return 'errors.passwordTooShort';
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) return 'errors.invalidCredentials';
  return 'errors.generic';
}

/**
 * Sign-in / sign-up modal following the app's modal pattern (AddLogModal):
 * Escape closes, dialog semantics, bottom-sheet on mobile → centered on sm+.
 *
 * Session handling: on a successful email sign-in/up the modal simply closes —
 * Better Auth's `useSession` store updates reactively, so UserMenu (and any
 * other consumer) re-renders with the new session without manual plumbing.
 * Google OAuth performs a full-page redirect back to `window.location.origin`.
 */
export function AuthModal({ onClose }: Props) {
  const { t } = useTranslation('auth');

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrorKey(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const { error } =
        mode === 'signIn'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ name, email, password });
      if (error) {
        setErrorKey(errorKeyFor(error.code, error.status));
        return;
      }
      onClose();
    } catch {
      // fetch threw before reaching the server (offline, DNS, CORS, …)
      setErrorKey('errors.network');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorKey(null);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin,
      });
    } catch {
      setErrorKey('errors.network');
    }
  };

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500';

  // Portal: the sidebar's backdrop-filter creates a containing block that
  // would trap position:fixed descendants — render at document.body instead.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="auth-modal-title" className="text-white font-semibold">
            {mode === 'signIn' ? t('modal.signInTitle') : t('modal.signUpTitle')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1 p-1 mb-5 bg-gray-800 border border-gray-700 rounded-lg">
          {(['signIn', 'signUp'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
              }`}
            >
              {m === 'signIn' ? t('modal.tabSignIn') : t('modal.tabSignUp')}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          {mode === 'signUp' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs text-gray-400 mb-1">
                {t('modal.name')}
              </label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('modal.namePlaceholder')}
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs text-gray-400 mb-1">
              {t('modal.email')}
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('modal.emailPlaceholder')}
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs text-gray-400 mb-1">
              {t('modal.password')}
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('modal.passwordPlaceholder')}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signUp' ? 8 : undefined}
              className={inputClass}
            />
          </div>

          {errorKey && (
            <div role="alert" className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
              <p className="text-xs text-red-400">{t(errorKey)}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full justify-center py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {submitting
              ? t('modal.submitting')
              : mode === 'signIn'
                ? t('modal.submitSignIn')
                : t('modal.submitSignUp')}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <span className="h-px flex-1 bg-gray-700" aria-hidden="true" />
          <span className="text-xs text-gray-500">{t('modal.or')}</span>
          <span className="h-px flex-1 bg-gray-700" aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={() => void handleGoogle()}
          className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 transition-colors"
        >
          <GoogleLogo />
          {t('modal.google')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
