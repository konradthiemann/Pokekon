import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Trophy, Wand2 } from 'lucide-react';
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
import { useDashboardStore } from '../../store/dashboardStore';
import {
  getLocalMetaWeightOverrides,
  migrateLocalMetaField,
  setLocalMetaWeightOverrides,
  type LocalFieldEntry,
} from '../../lib/preferences';
import { PokemonIcon } from '../shared/PokemonIcon';
import { QuantityStepper } from '../shared/QuantityStepper';
import { formatWithInterval } from './confidence';
import { DecklistCard } from './DecklistCard';
import { FieldScorePanel } from './FieldScorePanel';
import { ListFieldPerformance } from './ListFieldPerformance';
import { ThreatsPanel } from './ThreatsPanel';

interface PredictionPanelProps {
  /** Current online meta — the option source for the picker and the seed. */
  archetypes: FieldAnalysisArchetype[];
  /** Active meta window — the matchup matrix and per-deck lists respect it. */
  window: MetaWindow;
}

/** Round a share to a readable seed weight (min 1 so nothing drops to zero). */
const seedWeight = (sharePct: number): number => Math.max(1, Math.round(sharePct));

/**
 * Local-meta prediction. `LocalMetaPanel` (rendered alongside this panel,
 * inside the same merged CollapsibleSection — Spec 10 Slice D/F) owns WHICH
 * archetypes are in the local field via the shared `localMeta` store slice;
 * this panel only adds a per-archetype WEIGHT on top (defaulting to the
 * online meta share, overridable per entry) and runs the SAME meta-weighted
 * field score (`computeFieldScores` from @pokekon/shared) over those custom
 * shares. Pure client-side arithmetic over the fetched matchup matrix, no
 * server round-trip.
 *
 * Before Slice D this panel kept a SECOND, independent archetype list
 * (`tcg-local-meta-field-v1`) with its own weights — two places to manage
 * one thing. `migrateLocalMetaField()` folds any such legacy data into the
 * shared list + the (now much smaller) per-entry weight-override map, once,
 * on mount.
 */
