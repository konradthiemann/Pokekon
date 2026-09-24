import { and, asc, eq, gte } from 'drizzle-orm';
import {
  blendWithPersonalPrior,
  clusterDecklists,
  computeClusterFieldScores,
  DEFAULT_MIN_TOURNAMENT_PLAYERS,
  factsFromClusterRanking,
  factsFromPersonalPriorBlend,
  rankClusters,
  reorderClustersByFieldScore,
  sanitizeFactLabel,
  selectFacts,
  type ArchetypeShare,
  type ArchetypeSynthesisContext,
  type ArchetypeSynthesisScope,
  type ClusterableStanding,
  type PersonalRecord,
  type RankedCluster,
  type SynthesisFact,
  type SynthesisLanguage,
  type TournamentDecklist,
} from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { tournamentStandings, tournaments } from '../db/schema.js';
import { windowConditions, type MetaWindow } from '../routes/meta.js';

/** Structurally identical to apps/web's `LocalFieldEntry`
 *  (apps/web/src/lib/preferences.ts) — deliberately re-declared here rather
 *  than imported, since packages/shared (and by extension this API layer)
 *  never depends on apps/web (no cross-layer import). */
export interface LocalFieldEntry {
  archetypeId: string;
  name: string;
  weight: number;
}

export interface BuildArchetypeSynthesisFactSetInput {
  archetypeId: string;
  archetypeName: string;
  windowDays: number;
  language: SynthesisLanguage;
  scope: ArchetypeSynthesisScope;
  /** Spec 10 Slice E: opt-in personalisation, only effective for
   *  scope: 'local' (see buildArchetypeSynthesisFactSet doc comment). */
  usePersonalPrior?: boolean | undefined;
  personalRecord?: PersonalRecord | undefined;
  /** Spec 10 Slice D: the user's local meta field (same shape as the
   *  Prediction panel's "lokales Feld", apps/web/src/lib/preferences.ts),
   *  only effective for scope: 'local' (see buildArchetypeSynthesisFactSet
   *  doc comment). Undefined/empty -> clusters keep the existing
   *  Wilson-lower-bound ranking, unchanged from before this feature. */
  localField?: LocalFieldEntry[] | undefined;
}

export interface ArchetypeSynthesisFactSet {
  facts: SynthesisFact[];
  context: ArchetypeSynthesisContext;
  /** The full ranking, not just the capped/selected facts derived from it —
   *  the route surfaces this so a UI can show the ranked list table even
   *  before (or without) triggering an LLM call. */
  rankedClusters: RankedCluster[];
}

/** The ONLY I/O in the archetype-synthesis path (Spec 10 Slice C, mirrors
 *  buildSynthesisFactSet's role for the deck-level route). Reads the
 *  archetype's tournament standings within the window (online Bo1-Swiss,
 *  same scope as every other meta read; `DEFAULT_MIN_TOURNAMENT_PLAYERS`
 *  filters out unrepresentative small events, Spec 10 Slice G), clusters
 *  their decklists (Slice A), ranks the clusters (Slice B), and turns the
 *  ranking into facts (Slice C). Never throws: zero standings -> `facts: []`
 *  with a fully populated context, same "honestly empty" contract as
 *  buildSynthesisFactSet.
 *
 *  Spec 10 Slice D: `scope` is threaded through to `context` for the prompt
 *  framing, AND — since this slice — actually changes the ranking when
 *  `scope === 'local'` and a non-empty `localField` is given: the clusters
 *  are first ranked exactly as before (Wilson lower bound, scope-agnostic),
 *  then re-ranked by their field-weighted score against `localField`
 *  (`computeClusterFieldScores` + `reorderClustersByFieldScore`, reusing
 *  `computeFieldScores` rather than re-deriving the weighted-Wilson math —
 *  see clusterFieldScore.ts). `scope === 'global'`, or `scope === 'local'`
 *  WITHOUT a `localField`, still read and rank the exact same standings as
 *  before — no behaviour change for existing callers that don't pass
 *  `localField` (former Slice C MVP limitation, now resolved for the case
 *  that actually supplies a field).
 *
 *  Spec 10 Slice E personalisation: when `scope === 'local'` and both
 *  `usePersonalPrior` and `personalRecord` are given, the top-ranked
 *  cluster's Wilson-conservative `winRateLowerBoundPct` (not the raw mean —
 *  consistent with Slice B's guiding principle) is blended with the user's
 *  own record via `blendWithPersonalPrior`, producing at most one extra
 *  'personalPrior' fact (see factsFromPersonalPriorBlend). For
 *  `scope === 'global'`, `usePersonalPrior`/`personalRecord` are silently
 *  ignored — no validation error, simply no effect, deliberately kept this
 *  simple rather than over-engineered. */
export async function buildArchetypeSynthesisFactSet(
  db: Db,
  input: BuildArchetypeSynthesisFactSetInput,
): Promise<ArchetypeSynthesisFactSet> {
  const { archetypeId, archetypeName, windowDays, language, scope } = input;
  const window: MetaWindow = { days: windowDays, online: true, bo1: true };

  const rows = await db
    .select({
      id: tournamentStandings.id,
      decklist: tournamentStandings.decklist,
      wins: tournamentStandings.wins,
      losses: tournamentStandings.losses,
      ties: tournamentStandings.ties,
      placing: tournamentStandings.placing,
      totalPlayers: tournaments.players,
      matchResults: tournamentStandings.matchResults,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(
      and(
        eq(tournamentStandings.archetypeId, archetypeId),
        gte(tournaments.players, DEFAULT_MIN_TOURNAMENT_PLAYERS),
        ...windowConditions(window),
      ),
    )
    // Stable row order for logs/debugging; clusterDecklists sorts canonically itself.
    .orderBy(asc(tournamentStandings.id));

  const clusterable: ClusterableStanding[] = rows
    .filter((r): r is typeof r & { decklist: TournamentDecklist } => r.decklist !== null)
    .map((r) => ({
      id: r.id,
      decklist: r.decklist,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      placing: r.placing,
      totalPlayers: r.totalPlayers,
      matchResults: r.matchResults ?? [],
    }));

  const rankedClusters = rankClusters(clusterDecklists(clusterable));

  // Spec 10 Slice D: real field-reweighting, only for scope:'local' with a
  // non-empty localField — everything else keeps the unconditional
  // Wilson-lower-bound ranking from rankClusters() above unchanged.
  let finalClusters = rankedClusters;
  if (scope === 'local' && input.localField && input.localField.length > 0) {
    const field: ArchetypeShare[] = input.localField.map((f) => ({
      archetypeId: f.archetypeId,
      archetypeName: f.name,
      sharePct: f.weight,
    }));
    const fieldScores = computeClusterFieldScores(rankedClusters, field);
    finalClusters = reorderClustersByFieldScore(rankedClusters, fieldScores);
  }
  const facts = factsFromClusterRanking(finalClusters);

  const topCluster = rankedClusters[0];
  if (scope === 'local' && input.usePersonalPrior && input.personalRecord && topCluster) {
    const blend = blendWithPersonalPrior(topCluster.winRateLowerBoundPct, input.personalRecord);
    facts.push(...factsFromPersonalPriorBlend(archetypeName, blend));
  }

  const context: ArchetypeSynthesisContext = {
    archetypeId,
    archetypeName: sanitizeFactLabel(archetypeName),
    windowDays,
    language,
    scope,
  };

  return { facts: selectFacts(facts), context, rankedClusters: finalClusters };
}
