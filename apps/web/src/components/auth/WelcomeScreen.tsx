import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Sparkles, Zap } from 'lucide-react';
import { AuthModal } from './AuthModal';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { DeckSpriteBackground } from '../DeckSpriteBackground';
import { authClient } from '../../lib/authClient';
import { seedDemo } from '../../lib/api';
import { DEMO_PLAYER_NAME, PLAYER_NAME_KEY } from '../../lib/demo';
import { useDashboardStore } from '../../store/dashboardStore';

/**
 * Landing view for signed-out visitors. Domain data lives server-side, so the
 * dashboard itself is only rendered once a session exists (see App.tsx) —
 * this screen pitches the app and funnels into the AuthModal, or into a
 * one-click guest demo.
 */
export function WelcomeScreen() {
  const { t } = useTranslation('auth');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isPreparingDemo, setIsPreparingDemo] = useState(false);
  const [demoFailed, setDemoFailed] = useState(false);

  /**
   * One-click demo: create an anonymous guest, pin the demo player name so the
   * battle-log parser tracks "me" correctly, seed sample data, then refresh.
   * Signing in flips App.tsx to the dashboard; the post-seed refresh repopulates
   * it (the dashboard's own mount-refresh may run first, before data exists).
   */
  async function startDemo() {
    setIsPreparingDemo(true);
    setDemoFailed(false);
    try {
      const { error } = await authClient.signIn.anonymous();
      if (error) throw new Error(error.message ?? 'anonymous sign-in failed');
      localStorage.setItem(PLAYER_NAME_KEY, DEMO_PLAYER_NAME);
      await seedDemo();
      await useDashboardStore.getState().refresh();
      // On success the component unmounts (session → dashboard); no state reset.
    } catch {
      setDemoFailed(true);
      setIsPreparingDemo(false);
    }
  }

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
          disabled={isPreparingDemo}
          className="btn-primary w-full justify-center py-2.5 text-sm font-bold disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {t('welcome.signIn')}
        </button>

        {/* "or" divider */}
        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-white/30">
          <span className="h-px flex-1 bg-white/[0.08]" />
          {t('welcome.or')}
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>

        <button
          onClick={startDemo}
          disabled={isPreparingDemo}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-70"
        >
          <Sparkles className="h-4 w-4 text-brand-300" aria-hidden="true" />
          {isPreparingDemo ? t('welcome.demoPreparing') : t('welcome.demo')}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-white/40">{t('welcome.demoHint')}</p>
        {demoFailed && <p className="mt-2 text-xs text-red-400">{t('welcome.demoError')}</p>}

        <div className="mt-6 flex justify-center border-t border-white/[0.08] pt-4">
          <LanguageSwitcher />
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
