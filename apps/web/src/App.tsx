import { lazy, Suspense, useEffect, useState } from 'react';
import { seedIfEmpty } from './db/seed';
import { useDashboardStore } from './store/dashboardStore';
import { authClient } from './lib/authClient';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { PageSkeleton } from './components/layout/PageSkeleton';
import { DeckSpriteBackground } from './components/DeckSpriteBackground';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { ImportLocalDataModal } from './components/auth/ImportLocalDataModal';
import { shouldOfferLocalImport } from './lib/localImport';

// Each page is its own chunk: Recharts-heavy pages no longer block first paint.
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const DeckPage = lazy(() => import('./pages/DeckPage').then((m) => ({ default: m.DeckPage })));
const RecommendationsPage = lazy(() =>
  import('./pages/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage })),
);
const MetaPage = lazy(() => import('./pages/MetaPage').then((m) => ({ default: m.MetaPage })));

/**
 * The signed-in dashboard. Mounting this component is what triggers the
 * initial data load — domain data is session-scoped on the server, so the
 * store must never refresh without a session (it would only collect 401s).
 */
function Dashboard() {
  const { activeTab, refresh, isLoading } = useDashboardStore();
  const [showLocalImport, setShowLocalImport] = useState(false);

  useEffect(() => {
    void (async () => {
      await seedIfEmpty(); // demo meta snapshots only — domain data lives server-side
      if (await shouldOfferLocalImport()) setShowLocalImport(true);
      await refresh();
    })();
  }, [refresh]);

  const PAGE = {
    overview: <OverviewPage />,
    deck: <DeckPage />,
    recommendations: <RecommendationsPage />,
    meta: <MetaPage />,
  };

  return (
    <div className="relative flex min-h-screen">
      <DeckSpriteBackground />

      <Sidebar />

      <main className="relative z-10 flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="max-w-screen-2xl mx-auto p-3 md:p-4">
          {isLoading ? (
            <PageSkeleton />
          ) : (
            <Suspense fallback={<PageSkeleton />}>{PAGE[activeTab]}</Suspense>
          )}
        </div>
      </main>

      <BottomNav />

      {showLocalImport && <ImportLocalDataModal onClose={() => setShowLocalImport(false)} />}
    </div>
  );
}

/**
 * Login gate: pending session → skeleton, no session → WelcomeScreen,
 * session → dashboard. Better Auth's `useSession` is reactive, so signing
 * in/out swaps the views without manual wiring.
 */
function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="relative min-h-screen">
        <div className="max-w-screen-2xl mx-auto p-3 md:p-4">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (!session) {
    return <WelcomeScreen />;
  }

  return <Dashboard />;
}

export default App;
