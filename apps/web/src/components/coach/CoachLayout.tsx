import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '../../lib/authClient';
import { isAnonymousUser } from '../../lib/demo';
import { useDashboardStore, type CoachTab } from '../../store/dashboardStore';
import { DemoBanner } from '../auth/DemoBanner';
import { DeckSpriteBackground } from '../DeckSpriteBackground';
import { PageSkeleton } from '../layout/PageSkeleton';
import { CoachBottomNav } from './CoachBottomNav';
import { CoachHeader } from './CoachHeader';
import { CoachSidebar } from './CoachSidebar';
import { OnboardingFlow } from './onboarding/OnboardingFlow';

// Each page is its own chunk, like the old layout's pages (App.tsx).
const StartPage = lazy(() =>
  import('../../pages/coach/StartPage').then((m) => ({ default: m.StartPage })),
);
const DeckHubPage = lazy(() =>
  import('../../pages/coach/DeckHubPage').then((m) => ({ default: m.DeckHubPage })),
);
const CoachingPage = lazy(() =>
  import('../../pages/coach/CoachingPage').then((m) => ({ default: m.CoachingPage })),
);
const OpponentsPage = lazy(() =>
  import('../../pages/coach/OpponentsPage').then((m) => ({ default: m.OpponentsPage })),
);
const ToolsPage = lazy(() =>
  import('../../pages/coach/ToolsPage').then((m) => ({ default: m.ToolsPage })),
);

const PAGES: Record<CoachTab, ReactNode> = {
  start: <StartPage />,
  deck: <DeckHubPage />,
  coaching: <CoachingPage />,
  opponents: <OpponentsPage />,
  tools: <ToolsPage />,
};

/**
 * Shell of the archetype-first UI (Spec 7 §4), rendered by App.tsx when the
 * `archetypeCoachUi` flag is on. `.coach-ui` scopes the coach colour roles
 * (§9a). Onboarding gate (§5.1): no archetype → onboarding — but never while
 * preferences are still loading, and never for a demo guest whose seed is
 * still in flight (anonymous, zero decks), so the demo does not flash it.
 */
export function CoachLayout() {
  const { t } = useTranslation('layout');
  const { preferencesStatus, activeArchetypeId, decks, coachTab, lastRefreshed, loadPreferences } =
    useDashboardStore();
  const { data: session } = authClient.useSession();
  const [switching, setSwitching] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // A new area starts at the top, not at the previous page's scroll offset.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  }, [coachTab]);

  const demoSeeding = isAnonymousUser(session?.user) && decks.length === 0;
  const loading =
    preferencesStatus === 'idle' ||
    preferencesStatus === 'loading' ||
    lastRefreshed === null ||
    demoSeeding;
  const needsOnboarding = preferencesStatus === 'ready' && activeArchetypeId === null;

  let content: ReactNode;
  if (loading) {
    content = (
      <div data-testid="coach-skeleton">
        <PageSkeleton />
      </div>
    );
  } else if (needsOnboarding || switching) {
    content = (
      <OnboardingFlow
        mode={needsOnboarding ? 'firstRun' : 'switchArchetype'}
        onDone={() => setSwitching(false)}
        onCancel={() => setSwitching(false)}
      />
    );
  } else {
    content = <Suspense fallback={<PageSkeleton />}>{PAGES[coachTab]}</Suspense>;
  }

  return (
    <div className="coach-ui relative flex min-h-screen">
      <DeckSpriteBackground />
      <CoachSidebar />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <CoachHeader onSwitchArchetype={() => setSwitching(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-20 md:pb-4">
          <div className="mx-auto max-w-screen-lg p-3 md:p-4">
            <DemoBanner />
            {preferencesStatus === 'error' && (
              <div
                role="alert"
                className="card mb-3 flex flex-wrap items-center justify-between gap-2"
              >
                <p className="text-sm text-slate-900">{t('coach.prefsError')}</p>
                <button type="button" className="btn-ghost" onClick={() => void loadPreferences()}>
                  {t('coach.retry')}
                </button>
              </div>
            )}
            {content}
          </div>
        </main>
      </div>

      <CoachBottomNav />
    </div>
  );
}
