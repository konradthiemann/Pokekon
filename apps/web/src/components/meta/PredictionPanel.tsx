import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Plus, Trophy, Wand2, X } from 'lucide-react';
import {
  computeFieldScores,
  type ArchetypeShare,
  type FieldScore,
  type MatchupRow,
} from '@pokekon/shared';
import {
  getArchetypeLists,
  getMetaMatchups,
  type ArchetypeListEntry,
  type FieldAnalysisArchetype,
  type MetaWindow,
} from '../../lib/api';
import { getLocalMetaField, setLocalMetaField, type LocalFieldEntry } from '../../lib/preferences';
import { PokemonIcon } from '../shared/PokemonIcon';
import { DecklistCard } from './DecklistCard';
import { FieldScorePanel } from './FieldScorePanel';
import { ThreatsPanel } from './ThreatsPanel';
import { winRateColorClass } from './winRateColor';

interface PredictionPanelProps {
  /** Current online meta — the option source for the picker and the seed. */
  archetypes: FieldAnalysisArchetype[];
  /** Active meta window — the matchup matrix and per-deck lists respect it. */
  window: MetaWindow;
}

/** Round a share to a readable seed weight (min 1 so nothing drops to zero). */
const seedWeight = (sharePct: number): number => Math.max(1, Math.round(sharePct));

/**
 * Local-meta prediction. The user assembles the field they expect at their
 * local (Bo1) event — seedable from the online meta, since "online Bo1 ≈ local
 * Bo1" is the whole premise — and this runs the SAME meta-weighted field score
 * (`computeFieldScores` from @pokekon/shared) over those custom shares. Pure
 * client-side arithmetic over the fetched matchup matrix, no server round-trip;
 * the field persists in localStorage like the existing local-meta list.
 */
