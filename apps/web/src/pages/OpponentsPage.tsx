import { useDashboardStore } from '../store/dashboardStore';
import { OpponentLog } from '../components/opponent/OpponentLog';
import { StatCard } from '../components/layout/StatCard';

export function OpponentsPage() {
  const { opponentLogs } = useDashboardStore();

  const wins = opponentLogs.filter((l) => l.result === 'W').length;
  const losses = opponentLogs.filter((l) => l.result === 'L').length;
  const ties = opponentLogs.filter((l) => l.result === 'T').length;
  const lcGames = opponentLogs.filter((l) => l.eventType === 'LC').length;
  const lcupGames = opponentLogs.filter((l) => l.eventType === 'LCup').length;

  const uniqueArchetypes = new Set(opponentLogs.map((l) => l.archetype)).size;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-0.5">Match Log</h1>
        <p className="text-gray-500 text-sm">
          Track opponent decks from League Challenges and Cups
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Games" value={opponentLogs.length} sub="all events" />
        <StatCard
          label="Win Rate"
          value={opponentLogs.length > 0 ? `${winRate}%` : '—'}
          sub={`${wins}W / ${losses}L / ${ties}T`}
          color={winRate >= 55 ? 'green' : winRate >= 45 ? 'default' : 'red'}
        />
        <StatCard
          label="LC / LCup"
          value={`${lcGames} / ${lcupGames}`}
          sub="by event type"
          color="blue"
        />
        <StatCard
          label="Archetypes Faced"
          value={uniqueArchetypes}
          sub="distinct deck types"
          color="purple"
        />
      </div>

      <OpponentLog logs={opponentLogs} />
    </div>
  );
}
