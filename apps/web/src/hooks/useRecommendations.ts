import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { tournamentWinRatePct } from '@pokekon/shared';
import type {
  ArchetypeStats,
  DeckCard,
  DeckRecommendation,
  DeckSnapshot,
  DeckPerformanceStats,
  OpponentLog,
} from '../types';

// NOTE: The old hand-curated `TECH_SUGGESTIONS` table (archetype → "add card X")
// was removed deliberately. Asserting a specific counter card is not defensible:
// a card that appears often in winning lists may be a universal STAPLE (not a
// tech), and a genuine tech may not fit every deck's energy/shell. Rule 2 below
// now only reports the matchup weakness from the user's OWN data and points to
// the data-driven List Comparison (successful lists of their own archetype,
// which is deck-fit-safe). See the "tech-suggestion-lift-not-frequency" memory.

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Tie-weighted (a tie counts as a third of a win), not wins/(wins+losses) —
// plan personal-data-role-rework.md §6 decision 1, single win-rate formula.
function winRate(wins: number, losses: number, ties: number): number {
  return tournamentWinRatePct(wins, losses, ties, 0) ?? 0;
}

/** Group logs by deck snapshot ID (null = untagged) */
function groupBySnapshot(logs: OpponentLog[]): Map<number | null, OpponentLog[]> {
  const map = new Map<number | null, OpponentLog[]>();
  for (const log of logs) {
    const key = log.deckSnapshotId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return map;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface RecommendationInput {
  archetypeStats: ArchetypeStats[];
  deckCards: DeckCard[];
  opponentLogs: OpponentLog[];
  deckSnapshots: DeckSnapshot[];
  /** Archetypes the user commonly faces locally — these get priority boost */
  localMeta: string[];
  /** Aggregated statistics from battle-log protocols */
  deckStats?: DeckPerformanceStats | null;
}

/**
 * Derives a prioritised list of deck improvement recommendations from the user's battle
 * history, current deck list, and live meta data.
 *
 * Returns a `DeckRecommendation[]` sorted high → medium → low priority, then by
 * descending `dataPoints` within each tier. The array is empty until meaningful data is
 * present — callers should handle the zero-length case.
 *
 * React concept: the result is memoized via `useMemo`. Recalculation is triggered by any
 * change to the dependencies: `archetypeStats`, `deckCards`, `opponentLogs`,
 * `deckSnapshots`, `deckStats`, `localMeta`, and `t` (so a language switch regenerates
 * the suggestion/reasoning strings). Pass stable references where possible
 * (e.g. from the Zustand store) to avoid unnecessary recomputes.
 */
export function useRecommendations({
  archetypeStats,
  deckCards,
  opponentLogs,
  deckSnapshots,
  localMeta,
  deckStats,
}: RecommendationInput): DeckRecommendation[] {
  const { t } = useTranslation('recommendations');

  return useMemo(() => {
    const recs: DeckRecommendation[] = [];
    if (archetypeStats.length === 0) return recs;

    /** Localized "{{count}} game(s)" fragment used inside reasoning strings */
    const games = (count: number) => t('games', { count });
    const localMetaBadge = ` ${t('localMetaBadge')}`;

    // Build a normalized set for fast local-meta lookup
    const localMetaSet = new Set(localMeta.map((a) => a.toLowerCase()));

    const totalEncounters = archetypeStats.reduce((s, a) => s + a.encounters, 0);

    const sortedStats = [...archetypeStats]
      .filter((a) => a.encounters > 0)
      .sort((a, b) => b.encounters - a.encounters);

    // ── 1. DECK VERSION COMPARISON ──────────────────────────────────────────
    // Compare performance across deck snapshots for the same archetype matchups
    if (deckSnapshots.length >= 2 && opponentLogs.length >= 4) {
      const snapMap = new Map(deckSnapshots.map((s) => [s.id!, s]));
      const logsBySnap = groupBySnapshot(opponentLogs);

      for (const archStat of sortedStats) {
        if (archStat.encounters < 3) continue;

        const resultsBySnap: { snapId: number | null; label: string; wr: number; games: number }[] =
          [];

        for (const [snapId, snapLogs] of logsBySnap) {
          const matchLogs = snapLogs.filter((l) => l.archetype === archStat.archetype);
          if (matchLogs.length < 1) continue;
          const wins = matchLogs.filter((l) => l.result === 'W').length;
          const losses = matchLogs.filter((l) => l.result === 'L').length;
          const ties = matchLogs.filter((l) => l.result === 'T').length;
          const wr = winRate(wins, losses, ties);
          const label =
            snapId != null
              ? (snapMap.get(snapId)?.label ?? t('snapshotFallback', { id: snapId }))
              : t('rules.version.beforeFirstSave');
          resultsBySnap.push({ snapId, label, wr, games: matchLogs.length });
        }

        if (resultsBySnap.length < 2) continue;

        // Find best and worst performing versions
        const best = resultsBySnap.reduce((a, b) => (a.wr >= b.wr ? a : b));
        const worst = resultsBySnap.reduce((a, b) => (a.wr <= b.wr ? a : b));
        if (best.wr - worst.wr < 15) continue; // only flag meaningful swings

        // Determine if current deck (latest snap or untagged) is the better version
        const latestSnapId = deckSnapshots[0]?.id ?? null;
        const currentResult = resultsBySnap.find((r) => r.snapId === latestSnapId);
        const currentWR = currentResult?.wr ?? archStat.winRate;
        const trend = currentWR >= best.wr - 5 ? 'improving' : 'declining';

        recs.push({
          id: `version-${archStat.archetype}`,
          priority: best.wr - worst.wr >= 30 ? 'high' : 'medium',
          category: 'version',
          suggestion: t(
            trend === 'improving'
              ? 'rules.version.suggestionImproving'
              : 'rules.version.suggestionDeclining',
            { archetype: archStat.archetype },
          ),
          reasoning: t(
            trend === 'declining'
              ? 'rules.version.reasoningDeclining'
              : 'rules.version.reasoningImproving',
            {
              bestLabel: best.label,
              bestWr: best.wr,
              bestGames: games(best.games),
              worstLabel: worst.label,
              worstWr: worst.wr,
              worstGames: games(worst.games),
            },
          ),
          dataPoints: archStat.encounters,
        });
      }
    }

    // ── 2. WEAK MATCHUPS (data-grounded, no fabricated tech card) ────────────
    // Flag matchups the user actually loses (from their OWN logged games) and
    // point to the data-driven List Comparison instead of asserting a counter
    // card. Zero-win matchups are Rule 3's job, so require at least one win here.
    for (const stats of sortedStats) {
      if (stats.wins === 0 || stats.winRate > 50 || stats.encounters < 5) continue;
      const isLocal = localMetaSet.has(stats.archetype.toLowerCase());
      recs.push({
        id: `tech-${stats.archetype}`,
        // High for a key local matchup or a well-sampled loss; medium otherwise.
        priority: isLocal || stats.encounters >= 8 ? 'high' : 'medium',
        category: 'tech',
        suggestion: `${t('rules.tech.suggestion', { archetype: stats.archetype })}${isLocal ? localMetaBadge : ''}`,
        reasoning: `${t('rules.tech.reasoning', {
          wins: stats.wins,
          losses: stats.losses,
          archetype: stats.archetype,
          winRate: stats.winRate,
          games: games(stats.encounters),
        })}${isLocal ? ` ${t('rules.tech.localNote')}` : ''} ${t('rules.tech.dataHint')}`,
        dataPoints: stats.encounters,
      });
    }

    // ── 3. ZERO-WIN HIGH-FREQUENCY ARCHETYPE ─────────────────────────────────
    for (const stats of sortedStats) {
      if (stats.losses === 0 || stats.wins > 0) continue;
      const isLocal = localMetaSet.has(stats.archetype.toLowerCase());
      // Local meta: flag even if below 8% meta share
      if (stats.frequencyPct < 8 && !isLocal) continue;
      recs.push({
        id: `matchup-${stats.archetype}`,
        priority: 'high',
        category: 'tech',
        suggestion: `${t('rules.zeroWin.suggestion', { archetype: stats.archetype })}${isLocal ? localMetaBadge : ''}`,
        reasoning: t(isLocal ? 'rules.zeroWin.reasoningLocal' : 'rules.zeroWin.reasoning', {
          games: games(stats.encounters),
          archetype: stats.archetype,
          metaPct: stats.frequencyPct,
        }),
        dataPoints: stats.encounters,
      });
    }

    // ── 3b. LOCAL META BLIND SPOTS ────────────────────────────────────────────
    // Flag local meta archetypes with no logged data at all
    for (const arch of localMeta) {
      const stats = archetypeStats.find((a) => a.archetype.toLowerCase() === arch.toLowerCase());
      if (stats && stats.encounters > 0) continue; // already have data
      recs.push({
        id: `local-blindspot-${arch}`,
        priority: 'high',
        category: 'tech',
        suggestion: `${t('rules.localBlindspot.suggestion', { archetype: arch })}${localMetaBadge}`,
        reasoning: t('rules.localBlindspot.reasoning', { archetype: arch }),
        dataPoints: 0,
      });
    }

    // ── 4. BOSS'S ORDERS RATIO ────────────────────────────────────────────────
    const bossCard = deckCards.find((c) => c.name.toLowerCase().includes("boss's orders"));
    if (!bossCard) {
      recs.push({
        id: 'ratio-boss',
        priority: 'medium',
        category: 'add',
        suggestion: t('rules.bossMissing.suggestion'),
        reasoning: t('rules.bossMissing.reasoning'),
        dataPoints: 0,
      });
    } else if (bossCard.count < 2) {
      recs.push({
        id: 'ratio-boss-count',
        priority: 'medium',
        category: 'ratio',
        suggestion: t('rules.bossCount.suggestion', { count: bossCard.count }),
        reasoning: t('rules.bossCount.reasoning'),
        dataPoints: 0,
      });
    }

    // ── 5. CONSISTENCY: BALL SEARCH ──────────────────────────────────────────
    const hasBalls = deckCards.some((c) =>
      ['ultra ball', 'nest ball', 'buddy-buddy poffin', 'poké ball', 'poke ball'].some((b) =>
        c.name.toLowerCase().includes(b),
      ),
    );
    if (!hasBalls && deckCards.length > 0) {
      recs.push({
        id: 'consistency-balls',
        priority: 'medium',
        category: 'add',
        suggestion: t('rules.ballSearch.suggestion'),
        reasoning: t('rules.ballSearch.reasoning'),
        dataPoints: 0,
      });
    }

    // ── 6. WIN RATE DEGRADATION ACROSS ALL MATCHUPS ──────────────────────────
    if (deckSnapshots.length >= 2 && opponentLogs.length >= 6) {
      const snapIds = deckSnapshots.map((s) => s.id!);

      // Compute per-snapshot WR for all snapshots that have enough games
      const snapStats = snapIds
        .map((id) => {
          const logs = opponentLogs.filter((l) => l.deckSnapshotId === id);
          const w = logs.filter((l) => l.result === 'W').length;
          const l = logs.filter((l) => l.result === 'L').length;
          const ties = logs.filter((l) => l.result === 'T').length;
          return { id, logs, wr: winRate(w, l, ties) };
        })
        .filter((s) => s.logs.length >= 3);

      if (snapStats.length >= 2) {
        const currentSnap = snapStats.find((s) => s.id === snapIds[0]);
        const bestSnap = snapStats.reduce((a, b) => (a.wr >= b.wr ? a : b));

        if (currentSnap && bestSnap.id !== currentSnap.id && bestSnap.wr - currentSnap.wr >= 15) {
          const bestLabel =
            deckSnapshots.find((s) => s.id === bestSnap.id)?.label ??
            t('snapshotFallback', { id: bestSnap.id });
          const currentLabel = deckSnapshots[0].label;
          recs.push({
            id: 'version-overall-decline',
            priority: 'high',
            category: 'version',
            suggestion: t('rules.overallDecline.suggestion', {
              bestWr: bestSnap.wr,
              currentWr: currentSnap.wr,
            }),
            reasoning: t('rules.overallDecline.reasoning', {
              bestLabel,
              bestWr: bestSnap.wr,
              bestGames: games(bestSnap.logs.length),
              currentLabel,
              currentWr: currentSnap.wr,
              currentGames: games(currentSnap.logs.length),
            }),
            dataPoints: bestSnap.logs.length + currentSnap.logs.length,
          });
        }
      }
    }

    // ── 7. BLIND SPOTS ───────────────────────────────────────────────────────
    const unmet = archetypeStats
      .filter((a) => a.encounters === 0 && a.frequencyPct >= 10)
      // skip any already covered by local-blindspot entries above
      .filter((a) => !localMetaSet.has(a.archetype.toLowerCase()))
      .slice(0, 2);
    for (const stats of unmet) {
      recs.push({
        id: `blindspot-${stats.archetype}`,
        priority: 'low',
        category: 'tech',
        suggestion: t('rules.blindspot.suggestion', {
          archetype: stats.archetype,
          metaPct: stats.frequencyPct,
        }),
        reasoning: t('rules.blindspot.reasoning', {
          archetype: stats.archetype,
          metaPct: stats.frequencyPct,
        }),
        dataPoints: 0,
      });
    }

    // ── 8. DATA SPARSITY ─────────────────────────────────────────────────────
    if (totalEncounters > 0 && totalEncounters < 5) {
      recs.push({
        id: 'data-sparse',
        priority: 'low',
        category: 'tech',
        suggestion: t('rules.dataSparse.suggestion'),
        reasoning: t('rules.dataSparse.reasoning', { count: totalEncounters }),
        dataPoints: totalEncounters,
      });
    }

    // ── 9–13. BATTLE-LOG PERFORMANCE STATS ───────────────────────────────────
    if (deckStats && deckStats.totalGamesAnalyzed >= 3) {
      const n = deckStats.totalGamesAnalyzed;

      // 9. Low-play-rate cards — played in <25% of games despite multiple analyzed games
      for (const card of deckStats.cardPerformance) {
        if (card.playRate < 25 && card.gamesPlayed >= 2) {
          recs.push({
            id: `low-play-${card.card}`,
            priority: 'medium',
            category: 'remove',
            suggestion: t('rules.lowPlayRate.suggestion', {
              card: card.card,
              playRate: card.playRate,
            }),
            reasoning: t('rules.lowPlayRate.reasoning', { played: card.gamesPlayed, total: n }),
            dataPoints: n,
          });
        }
      }

      // 10. Win-rate outlier cards — WR when played is 15+ points below overall WR (min 3 decisive games)
      for (const card of deckStats.cardPerformance) {
        const decisive = card.winsWithCard + card.lossesWithCard;
        if (decisive < 3) continue;
        const delta = card.winRate - deckStats.overallWinRate;
        if (delta < -15) {
          recs.push({
            id: `wr-drag-${card.card}`,
            priority: 'low',
            category: 'remove',
            suggestion: t('rules.winRateDrag.suggestion', {
              card: card.card,
              cardWr: card.winRate,
              overallWr: deckStats.overallWinRate,
            }),
            reasoning: t('rules.winRateDrag.reasoning', {
              games: decisive,
              wins: card.winsWithCard,
              losses: card.lossesWithCard,
              cardWr: card.winRate,
              delta: Math.abs(delta),
            }),
            dataPoints: decisive,
          });
        }
      }

      // 11. Turn-1 consistency
      if (deckStats.avgTurn1Actions < 1.5) {
        recs.push({
          id: 'consistency-turn1',
          priority: 'medium',
          category: 'add',
          suggestion: t('rules.turn1Consistency.suggestion', {
            actions: deckStats.avgTurn1Actions,
          }),
          reasoning: t('rules.turn1Consistency.reasoning', {
            actions: deckStats.avgTurn1Actions,
            count: n,
          }),
          dataPoints: n,
        });
      }

      // 12. Brick rate
      if (deckStats.lowActivityTurnRate > 35) {
        recs.push({
          id: 'brick-rate',
          priority: 'medium',
          category: 'add',
          suggestion: t('rules.brickRate.suggestion', { rate: deckStats.lowActivityTurnRate }),
          reasoning: t('rules.brickRate.reasoning', { rate: deckStats.lowActivityTurnRate }),
          dataPoints: n,
        });
      }

      // 13. Getting dominated in losses
      if (
        deckStats.prizeEfficiency.lossGamesCount >= 2 &&
        deckStats.prizeEfficiency.avgPrizesYouTookInLosses < 2
      ) {
        recs.push({
          id: 'prize-dominated',
          priority: 'high',
          category: 'tech',
          suggestion: t('rules.prizeDominated.suggestion', {
            prizes: deckStats.prizeEfficiency.avgPrizesYouTookInLosses,
          }),
          reasoning: t('rules.prizeDominated.reasoning', {
            count: deckStats.prizeEfficiency.lossGamesCount,
          }),
          dataPoints: deckStats.prizeEfficiency.lossGamesCount,
        });
      }

      // 14. Tempo gap — losing much faster than winning
      if (deckStats.avgGameLengthWins > 0 && deckStats.avgGameLengthLosses > 0) {
        const diff = deckStats.avgGameLengthWins - deckStats.avgGameLengthLosses;
        if (diff >= 3) {
          recs.push({
            id: 'tempo-gap',
            priority: 'medium',
            category: 'tech',
            suggestion: t('rules.tempoGap.suggestion', {
              winTurns: deckStats.avgGameLengthWins,
              lossTurns: deckStats.avgGameLengthLosses,
            }),
            reasoning: t('rules.tempoGap.reasoning'),
            dataPoints: n,
          });
        }
      }
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return recs.sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      return pd !== 0 ? pd : b.dataPoints - a.dataPoints;
    });
  }, [archetypeStats, deckCards, opponentLogs, deckSnapshots, deckStats, localMeta, t]);
}
