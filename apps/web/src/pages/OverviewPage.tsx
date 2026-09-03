import { useTranslation } from 'react-i18next';
import { tournamentWinRatePct } from '@pokekon/shared';
import { useDashboardStore } from '../store/dashboardStore';
import { StatCard } from '../components/layout/StatCard';
import { MyMatchupsTable } from '../components/meta/MyMatchupsTable';
import { PokemonIcon } from '../components/shared/PokemonIcon';

export function OverviewPage() {
  const { t } = useTranslation('overview');
  const { activeDeckId, activeDeck, deckCards, opponentLogs, metaSnapshots, archetypeStats } =
    useDashboardStore();

  const deckLogs = opponentLogs.filter((l) => l.deckId === activeDeckId);
  const totalGames = deckLogs.length;
  const wins = deckLogs.filter((l) => l.result === 'W').length;
  const losses = deckLogs.filter((l) => l.result === 'L').length;
  const ties = deckLogs.filter((l) => l.result === 'T').length;
  // Tie-weighted (a tie counts as a third of a win), not wins/(wins+losses) —
  // the last of the five Personal-Analytics spots Spec 2 deferred to Spec 4
  // (plan personal-data-role-rework §0.7/§6 decision 1).
  const winRate = tournamentWinRatePct(wins, losses, ties, 0) ?? 0;
  const totalCards = deckCards.reduce((s, c) => s + c.count, 0);
  const topMeta =
    metaSnapshots.length > 0
      ? [...metaSnapshots].sort((a, b) => b.frequencyPct - a.frequencyPct)[0]
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-0.5">
          {t('title')}
        </h1>
        {activeDeck ? (
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5 font-semibold">
            {t('activeDeck')}
            <PokemonIcon archetype={activeDeck.archetype} size="sm" />
            <span className="text-slate-800 font-bold">{activeDeck.archetypeName}</span>
            {activeDeck.variant && !['Default', 'Standard'].includes(activeDeck.variant) && (
              <span className="text-slate-400">· {activeDeck.variant}</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-slate-500 mt-0.5 font-semibold">{t('noActiveDeck')}</p>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('stats.winRate.label')}
          value={totalGames > 0 ? `${winRate}%` : '—'}
          sub={t('stats.winRate.record', { wins, losses, ties })}
          color={winRate >= 55 ? 'green' : winRate >= 45 ? 'default' : 'red'}
        />
        <StatCard
          label={t('stats.gamesLogged.label')}
          value={totalGames}
          sub={t('stats.gamesLogged.sub')}
          color="blue"
        />
        <StatCard
          label={t('stats.deckSize.label')}
          value={`${totalCards}/60`}
          sub={
            totalCards === 60
              ? t('stats.deckSize.complete')
              : totalCards > 60
                ? t('stats.deckSize.overLimit')
                : t('stats.deckSize.incomplete')
          }
          color={totalCards === 60 ? 'green' : totalCards > 60 ? 'red' : 'default'}
        />
        <StatCard
          label={t('stats.topThreat.label')}
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
          sub={
            topMeta
              ? t('stats.topThreat.metaShare', { pct: topMeta.frequencyPct })
              : t('stats.topThreat.noData')
          }
          color="purple"
        />
      </div>

      {/* Meta works without logs (plan personal-data-role-rework §3.8): the
          table below is real tournament data, not personal — a zero-log
          account should not read as "broken", and the static thresholds
          motivate logging without duplicating the 14-rule engine. */}
      {opponentLogs.length === 0 && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-sm font-semibold text-slate-800 mb-1">
            {t('metaWorksWithoutLogs.title')}
          </p>
          <p className="text-xs text-slate-600 mb-2">{t('metaWorksWithoutLogs.body')}</p>
          <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
            <li>{t('metaWorksWithoutLogs.items.matchups')}</li>
            <li>{t('metaWorksWithoutLogs.items.playQuality')}</li>
            <li>{t('metaWorksWithoutLogs.items.versionComparison')}</li>
          </ul>
        </div>
      )}

      <MyMatchupsTable stats={archetypeStats} />
    </div>
  );
}