export function PredictionPanel({ archetypes, window }: PredictionPanelProps) {
  const { t } = useTranslation('meta');
  const { days, online, bo1 } = window;
  const { localMeta, setLocalMeta } = useDashboardStore();
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>(() =>
    getLocalMetaWeightOverrides(),
  );
  const [matchups, setMatchups] = useState<{
    rows: MatchupRow[];
    importedAt: string | null;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);

  // One-time migration off the legacy, duplicated field key (Spec 10 Slice
  // D). Adjust-state-during-render (same pattern as DeckPage.tsx's
  // DeckSettingsWidget), not a useEffect: this only touches this
  // component's own state plus store/localStorage writes, and
  // migrateLocalMetaField() is itself idempotent (a second call — e.g. React
  // Strict Mode's double-render — returns null), so running it during render
  // is safe.
  const [migratedLegacyField, setMigratedLegacyField] = useState(false);
  if (!migratedLegacyField) {
    setMigratedLegacyField(true);
    const migrated = migrateLocalMetaField();
    if (migrated) {
      const namesToAdd = migrated.names.filter((n) => !localMeta.includes(n));
      if (namesToAdd.length > 0) setLocalMeta([...localMeta, ...namesToAdd]);
      const nextOverrides = { ...migrated.overrides, ...weightOverrides };
      setWeightOverrides(nextOverrides);
      setLocalMetaWeightOverrides(nextOverrides);
    }
  }

  // Data-driven icons (from the online meta) for the drill-down opponents.
  const iconsById: Record<string, string[]> = {};
  for (const a of archetypes) if (a.icons?.length) iconsById[a.archetypeId] = a.icons;

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

  // The field, derived: one entry per shared localMeta archetype, weighted
  // by its stored override or (default) its current online meta share.
  const field: LocalFieldEntry[] = useMemo(
    () =>
      localMeta.map((name) => {
        const online = archetypes.find((a) => a.archetypeName === name);
        const archetypeId = online?.archetypeId ?? name;
        const defaultWeight = online ? seedWeight(online.sharePct) : 1;
        return { archetypeId, name, weight: weightOverrides[archetypeId] ?? defaultWeight };
      }),
    [localMeta, archetypes, weightOverrides],
  );

  const seedFromOnline = () => {
    setLocalMeta(archetypes.map((a) => a.archetypeName));
    setWeightOverrides({});
    setLocalMetaWeightOverrides({});
    setSelectedId(null);
  };

  const setWeight = (id: string, weight: number) => {
    const next = {
      ...weightOverrides,
      [id]: Number.isFinite(weight) ? Math.max(0, weight) : 0,
    };
    setWeightOverrides(next);
    setLocalMetaWeightOverrides(next);
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
  // scores is already sorted by field win rate → scores[0] is the best-positioned.
  const best = scores[0] ?? null;

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

      {/* Weight editor — WHICH archetypes are here comes from LocalMetaPanel
          above (shared `localMeta`); this only adjusts each one's weight.
          No inner collapse toggle anymore — the outer CollapsibleSection
          (MetaPage) that wraps this whole merged section already owns that. */}
      <div className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="card-header mb-0">
            {t('prediction.fieldCount', { count: field.length })}
          </span>
          <button
            onClick={seedFromOnline}
            className="btn-ghost text-xs"
            disabled={archetypes.length === 0}
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('prediction.seed')}
          </button>
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
                  <QuantityStepper
                    value={e.weight}
                    onChange={(w) => setWeight(e.archetypeId, w)}
                    min={0}
                    max={99}
                    ariaLabel={t('prediction.weightLabel', { archetype: e.name })}
                  />
                </div>
              );
            })}
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
          {selected && (
            <>
              {/* Perspective picker — choose which deck to evaluate against the
                  field. Replaces the old count-ordered "ranking"; the dropdown is
                  ordered by field score and shows each deck's field WR, so the
                  best-positioned deck stays obvious without a noisy list. */}
              <div className="card space-y-2 p-3">
                {best && best.fieldWinRatePct !== null && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Trophy className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                    {t('prediction.bestPositionedInterval', {
                      deck: best.archetypeName,
                      range: formatWithInterval(
                        best.fieldWinRatePct,
                        best.fieldWinRateLowPct,
                        best.fieldWinRateHighPct,
                      ),
                    })}
                  </p>
                )}
                <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                  {t('prediction.perspective')}
                  <select
                    value={selected.archetypeId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="input max-w-xs flex-1 px-2 py-1.5 text-xs"
                  >
                    {scores.map((s) => (
                      <option key={s.archetypeId} value={s.archetypeId}>
                        {s.archetypeName}
                        {s.fieldWinRatePct !== null ? ` · ${s.fieldWinRatePct.toFixed(1)}%` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
                  <>
                    <p className="text-[11px] text-slate-500">{t('prediction.listsSelectHint')}</p>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {lists.map((entry) => {
                        // First list is open by default; -1 = user collapsed all.
                        const isOpen = (expandedListId ?? lists[0]?.id) === entry.id;
                        return (
                          <div key={entry.id} className="space-y-2">
                            <DecklistCard entry={entry} />
                            <button
                              type="button"
                              onClick={() => setExpandedListId(isOpen ? -1 : entry.id)}
                              aria-expanded={isOpen}
                              className="flex w-full items-center gap-1.5 text-[11px] font-semibold text-brand-700 hover:text-brand-800"
                            >
                              <ChevronRight
                                className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                aria-hidden="true"
                              />
                              {t('prediction.listWhy')}
                            </button>
                            {isOpen && (
                              <div className="card p-3">
                                <ListFieldPerformance
                                  matchResults={entry.matchResults}
                                  field={field}
                                  iconsById={iconsById}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
