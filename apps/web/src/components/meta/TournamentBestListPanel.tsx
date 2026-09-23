import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RankedCluster } from '@pokekon/shared';
import {
  getTournamentArchetypeBestList,
  type TournamentArchetypeBestListResponse,
} from '../../lib/api';
import { CardGroup } from './DecklistCard';
import { ListFieldPerformance } from './ListFieldPerformance';
import { WinRateBadge } from './WinRateBadge';

export interface TournamentBestListPanelProps {
  archetypeId: string;
  /** DISTINCT tournaments the currently loaded decklists were drawn from
   *  (`ArchetypeDetail.tsx` derives this from its `lists` state, deduplicated
   *  by `tournament.id`). */
  tournaments: { id: string; name: string; date: string; players: number }[];
}

/** One ranked decklist cluster for ONE tournament's own field — same shape
 *  and layout as `ArchetypeRecommendationPanel`'s `ClusterItem`, but a
 *  deliberately separate component: this feature answers "what would have
 *  been best HERE", not "what does the multi-tournament KI recommendation
 *  say", and is never an LLM call. */
function TournamentClusterItem({ cluster }: { cluster: RankedCluster }) {
  const { t } = useTranslation('meta');
  const record =
    cluster.totalTies > 0
      ? `${cluster.totalWins}-${cluster.totalLosses}-${cluster.totalTies}`
      : `${cluster.totalWins}-${cluster.totalLosses}`;
  const pokemonSummary = cluster.representative.pokemon
    .map((card) => `${card.count}× ${card.name}`)
    .join(', ');

  return (
    <div data-testid="tournament-best-list-cluster-item" className="card p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-brand-700">
          {t('archetypeDetail.tournamentBestList.cluster.rank', { rank: cluster.rank })}
        </span>
        <WinRateBadge pct={cluster.winRateInterval?.pct ?? null} />
      </div>
      {cluster.winRateInterval && (
        <p className="text-[11px] text-slate-400 font-mono">
          {`${cluster.winRateInterval.lowPct.toFixed(1)}–${cluster.winRateInterval.highPct.toFixed(1)} %`}
        </p>
      )}
      {/* Field-weighted score against THIS tournament's own field (the route
       *  always re-ranks by it, since the field comes straight from the
       *  tournament's own standings — practically always present once any
       *  member has matchResults vs the field). */}
      {cluster.fieldScore?.fieldWinRatePct != null && (
        <p
          data-testid="tournament-best-list-cluster-field-score"
          className="text-xs text-slate-600"
        >
          {t('archetypeDetail.tournamentBestList.cluster.fieldScore')}
          {': '}
          <WinRateBadge pct={cluster.fieldScore.fieldWinRatePct} />
          {cluster.fieldScore.fieldWinRateLowPct != null &&
            cluster.fieldScore.fieldWinRateHighPct != null && (
              <span className="text-[11px] text-slate-400 font-mono ml-1">
                {`(${cluster.fieldScore.fieldWinRateLowPct.toFixed(1)}–${cluster.fieldScore.fieldWinRateHighPct.toFixed(1)} %)`}
              </span>
            )}
        </p>
      )}
      <p className="text-xs text-slate-600">
        {t('archetypeDetail.tournamentBestList.cluster.games', { record })}
        {' · '}
        {t('archetypeDetail.tournamentBestList.cluster.members', {
          count: cluster.memberStandingIds.length,
        })}
      </p>
      {cluster.avgPlacementPercentile !== null && (
        <p className="text-xs text-slate-500">
          {t('archetypeDetail.tournamentBestList.cluster.placement', {
            pct: cluster.avgPlacementPercentile.toFixed(0),
          })}
        </p>
      )}
      {pokemonSummary && (
        <p className="text-xs text-slate-500 truncate" title={pokemonSummary}>
          {pokemonSummary}
        </p>
      )}
      {/* Full decklist on demand, same fix as ArchetypeRecommendationPanel's
          ClusterItem -- the truncated summary above never showed
          Trainer/Energy and had no reachable way to see the rest. */}
      <details className="text-xs">
        <summary
          data-testid="tournament-best-list-cluster-decklist-toggle"
          className="cursor-pointer text-brand-700 font-semibold w-fit"
        >
          {t('archetypeDetail.tournamentBestList.cluster.viewDecklist')}
        </summary>
        <div
          data-testid="tournament-best-list-cluster-decklist"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 pt-2 border-t border-slate-100"
        >
          <CardGroup
            title={t('archetypeDetail.lists.pokemon')}
            entries={cluster.representative.pokemon}
          />
          <CardGroup
            title={t('archetypeDetail.lists.trainer')}
            entries={cluster.representative.trainer}
          />
          <CardGroup
            title={t('archetypeDetail.lists.energy')}
            entries={cluster.representative.energy}
          />
        </div>
      </details>
    </div>
  );
}

/** One successful GET, tagged with the request key it answers (tournament +
 *  archetype) — same "ignore stale responses" pattern as ArchetypeDetail's
 *  LoadedDetail / ArchetypeRecommendationPanel's LoadedSynthesis. */
