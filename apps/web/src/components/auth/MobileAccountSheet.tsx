import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, X } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';

/**
 * Derives up to two initials from a display name (fallback: email) for the
 * avatar circle when the account has no profile image.
 */
function initialsOf(name: string, email: string): string {
  const source = name.trim() !== '' ? name : email;
  const parts = source.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + second).toUpperCase();
}

/**
 * Mobile-only account entry point (`md:hidden`) — the desktop equivalent
 * lives in the sidebar (UserMenu), which is invisible below `md`.
 *
 * A fixed avatar chip in the top-right corner opens a bottom sheet with the
 * account details, the language switcher and sign-out. Only rendered with an
 * active session: signed-out users never reach the dashboard (WelcomeScreen
 * gate in App.tsx).
 */
export function MobileAccountSheet() {
  const { t } = useTranslation('auth');
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!session) return null;
  const { user } = session;

  const avatar =
    user.image != null && user.image !== '' ? (
      <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover" />
    ) : (
      <span
        aria-hidden="true"
        className="w-8 h-8 rounded-full bg-brand-500/25 border border-brand-400/30 text-brand-300 text-[11px] font-bold flex items-center justify-center"
      >
        {initialsOf(user.name, user.email)}
      </span>
    );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('userMenu.account')}
        className="md:hidden fixed top-3 right-3 z-40 rounded-full shadow-lg ring-1 ring-white/[0.12] bg-gray-900/80 backdrop-blur"
      >
        {avatar}
      </button>

      {open &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/70"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-account-sheet-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700 rounded-t-2xl p-5 w-full max-w-md shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="mobile-account-sheet-title" className="text-white font-semibold text-sm">
                  {t('userMenu.account')}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label={t('close', { ns: 'common' })}
                  className="text-gray-500 hover:text-gray-300 p-1"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                {avatar}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/90 truncate">{user.name}</p>
                  <p className="text-xs text-white/40 truncate">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.07] pt-4">
                <LanguageSwitcher />
                <button
                  onClick={() => void authClient.signOut()}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white/80 border border-white/[0.08] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('userMenu.signOut')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
