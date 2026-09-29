// Pure logic of the coach Opponents page (Spec 7 §5.5).
import {
  computeFieldScores,
  type ArchetypeShare,
  type FieldScore,
  type MatchupCell,
} from '@pokekon/shared';

/**
 * Field score of the coached archetype against a (local) field. If the
 * archetype is not part of the field it joins as a subject with share 0, so it
 * is scored without changing anyone else's weights. Null for an empty field or
 * when no matchup covers any opponent.
 */
export function ownFieldScore(
  archetypeId: string,
  archetypeName: string,
  field: readonly ArchetypeShare[],
  matchups: readonly MatchupCell[],
): FieldScore | null {
  if (field.length === 0) return null;
  const shares = field.some((f) => f.archetypeId === archetypeId)
    ? [...field]
    : [...field, { archetypeId, archetypeName, sharePct: 0 }];
  const own = computeFieldScores(shares, [...matchups]).find((s) => s.archetypeId === archetypeId);
  return own && own.fieldWinRatePct !== null ? own : null;
}
