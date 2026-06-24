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
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-100">
            <FlaskConical className="h-4 w-4 text-brand-700" aria-hidden="true" />
          </span>
          <div className="text-sm">
            <span className="font-extrabold text-slate-900">{t('demo.bannerTitle')}</span>
            <span className="text-slate-600 font-semibold"> — {t('demo.bannerText')}</span>
          </div>
        </div>
        <button
          onClick={() => setShowAuthModal(true)}
          className="btn-primary shrink-0 justify-center px-3 text-xs"
        >
          {t('demo.bannerCta')}
        </button>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
