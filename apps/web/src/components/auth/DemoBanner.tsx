import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { isAnonymousUser } from '../../lib/demo';
import { AuthModal } from './AuthModal';

/**
 * Thin banner shown only for anonymous (demo) guests, nudging them to create a
 * real account. Renders nothing for signed-up users. Creating an account from
 * here replaces the guest session — the demo data is not carried over.
 */
export function DemoBanner() {
  const { t } = useTranslation('auth');
  const { data: session } = authClient.useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (!isAnonymousUser(session?.user)) return null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
          <div className="text-sm">
            <span className="font-semibold text-white">{t('demo.bannerTitle')}</span>
            <span className="text-white/60"> — {t('demo.bannerText')}</span>
          </div>
        </div>
        <button
          onClick={() => setShowAuthModal(true)}
          className="btn-primary shrink-0 justify-center px-3 py-1.5 text-xs font-bold"
        >
          {t('demo.bannerCta')}
        </button>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
