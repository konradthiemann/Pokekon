import { lazy, Suspense, useEffect } from 'react';
import { seedIfEmpty } from './db/seed';
import { useDashboardStore } from './store/dashboardStore';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { PageSkeleton } from './components/layout/PageSkeleton';
import { DeckSpriteBackground } from './components/DeckSpriteBackground';

// Each page is its own chunk: Recharts-heavy pages no longer block first paint.
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const DeckPage = lazy(() => import('./pages/DeckPage').then((m) => ({ default: m.DeckPage })));
const RecommendationsPage = lazy(() =>
  import('./pages/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage })),
);
const MetaPage = lazy(() => import('./pages/MetaPage').then((m) => ({ default: m.MetaPage })));

function App() {
  const { activeTab, refresh, isLoading } = useDashboardStore();

  useEffect(() => {
    seedIfEmpty().then(() => refresh());
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
    </div>
  );
}

export default App;
