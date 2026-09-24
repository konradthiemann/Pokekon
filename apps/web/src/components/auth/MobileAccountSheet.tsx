import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { AiSettingsModal } from '../settings/AiSettingsModal';
import { AccountAvatar, AccountPanel } from './AccountPanel';

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

  const avatar = <AccountAvatar user={user} />;

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

              <AccountPanel onOpenAiSettings={() => setShowAiSettings(true)} />
            </div>
          </div>,
          document.body,
        )}

      {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}
    </>
  );
}
