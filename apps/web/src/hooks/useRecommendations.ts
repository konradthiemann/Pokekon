import { useMemo } from 'react';
import type {
  ArchetypeStats,
  DeckCard,
  DeckRecommendation,
  DeckSnapshot,
  DeckPerformanceStats,
  OpponentLog,
} from '../types';

// ─── Tech card suggestions keyed by opponent archetype ────────────────────────

/**
 * Hand-curated lookup of tech card suggestions indexed by archetype display name.
 * Keys are case-sensitive and must match the `archetype` field stored in `OpponentLog`
 * exactly (e.g. "Dragapult ex", not "dragapult-ex"). Update this object manually
 * whenever the competitive meta shifts and new counter-cards become relevant.
 */
// All suggested cards must be Standard-legal (Regulation H, I, J — post-G rotation April 2026).
// Iono, Path to the Peak, Lost Vacuum, Collapsed Stadium, Canceling Cologne are all G or older — removed.
const TECH_SUGGESTIONS: Record<string, { card: string; reason: string }> = {
  'Dragapult ex': {
    card: 'Eri',
    reason:
      "Hand disruption (H regulation) slows Dragapult's setup; reduces opponent hand mid-game.",
  },
  'Dragapult Blaziken': {
    card: 'Eri',
    reason: 'Disrupts the Blaziken energy acceleration before it comes online.',
  },
  'Dragapult Dusknoir': {
    card: 'Unfair Stamp',
    reason: "Resets opponent's hand to a small number before Dusknoir's Ability chain activates.",
  },
  "N's Zoroark ex": {
    card: 'Briar',
    reason: 'Snipes benched Zorua before it evolves, cutting off the draw engine.',
  },
  "N's Zoroark": {
    card: 'Briar',
    reason: 'Snipes benched Zorua before it evolves, cutting off the draw engine.',
  },
  'Lucario Hariyama': {
    card: 'Fezandipiti ex',
    reason: "Disrupts the bench and hand to slow Lucario's aggressive early game.",
  },
  'Alakazam Dudunsparce': {
    card: 'TM: Devolution',
    reason: 'Devolves Alakazam back to Abra, removing the ability engine.',
  },
  'Starmie Froslass': {
    card: 'Eri',
    reason: 'Hand disruption breaks the Starmie / Froslass setup loop.',
  },
  "Cynthia's Garchomp ex": {
    card: 'Unfair Stamp',
    reason: "Reduces hand size before Garchomp's ability chain activates.",
  },
  "Rocket's Mewtwo": {
    card: 'Eri',
    reason: 'Hand disruption prevents setting up the Mewtwo attack chain.',
  },
  'Ogerpon Meganium': {
    card: 'Fezandipiti ex',
    reason: 'Disrupts the Meganium bench, preventing energy acceleration for Ogerpon.',
  },
  'Raging Bolt Ogerpon': {
    card: "Hero's Cape",
    reason: "Reduces damage taken from Raging Bolt's high-damage attacks.",
  },
  'Raging Bolt ex': {
    card: "Hero's Cape",
    reason: "Reduces damage from Raging Bolt's Ancient attacks.",
  },
  'Grimmsnarl Froslass': {
    card: 'TM: Devolution',
    reason: 'Devolves Grimmsnarl to interrupt ability-based strategies before they lock in.',
  },
  "Rocket's Honchkrow": {
    card: 'Eri',
    reason: "Hand disruption to break Honchkrow's setup before it attacks.",
  },
  'Okidogi Barbaracle': {
    card: 'Unfair Stamp',
    reason: "Hand reset disrupts Barbaracle's lock strategy from the start.",
  },
  'Mega Venusaur': {
    card: 'Briar',
    reason: 'Bench damage knocks out the support Pokémon enabling Mega Venusaur.',
  },
  Greninja: { card: 'Unfair Stamp', reason: 'Hand disruption slows the Greninja setup chain.' },
  Slowking: {
    card: 'TM: Devolution',
    reason: 'Devolves Slowking to interrupt ability-based stall strategies.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function winRate(wins: number, losses: number): number {
  return wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
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
 * change to the six dependencies: `archetypeStats`, `deckCards`, `opponentLogs`,
 * `deckSnapshots`, `deckStats`, and `localMeta`. Pass stable references where possible
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
  return useMemo(() => {
    const recs: DeckRecommendation[] = [];
    if (archetypeStats.length === 0) return recs;

    // Build a normalized set for fast local-meta lookup
    const localMetaSet = new Set(localMeta.map((a) => a.toLowerCase()));

    const deckCardNames = new Set(deckCards.map((c) => c.name.toLowerCase()));
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
          const wr = winRate(wins, losses);
          const label =
            snapId != null
              ? (snapMap.get(snapId)?.label ?? `Snapshot #${snapId}`)
              : 'Before first save';
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
          suggestion: `vs ${archStat.archetype}: ${trend === 'improving' ? 'Current build is stronger' : 'Revert recent changes?'}`,
          reasoning: `"${best.label}" → ${best.wr}% WR (${best.games} games). "${worst.label}" → ${worst.wr}% WR (${worst.games} games). ${trend === 'declining' ? 'Your latest changes may have hurt this matchup.' : 'Current changes appear positive.'}`,
          dataPoints: archStat.encounters,
        });
      }
    }

    // ── 2. TECH SUGGESTIONS FOR BAD MATCHUPS ─────────────────────────────────
    for (const stats of sortedStats) {
      if (stats.winRate > 50 || stats.encounters < 5) continue;
      const tech = TECH_SUGGESTIONS[stats.archetype];
      if (!tech || deckCardNames.has(tech.card.toLowerCase())) continue;

      const isLocal = localMetaSet.has(stats.archetype.toLowerCase());
      recs.push({
        id: `tech-${stats.archetype}`,
        // Local meta archetypes are always high priority when win rate is bad
        priority: isLocal || stats.encounters >= 4 ? 'high' : 'medium',
        category: 'tech',
        suggestion: `Add 1× ${tech.card}${isLocal ? ' 📍 local meta' : ''}`,
        reasoning: `You're ${stats.wins}W/${stats.losses}L vs ${stats.archetype} (${stats.winRate}% WR in ${stats.encounters} games).${isLocal ? ' This is a key local matchup.' : ''} ${tech.reason}`,
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
        suggestion: `Research ${stats.archetype} matchup${isLocal ? ' 📍 local meta' : ''}`,
        reasoning: `0 wins in ${stats.encounters} games vs ${stats.archetype} (${stats.frequencyPct}% meta${isLocal ? ', local priority' : ''}). Highest-priority gap.`,
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
        suggestion: `Log matches vs ${arch} 📍 local meta`,
        reasoning: `${arch} is in your local meta but you have no logged games. Track this matchup to get targeted recommendations.`,
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
        suggestion: "Add 2× Boss's Orders",
        reasoning:
          'Gust effect is a staple. Missing it limits ability to take prizes around tanky benched Pokémon.',
        dataPoints: 0,
      });
    } else if (bossCard.count < 2) {
      recs.push({
        id: 'ratio-boss-count',
        priority: 'medium',
        category: 'ratio',
        suggestion: `Increase Boss's Orders to 2 copies (currently ${bossCard.count})`,
        reasoning: 'Single copy is inconsistent. Two copies is the competitive standard.',
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
        suggestion: 'Add Pokémon search (Ultra Ball / Nest Ball / Buddy-Buddy Poffin)',
        reasoning: 'No Pokémon search detected. These are critical for consistent setup.',
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
          return { id, logs, wr: winRate(w, l) };
        })
        .filter((s) => s.logs.length >= 3);

      if (snapStats.length >= 2) {
        const currentSnap = snapStats.find((s) => s.id === snapIds[0]);
        const bestSnap = snapStats.reduce((a, b) => (a.wr >= b.wr ? a : b));

        if (currentSnap && bestSnap.id !== currentSnap.id && bestSnap.wr - currentSnap.wr >= 15) {
          const bestLabel =
            deckSnapshots.find((s) => s.id === bestSnap.id)?.label ?? `Snapshot #${bestSnap.id}`;
          const currentLabel = deckSnapshots[0].label;
          recs.push({
            id: 'version-overall-decline',
            priority: 'high',
            category: 'version',
            suggestion: `Overall WR dropped: ${bestSnap.wr}% → ${currentSnap.wr}% vs best version`,
            reasoning: `"${bestLabel}" averaged ${bestSnap.wr}% WR (${bestSnap.logs.length} games). Current "${currentLabel}" averaging ${currentSnap.wr}% WR (${currentSnap.logs.length} games). Consider reverting.`,
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
        suggestion: `Test vs ${stats.archetype} (${stats.frequencyPct}% meta share)`,
        reasoning: `No logged games vs ${stats.archetype}. With ${stats.frequencyPct}% meta presence, you'll likely face it.`,
        dataPoints: 0,
      });
    }

    // ── 8. DATA SPARSITY ─────────────────────────────────────────────────────
    if (totalEncounters > 0 && totalEncounters < 5) {
      recs.push({
        id: 'data-sparse',
        priority: 'low',
        category: 'tech',
        suggestion: 'Log more matches for better recommendations',
        reasoning: `Only ${totalEncounters} games logged. Recommendations improve significantly with 10+ games.`,
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
            suggestion: `Consider removing "${card.card}" (only played in ${card.playRate}% of games)`,
            reasoning: `Played in ${card.gamesPlayed} out of ${n} logged games. Low play rate suggests inconsistency or low relevance.`,
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
            suggestion: `"${card.card}" has low WR when played (${card.winRate}% vs. ${deckStats.overallWinRate}% overall)`,
            reasoning: `In ${decisive} games with this card: ${card.winsWithCard}W/${card.lossesWithCard}L (${card.winRate}% WR). ${Math.abs(delta)}% below your overall WR. May indicate tempo loss caused by this card.`,
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
          suggestion: `Improve turn-1 consistency (avg ${deckStats.avgTurn1Actions} actions)`,
          reasoning: `Your first turn averages only ${deckStats.avgTurn1Actions} actions across ${n} logged games. Consider more draw supporters or search cards for a more reliable opening.`,
          dataPoints: n,
        });
      }

      // 12. Brick rate
      if (deckStats.lowActivityTurnRate > 35) {
        recs.push({
          id: 'brick-rate',
          priority: 'medium',
          category: 'add',
          suggestion: `High brick rate: ${deckStats.lowActivityTurnRate}% low-activity turns`,
          reasoning: `${deckStats.lowActivityTurnRate}% of your turns had ≤1 action. This suggests frequent hand problems — more consistency cards may help.`,
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
          suggestion: `Avg only ${deckStats.prizeEfficiency.avgPrizesYouTookInLosses} prizes taken in losses`,
          reasoning: `In your ${deckStats.prizeEfficiency.lossGamesCount} logged losses you take very few prizes on average. This points to a fundamental early-game weakness. Review your setup Pokémon and tempo attackers.`,
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
            suggestion: `Tempo weakness: wins avg ${deckStats.avgGameLengthWins} turns, losses avg ${deckStats.avgGameLengthLosses} turns`,
            reasoning: `You are losing significantly faster than you win. Often a sign of missing early disruption or too-slow attackers. Review your turns 1–3 game plan.`,
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
  }, [archetypeStats, deckCards, opponentLogs, deckSnapshots, deckStats, localMeta]);
}