interface Loaded {
  key: string;
  data: TournamentArchetypeBestListResponse;
}

/** One failed GET, tagged the same way. */
interface Failed {
  key: string;
  message: string;
}

/**
 * Per-tournament "which list would have been best here" panel (Spec 10 AC-G
 * third bullet, specs/archetype-meta-analysis.md). Mounted in
 * `ArchetypeDetail.tsx` after the raw decklists. Conceptually separate from
 * `ArchetypeRecommendationPanel`'s multi-tournament KI recommendation: this
 * is a pure read (`GET /api/analysis/tournament/:tournamentId/archetype/:archetypeId`,
 * never an LLM call), scoped to ONE tournament the user explicitly picks, and
 * its "reasoning" is the real per-opponent match results at that tournament
 * (`ListFieldPerformance`), not generated text.
 */
export function TournamentBestListPanel({
  archetypeId,
  tournaments,
}: TournamentBestListPanelProps) {
  const { t } = useTranslation('meta');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);

  useEffect(() => {
    if (!selectedTournamentId) return;
    let cancelled = false;
    const key = `${selectedTournamentId}|${archetypeId}`;
    getTournamentArchetypeBestList(selectedTournamentId, archetypeId)
      .then((data) => {
        if (cancelled) return;
        setLoaded({ key, data });
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed({ key, message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTournamentId, archetypeId]);

  const requestKey = selectedTournamentId ? `${selectedTournamentId}|${archetypeId}` : null;
  const current = loaded?.key === requestKey ? loaded.data : null;
  const failure = failed?.key === requestKey ? failed : null;
  const isLoading = requestKey !== null && current === null && failure === null;
  const error = failure?.message ?? null;
  const clusters = current?.clusters ?? [];
  const topCluster = clusters[0] ?? null;
  // ListFieldPerformance expects `{ archetypeId, name }[]`; the wire shape
  // uses `archetypeName` (mirrors every other field-analysis response).
  const evidenceField = (current?.field ?? []).map((f) => ({
    archetypeId: f.archetypeId,
    name: f.archetypeName,
  }));

  return (
    <div data-testid="tournament-best-list-panel" className="card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">
        {t('archetypeDetail.tournamentBestList.title')}
      </h3>

      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        {t('archetypeDetail.tournamentBestList.selectLabel')}
        <select
          data-testid="tournament-best-list-select"
          value={selectedTournamentId}
          onChange={(e) => setSelectedTournamentId(e.target.value)}
          className="input max-w-xs flex-1 px-2 py-1.5 text-xs"
        >
          <option value="">{t('archetypeDetail.tournamentBestList.selectPlaceholder')}</option>
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name} · {new Date(tournament.date).toLocaleDateString()}
            </option>
          ))}
        </select>
      </label>

      {isLoading && (
        <p data-testid="tournament-best-list-loading" className="text-xs text-slate-500">
          {t('archetypeDetail.tournamentBestList.loading')}
        </p>
      )}

      {error && (
        <p
          data-testid="tournament-best-list-error"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
        >
          {error}
        </p>
      )}

      {current && clusters.length === 0 && (
        <p data-testid="tournament-best-list-empty" className="text-sm text-slate-500">
          {t('archetypeDetail.tournamentBestList.empty')}
        </p>
      )}

      {current && clusters.length > 0 && (
        <>
          {/* Methodology, collapsed by default -- same explanation as
              ArchetypeRecommendationPanel's ClusterItem, since both render
              the identical rank/interval/record/placement/field-score
              numbers with no inline explanation of how they were derived. */}
          <details data-testid="tournament-best-list-methodology" className="text-xs">
            <summary
              data-testid="tournament-best-list-methodology-toggle"
              className="cursor-pointer w-fit text-slate-500"
            >
              {t('archetypeDetail.tournamentBestList.methodology.toggle')}
            </summary>
            <ul className="mt-1.5 ml-5 list-disc space-y-1 text-slate-500">
              <li>{t('archetypeDetail.tournamentBestList.methodology.rank')}</li>
              <li>{t('archetypeDetail.tournamentBestList.methodology.interval')}</li>
              <li>{t('archetypeDetail.tournamentBestList.methodology.record')}</li>
              <li>{t('archetypeDetail.tournamentBestList.methodology.placement')}</li>
              <li>{t('archetypeDetail.tournamentBestList.methodology.fieldScore')}</li>
            </ul>
          </details>
          <div
            data-testid="tournament-best-list-cluster-list"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {clusters.map((cluster) => (
              <TournamentClusterItem key={cluster.rank} cluster={cluster} />
            ))}
          </div>
        </>
      )}

      {current && topCluster && (
        <div data-testid="tournament-best-list-evidence" className="space-y-1.5">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('archetypeDetail.tournamentBestList.evidenceTitle')}
          </h4>
          <ListFieldPerformance
            matchResults={topCluster.matchResults}
            field={evidenceField}
            iconsById={{}}
          />
        </div>
      )}
    </div>
  );
}
