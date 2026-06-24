import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Swords } from 'lucide-react';
import type { DeckAnalytics, WinRateBlock } from '@pokekon/shared';
import { getDeckAnalytics } from '../../lib/api';

const WEEKS = [1, 2, 3, 4] as const;
type Weeks = (typeof WEEKS)[number];

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

function wrColor(v: number | null): string {
  if (v === null) return 'text-gray-600';
  return v >= 55 ? 'text-emerald-400' : v >= 45 ? 'text-yellow-400' : 'text-red-400';
}

/** A compact "going first/second" win-rate tile. */
function SplitTile({ label, block }: { label: string; block: WinRateBlock }) {
  const { t } = useTranslation('deck');
  return (
    <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
      <div className={`text-xl font-bold ${wrColor(block.winRatePct)}`}>
        {fmtPct(block.winRatePct)}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">
        {t('analytics.turnQuality.games', { count: block.games })}
      </div>
    </div>
  );
}

/**
 * Server-computed turn-quality analytics for the active deck (plan §3.7.1):
 * record, going-first/second win rate, clean-setup share, dead-turn rate and the
 * average remaining-prize curve of won games. Reads GET /api/analytics/deck/:id
 * (derived from the parsed battle logs) for a selectable 1/2/3/4-week window.
 */
export function DeckTurnQualityPanel({ deckId }: { deckId: number }) {
  const { t } = useTranslation('deck');
  const [weeks, setWeeks] = useState<Weeks>(4);
  const [data, setData] = useState<DeckAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeckAnalytics(deckId, weeks)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, weeks]);

  const maxPrizeGames = data ? Math.max(1, ...data.prizeCurveWins.map((p) => p.games)) : 1;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-wrap">
        <Activity className="w-4 h-4 text-brand-400" aria-hidden="true" />
        <h3 className="card-header mb-0">{t('analytics.turnQuality.title')}</h3>
        <span className="text-xs text-gray-500">{t('analytics.turnQuality.subtitle')}</span>
        <div
          className="ml-auto flex items-center gap-1"
          role="group"
          aria-label={t('analytics.turnQuality.weeksLabel')}
        >
          {WEEKS.map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                weeks === w
                  ? 'bg-brand-500/25 text-brand-300 border border-brand-400/30'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              {t('analytics.turnQuality.weeksShort', { count: w })}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-gray-800/40" aria-hidden="true" />
        ) : error ? (
          <p className="text-xs text-red-400 py-6 text-center">
            {t('analytics.turnQuality.error')}
          </p>
        ) : !data || data.record.games === 0 ? (
          <p className="text-xs text-gray-600 py-6 text-center">
            {t('analytics.turnQuality.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Record + KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
                <div className={`text-xl font-bold ${wrColor(data.record.winRatePct)}`}>
                  {fmtPct(data.record.winRatePct)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t('analytics.turnQuality.winRate')}
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5 font-mono">
                  {data.record.wins}-{data.record.losses}-{data.record.ties}
                </div>
              </div>
              <SplitTile label={t('analytics.turnQuality.goingFirst')} block={data.goingFirst} />
              <SplitTile label={t('analytics.turnQuality.goingSecond')} block={data.goingSecond} />
              <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
                <div className={`text-xl font-bold ${wrColor(data.setup.cleanRatePct)}`}>
                  {fmtPct(data.setup.cleanRatePct)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t('analytics.turnQuality.setupClean')}
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">
                  {t('analytics.turnQuality.parsedGames', { count: data.setup.parsedGames })}
                </div>
              </div>
            </div>

            {/* Dead-turn rate */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Swords className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
              <span>{t('analytics.turnQuality.deadTurns')}:</span>
              <span className="text-gray-200 font-semibold">
                {data.deadTurns.avgPerGame === null ? '—' : data.deadTurns.avgPerGame.toFixed(2)}
              </span>
              <span className="text-gray-600">
                {t('analytics.turnQuality.parsedGames', { count: data.deadTurns.parsedGames })}
              </span>
            </div>

            {/* Prize curve of won games */}
            {data.prizeCurveWins.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2">
                  {t('analytics.turnQuality.prizeCurve')}
                  <span className="text-gray-600 ml-1">
                    {t('analytics.turnQuality.prizeCurveHint')}
                  </span>
                </div>
                <div className="space-y-1">
                  {data.prizeCurveWins
                    .filter((p) => p.turn > 0)
                    .map((p) => (
                      <div key={p.turn} className="flex items-center gap-2 text-xs">
                        <span className="w-12 shrink-0 text-gray-500">
                          {t('analytics.turnQuality.turn', { turn: p.turn })}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{ width: `${(p.avgPrizesRemaining / 6) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right tabular-nums text-gray-300">
                          {p.avgPrizesRemaining.toFixed(1)}
                        </span>
                        <span
                          className="w-6 shrink-0 text-right text-gray-600"
                          style={{ opacity: 0.4 + 0.6 * (p.games / maxPrizeGames) }}
                          title={t('analytics.turnQuality.games', { count: p.games })}
                        >
                          ×{p.games}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
