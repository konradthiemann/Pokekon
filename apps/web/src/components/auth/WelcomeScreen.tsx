import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Zap } from 'lucide-react';
import { AuthModal } from './AuthModal';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { DeckSpriteBackground } from '../DeckSpriteBackground';

/**
 * Landing view for signed-out visitors. Domain data lives server-side, so the
 * dashboard itself is only rendered once a session exists (see App.tsx) —
 * this screen pitches the app and funnels into the AuthModal.
 */
export function WelcomeScreen() {
  const { t } = useTranslation('auth');
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <DeckSpriteBackground />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.10] bg-white/[0.05] p-8 text-center shadow-xl backdrop-blur-md">
        {/* Logo / app name */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <Zap className="h-7 w-7 text-brand-400" aria-hidden="true" />
          <span className="text-xl font-bold tracking-wide text-white">TCG Meta</span>
        </div>

        <h1 className="mb-2 text-lg font-semibold text-white">{t('welcome.title')}</h1>
        <p className="mb-6 text-sm leading-relaxed text-white/60">{t('welcome.pitch')}</p>

        <button
          onClick={() => setShowAuthModal(true)}
          className="btn-primary w-full justify-center py-2.5 text-sm font-bold"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {t('welcome.signIn')}
        </button>

        <div className="mt-6 flex justify-center border-t border-white/[0.08] pt-4">
          <LanguageSwitcher />
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