export function PredictionPanel({ archetypes, window }: PredictionPanelProps) {
  const { t } = useTranslation('meta');
  const { days, online, bo1 } = window;
  const [field, setField] = useState<LocalFieldEntry[]>(() => getLocalMetaField());
  const [matchups, setMatchups] = useState<{
    rows: MatchupRow[];
    importedAt: string | null;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');

  // Real online-Bo1 matchup matrix for the active window (with TrainerHill
  // fallback), the same source the field analysis uses — so the prediction and
  // the meta table agree. Refetches when the window changes.
  useEffect(() => {
    let cancelled = false;
    getMetaMatchups({ days, online, bo1 })
      .then(
        (m) =>
          !cancelled &&
          setMatchups({ rows: m.rows, importedAt: m.matchupSource.trainerHillImportedAt }),
      )
      .catch(() => !cancelled && setMatchups({ rows: [], importedAt: null }));
    return () => {
      cancelled = true;
    };
  }, [days, online, bo1]);

  // Persist on every change (mirrors the existing local-meta behaviour).
  const update = (next: LocalFieldEntry[]) => {
    setField(next);
    setLocalMetaField(next);
  };

  const inField = new Set(field.map((e) => e.archetypeId));
  const options = archetypes.filter((a) => !inField.has(a.archetypeId));

  const seedFromOnline = () => {
    update(
      archetypes.map((a) => ({
        archetypeId: a.archetypeId,
        name: a.archetypeName,
        weight: seedWeight(a.sharePct),
      })),
    );
    setSelectedId(null);
  };

  const addArchetype = (id: string) => {
    const a = archetypes.find((x) => x.archetypeId === id);
    if (!a || inField.has(id)) return;
    update([
      ...field,
      { archetypeId: a.archetypeId, name: a.archetypeName, weight: seedWeight(a.sharePct) },
    ]);
    setToAdd('');
  };

  const setWeight = (id: string, weight: number) =>
    update(
      field.map((e) =>
        e.archetypeId === id
          ? { ...e, weight: Number.isFinite(weight) ? Math.max(0, weight) : 0 }
          : e,
      ),
    );

  const remove = (id: string) => {
    update(field.filter((e) => e.archetypeId !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const clear = () => {
    update([]);
    setSelectedId(null);
  };

  const totalWeight = field.reduce((sum, e) => sum + e.weight, 0);

  // The prediction: field win rate for every deck in the local field, computed
  // over the user's shares with the same engine as the online field analysis.
  const scores = useMemo<FieldScore[]>(() => {
    if (matchups === null || totalWeight <= 0) return [];
    const shares: ArchetypeShare[] = field.map((e) => ({
      archetypeId: e.archetypeId,
      archetypeName: e.name,
      sharePct: (e.weight / totalWeight) * 100,
    }));
    return computeFieldScores(shares, matchups.rows);
  }, [field, totalWeight, matchups]);

  const selected = scores.find((s) => s.archetypeId === selectedId) ?? scores[0] ?? null;

  // The selected deck's most successful tournament lists (build templates vs the
  // field). Keyed by deck+window so a stale deck's lists never flash; all setState
  // happens in the async resolution (no sync setState in the effect body).
  const [listsState, setListsState] = useState<{ key: string; lists: ArchetypeListEntry[] } | null>(
    null,
  );
  const selId = selected?.archetypeId ?? null;
  const listsKey = selId ? `${selId}|${days}|${online}|${bo1}` : '';
  useEffect(() => {
    if (!selId) return;
    let cancelled = false;
    const key = `${selId}|${days}|${online}|${bo1}`;
    getArchetypeLists(selId, { days, online, bo1, limit: 3, offset: 0 })
      .then((r) => {
        if (!cancelled) setListsState({ key, lists: r.lists });
      })
      .catch(() => {
        if (!cancelled) setListsState({ key, lists: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [selId, days, online, bo1]);
  const lists = listsState?.key === listsKey ? listsState.lists : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('prediction.intro')}</p>

      {/* Field editor */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-header flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-brand-700" aria-hidden="true" />
            {t('prediction.fieldTitle')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={seedFromOnline}
              className="btn-ghost text-xs"
              disabled={archetypes.length === 0}
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('prediction.seed')}
            </button>
            {field.length > 0 && (
              <button onClick={clear} className="btn-ghost text-xs text-red-700">
                {t('prediction.clear')}
              </button>
            )}
          </div>
        </div>

        {field.length === 0 ? (
          <p className="text-xs text-slate-500">{t('prediction.empty')}</p>
        ) : (
          <div className="space-y-1.5">
            {field.map((e) => {
              const sharePct = totalWeight > 0 ? (e.weight / totalWeight) * 100 : 0;
              return (
                <div key={e.archetypeId} className="flex items-center gap-2">
                  <PokemonIcon archetype={e.name} size="sm" dual />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                    {e.name}
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                    {sharePct.toFixed(1)}%
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={e.weight}
                    onChange={(ev) => setWeight(e.archetypeId, Number(ev.target.value))}
                    className="input w-16 px-2 py-1 text-right text-xs tabular-nums"
                    aria-label={t('prediction.weightLabel', { archetype: e.name })}
                  />
                  <button
                    onClick={() => remove(e.archetypeId)}
                    className="shrink-0 text-slate-400 transition-colors hover:text-red-600"
                    aria-label={t('prediction.remove', { archetype: e.name })}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {options.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <select
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              className="input flex-1 px-2 py-1.5 text-xs"
              aria-label={t('prediction.addPlaceholder')}
            >
              <option value="">{t('prediction.addPlaceholder')}</option>
              {options.map((a) => (
                <option key={a.archetypeId} value={a.archetypeId}>
                  {a.archetypeName}
                </option>
              ))}
            </select>
            <button
              onClick={() => toAdd && addArchetype(toAdd)}
              disabled={!toAdd}
              className="btn-ghost text-xs disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('prediction.add')}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {field.length === 0 ? null : matchups === null ? (
        <p className="py-6 text-center text-xs text-slate-500">{t('prediction.loading')}</p>
      ) : scores.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">{t('prediction.noResult')}</p>
      ) : (
        <div className="space-y-4">
          <div className="card space-y-2 p-4">
            <h3 className="card-header flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-600" aria-hidden="true" />
              {t('prediction.rankingTitle')}
            </h3>
            <p className="text-xs text-slate-500">{t('prediction.rankingHint')}</p>
            <div className="space-y-1">
              {scores.map((s) => {
                const isSel = selected?.archetypeId === s.archetypeId;
                return (
                  <button
                    key={s.archetypeId}
                    onClick={() => setSelectedId(s.archetypeId)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      isSel ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-5 text-center text-xs font-bold tabular-nums text-brand-700">
                      {s.rank}
                    </span>
                    <PokemonIcon archetype={s.archetypeName} size="sm" dual />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                      {s.archetypeName}
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-400">
                      {t('prediction.coverage', { pct: s.coveragePct })}
                    </span>
                    <span
                      className={`w-14 text-right text-sm font-bold tabular-nums ${
                        s.fieldWinRatePct !== null
                          ? winRateColorClass(s.fieldWinRatePct)
                          : 'text-slate-400'
                      }`}
                    >
                      {s.fieldWinRatePct !== null ? `${s.fieldWinRatePct.toFixed(1)}%` : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FieldScorePanel
                  fieldScore={selected}
                  totalRanked={scores.length}
                  matchupImportedAt={matchups.importedAt}
                />
                <ThreatsPanel fieldScore={selected} />
              </div>

              {/* Build templates: the selected deck's most successful tournament lists */}
              <div className="space-y-2">
                <h3 className="card-header mb-0 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  {t('prediction.listsTitle', { deck: selected.archetypeName })}
                </h3>
                <p className="text-xs text-slate-500">{t('prediction.listsHint')}</p>
                {lists === null ? (
                  <p className="py-4 text-center text-xs text-slate-500">
                    {t('prediction.loading')}
                  </p>
                ) : lists.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">
                    {t('prediction.listsEmpty')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {lists.map((entry) => (
                      <DecklistCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
