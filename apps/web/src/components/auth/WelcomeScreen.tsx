import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Sparkles } from 'lucide-react';
import { AuthModal } from './AuthModal';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { DeckSpriteBackground } from '../DeckSpriteBackground';
import { PokeballMark } from '../shared/PokeballMark';
import { authClient } from '../../lib/authClient';
import { seedDemo } from '../../lib/api';
import { DEMO_PLAYER_NAME, PLAYER_NAME_KEY } from '../../lib/demo';
import { useDashboardStore } from '../../store/dashboardStore';

// Decorative mascot — reuses the same community sprite source as the deck
// background. Pixel art, so it scales crisply; hidden if the fetch fails.
const PIKACHU_SPRITE =
  'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular/pikachu.png';

/**
 * Landing view for signed-out visitors. Domain data lives server-side, so the
 * dashboard itself is only rendered once a session exists (see App.tsx) — this
 * screen pitches the app and funnels into the AuthModal, or into a one-click
 * guest demo.
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

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        {/* Hero band — Poké card-back blue */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 px-8 pb-7 pt-8 text-center">
          <PokeballMark className="pointer-events-none absolute -left-7 -top-7 h-28 w-28 opacity-20" />
          <img
            src={PIKACHU_SPRITE}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="pointer-events-none absolute bottom-2 right-3 h-16 w-16 drop-shadow"
            style={{ imageRendering: 'pixelated' }}
          />

          <div className="relative flex items-center justify-center gap-2.5">
            <PokeballMark className="h-8 w-8 drop-shadow" />
            <span className="text-2xl font-extrabold tracking-tight text-white">TCG Meta</span>
          </div>
          <h1 className="relative mt-3 text-lg font-bold text-white">{t('welcome.title')}</h1>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-6 text-center">
          <p className="mb-6 text-sm font-semibold leading-relaxed text-slate-600">
            {t('welcome.pitch')}
          </p>

          <button
            onClick={() => setShowAuthModal(true)}
            disabled={isPreparingDemo}
            className="btn-primary w-full justify-center text-sm disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {t('welcome.signIn')}
          </button>

          {/* "or" divider */}
          <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            {t('welcome.or')}
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            onClick={startDemo}
            disabled={isPreparingDemo}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-100 disabled:cursor-wait disabled:opacity-70"
          >
            <Sparkles className="h-4 w-4 text-energy-600" aria-hidden="true" />
            {isPreparingDemo ? t('welcome.demoPreparing') : t('welcome.demo')}
          </button>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
            {t('welcome.demoHint')}
          </p>
          {demoFailed && (
            <p className="mt-2 text-xs font-bold text-red-700">{t('welcome.demoError')}</p>
          )}

          <div className="mt-6 flex justify-center border-t border-slate-200 pt-4">
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
