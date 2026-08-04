import { useTranslation } from 'react-i18next';
import type { StandingMatchResult } from '@pokekon/shared';
import { PokemonIcon } from '../shared/PokemonIcon';

/**
 * Shows how ONE decklist actually performed against the decks in the user's local
 * field: its real game-by-game results (from the tournament round pairings),
 * filtered to the field archetypes, grouped by opponent with a W-L record and
 * per-game chips highlighted like the match log (green win / red loss). This is
 * the evidence that a suggested list genuinely has an edge vs the field — not a
 * guess. Empty until the tournament's pairings have been synced.
 */
export function ListFieldPerformance({
  matchResults,
  field,
  iconsById,
}: {
  matchResults: StandingMatchResult[];
  field: { archetypeId: string; name: string }[];
  iconsById: Record<string, string[]>;
}) {
  const { t } = useTranslation('meta');
  const fieldIds = new Set(field.map((f) => f.archetypeId));
  const nameById = new Map(field.map((f) => [f.archetypeId, f.name]));

  const byOpp = new Map<string, StandingMatchResult[]>();
  for (const m of matchResults) {
    if (!fieldIds.has(m.opponentArchetypeId)) continue;
    const list = byOpp.get(m.opponentArchetypeId) ?? [];
    list.push(m);
    byOpp.set(m.opponentArchetypeId, list);
  }

  const rows = [...byOpp.entries()]
    .map(([id, games]) => ({
      id,
      name: nameById.get(id) ?? id,
      games: [...games].sort((a, b) => a.round - b.round),
      w: games.filter((g) => g.result === 'W').length,
      l: games.filter((g) => g.result === 'L').length,
      ti: games.filter((g) => g.result === 'T').length,
    }))
    // Best matchups first (largest win margin), so an edge is obvious at a glance.
    .sort((a, b) => b.w - b.l - (a.w - a.l));

  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">{t('prediction.noFieldGames')}</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <PokemonIcon archetype={r.name} icons={iconsById[r.id]} size="sm" dual />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
            {r.name}
          </span>
          <span
            className={`font-mono text-xs font-bold tabular-nums ${
              r.w > r.l ? 'text-emerald-700' : r.w < r.l ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            {r.w}-{r.l}
            {r.ti ? `-${r.ti}` : ''}
          </span>
          <span className="flex flex-wrap justify-end gap-0.5">
            {r.games.map((g, i) => (
              <span
                key={i}
                title={t('prediction.gameVs', { round: g.round })}
                className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${
                  g.result === 'W'
                    ? 'bg-emerald-100 text-emerald-800'
                    : g.result === 'L'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {g.result}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
