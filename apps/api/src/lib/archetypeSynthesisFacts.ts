import { and, eq, gte } from 'drizzle-orm';
import {
  blendWithPersonalPrior,
  clusterDecklists,
  DEFAULT_MIN_TOURNAMENT_PLAYERS,
  factsFromClusterRanking,
  factsFromPersonalPriorBlend,
  rankClusters,
  sanitizeFactLabel,
  selectFacts,
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
 *  KNOWN, DOCUMENTED LIMITATION (Spec 10 Slice C MVP, see
 *  ArchetypeSynthesisScope's doc comment in packages/shared): `scope` is
 *  threaded through to `context` for the prompt framing only. Both 'global'
 *  and 'local' currently read and rank the EXACT SAME standings — real
 *  field-reweighting for 'local' is Slice D's job (it needs a
 *  per-opponent-archetype breakdown per cluster, which Slice B does not
 *  carry today). Not a silent gap: documented here, in the shared package,
 *  and in the Slice C PR description.
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
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(
      and(
        eq(tournamentStandings.archetypeId, archetypeId),
        gte(tournaments.players, DEFAULT_MIN_TOURNAMENT_PLAYERS),
        ...windowConditions(window),
      ),
    );

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
    }));

  const rankedClusters = rankClusters(clusterDecklists(clusterable));
  const facts = factsFromClusterRanking(rankedClusters);

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

  return { facts: selectFacts(facts), context, rankedClusters };
}
