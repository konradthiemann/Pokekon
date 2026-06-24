import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Brain, LogOut, X } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { LegalLinks } from '../layout/LegalLinks';
import { AiSettingsModal } from '../settings/AiSettingsModal';

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
  const [showAiSettings, setShowAiSettings] = useState(false);

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
        className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 text-brand-800 text-[11px] font-bold flex items-center justify-center"
      >
        {initialsOf(user.name, user.email)}
      </span>
    );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('userMenu.account')}
        className="md:hidden fixed top-3 right-3 z-40 rounded-full shadow-pop ring-1 ring-slate-200 bg-white/95 backdrop-blur"
      >
        {avatar}
      </button>

      {open &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-account-sheet-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 rounded-t-2xl p-5 w-full max-w-md shadow-card"
            >
              <div className="flex items-center justify-between mb-4">
                <h2
                  id="mobile-account-sheet-title"
                  className="text-slate-900 font-semibold text-sm"
                >
                  {t('userMenu.account')}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label={t('close', { ns: 'common' })}
                  className="text-slate-500 hover:text-slate-900 p-1"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                {avatar}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-600 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={() => setShowAiSettings(true)}
                className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
              >
                <Brain className="w-3.5 h-3.5 text-brand-700" aria-hidden="true" />
                {t('aiSettings.title')}
              </button>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <LanguageSwitcher />
                <button
                  onClick={() => void authClient.signOut()}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('userMenu.signOut')}
                </button>
              </div>

              <LegalLinks className="mt-4" />
            </div>
          </div>,
          document.body,
        )}

      {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}
    </>
  );
}
