import { useEffect } from 'react';
import { seedIfEmpty } from './db/seed';
import { useDashboardStore } from './store/dashboardStore';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { OverviewPage } from './pages/OverviewPage';
import { DeckPage } from './pages/DeckPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { MetaPage } from './pages/MetaPage';
import { DeckSpriteBackground } from './components/DeckSpriteBackground';

function App() {
  const { activeTab, refresh, isLoading } = useDashboardStore();

  useEffect(() => {
    seedIfEmpty().then(() => refresh());
  }, []);

  const PAGE = {
    overview:        <OverviewPage />,
    deck:            <DeckPage />,
    recommendations: <RecommendationsPage />,
    meta:            <MetaPage />,
  };

  return (
    <div className="relative flex min-h-screen">
      <DeckSpriteBackground />

      <Sidebar />

      <main className="relative z-10 flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="max-w-screen-2xl mx-auto p-3 md:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Loading...
            </div>
          ) : (
            PAGE[activeTab]
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

export default App;
