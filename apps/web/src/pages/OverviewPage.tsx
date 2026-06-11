import { useDashboardStore } from '../store/dashboardStore';
import { StatCard } from '../components/layout/StatCard';
import { MetaTable } from '../components/meta/MetaTable';
import { PokemonIcon } from '../components/shared/PokemonIcon';

export function OverviewPage() {
  const { activeDeckId, activeDeck, deckCards, opponentLogs, metaSnapshots, archetypeStats } =
    useDashboardStore();

  const deckLogs = opponentLogs.filter((l) => l.deckId === activeDeckId);
  const totalGames = deckLogs.length;
  const wins = deckLogs.filter((l) => l.result === 'W').length;
  const losses = deckLogs.filter((l) => l.result === 'L').length;
  const ties = deckLogs.filter((l) => l.result === 'T').length;
  const decisive = wins + losses;
  const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0;
  const totalCards = deckCards.reduce((s, c) => s + c.count, 0);
  const topMeta =
    metaSnapshots.length > 0
      ? [...metaSnapshots].sort((a, b) => b.frequencyPct - a.frequencyPct)[0]
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-0.5">Meta Dashboard</h1>
        {activeDeck ? (
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            Aktives Deck:
            <PokemonIcon archetype={activeDeck.archetype} size="sm" />
            <span className="text-gray-300 font-medium">{activeDeck.archetypeName}</span>
            {activeDeck.variant && !['Default', 'Standard'].includes(activeDeck.variant) && (
              <span className="text-gray-600">· {activeDeck.variant}</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-gray-500 mt-0.5">
            Kein aktives Deck — wähle eines unter "My Decks"
          </p>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Overall Win Rate"
          value={totalGames > 0 ? `${winRate}%` : '—'}
          sub={`${wins}W / ${losses}L / ${ties}T`}
          color={winRate >= 55 ? 'green' : winRate >= 45 ? 'default' : 'red'}
        />
        <StatCard label="Games Logged" value={totalGames} sub="across all events" color="blue" />
        <StatCard
          label="Deck Size"
          value={`${totalCards}/60`}
          sub={totalCards === 60 ? 'Complete' : totalCards > 60 ? 'Over limit' : 'Incomplete'}
          color={totalCards === 60 ? 'green' : totalCards > 60 ? 'red' : 'default'}
        />
        <StatCard
          label="Top Meta Threat"
          value={
            topMeta ? (
              <span className="flex items-center gap-1.5 min-w-0">
                <PokemonIcon archetype={topMeta.archetype} size="sm" dual />
                <span className="text-base font-bold leading-tight line-clamp-2 min-w-0">
                  {topMeta.archetype}
                </span>
              </span>
            ) : (
              '—'
            )
          }
          sub={topMeta ? `${topMeta.frequencyPct}% meta share` : 'No data'}
          color="purple"
        />
      </div>

      <MetaTable stats={archetypeStats} />
    </div>
  );
}
