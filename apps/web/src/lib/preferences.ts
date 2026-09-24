/** Thin localStorage wrapper for user preferences (no DB migration needed). */

const KEYS = {
  localMeta: 'tcg-local-meta-v1',
  /** Legacy key (Spec 10 Slice D): PredictionPanel used to keep a SECOND,
   *  independent archetype list with its own weights here, duplicating
   *  `localMeta` above. Read only by `migrateLocalMetaField()` below, never
   *  written to again. */
  localMetaField: 'tcg-local-meta-field-v1',
  localMetaWeightOverrides: 'tcg-local-meta-weight-overrides-v1',
  /** Legacy (Spec 7): read by the one-time migration, then cleared. */
  deckArchSlug: 'tcg-deck-arch-slug-v1',
  activeDeckId: 'tcg-active-deck-id-v3',
  bestOfHint: 'tcg-bestof-hint-dismissed-v1',
} as const;

export function getLocalMeta(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.localMeta) ?? '[]');
  } catch {
    return [];
  }
}

export function setLocalMeta(archetypes: string[]): void {
  localStorage.setItem(KEYS.localMeta, JSON.stringify(archetypes));
}

/** One entry of the prediction's local-meta field: an archetype and its expected
 *  weight (normalised to a share at compute time). */
export interface LocalFieldEntry {
  archetypeId: string;
  name: string;
  weight: number;
}

/** Per-archetype weight override, keyed by archetypeId (Spec 10 Slice D).
 *  `LocalMetaPanel`'s `localMeta: string[]` (archetype NAMES) is the single
 *  source of truth for WHICH archetypes are in the local field; this map
 *  only overrides individual weights away from their derived default
 *  (online meta share) — not a second copy of the archetype list itself. */
export function getLocalMetaWeightOverrides(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEYS.localMetaWeightOverrides) ?? '{}');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [id, weight] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof weight === 'number' && Number.isFinite(weight)) out[id] = weight;
    }
    return out;
  } catch {
    return {};
  }
}

export function setLocalMetaWeightOverrides(overrides: Record<string, number>): void {
  localStorage.setItem(KEYS.localMetaWeightOverrides, JSON.stringify(overrides));
}

export interface MigratedLocalMetaField {
  names: string[];
  overrides: Record<string, number>;
}

/** One-time migration off the legacy, duplicated `tcg-local-meta-field-v1`
 *  key (Spec 10 Slice D). Always deletes the legacy key when present (so
 *  this runs at most once per browser, even for malformed legacy data);
 *  returns null when there is nothing usable to migrate, otherwise the
 *  extracted archetype names (to fold into `localMeta`) and per-archetype
 *  weight overrides (to fold into `getLocalMetaWeightOverrides()`'s map). */
export function migrateLocalMetaField(): MigratedLocalMetaField | null {
  const raw = localStorage.getItem(KEYS.localMetaField);
  if (raw === null) return null;
  localStorage.removeItem(KEYS.localMetaField);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const entries = parsed.filter(
      (e): e is LocalFieldEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as LocalFieldEntry).archetypeId === 'string' &&
        typeof (e as LocalFieldEntry).name === 'string' &&
        typeof (e as LocalFieldEntry).weight === 'number' &&
        Number.isFinite((e as LocalFieldEntry).weight),
    );
    if (entries.length === 0) return null;
    return {
      names: entries.map((e) => e.name),
      overrides: Object.fromEntries(entries.map((e) => [e.archetypeId, e.weight])),
    };
  } catch {
    return null;
  }
}

/** Legacy per-browser archetype slug. Since Spec 7 the active archetype lives
 *  server-side (`/api/preferences`); this is only the source of the one-time
 *  migration and is cleared once the migrated value is saved. */
export function readLegacyDeckArchSlug(): string | null {
  try {
    return localStorage.getItem(KEYS.deckArchSlug);
  } catch {
    return null;
  }
}

export function clearLegacyDeckArchSlug(): void {
  try {
    localStorage.removeItem(KEYS.deckArchSlug);
  } catch {
    // blocked storage — nothing to clean up
  }
}

export function getActiveDeckId(): number | null {
  const v = localStorage.getItem(KEYS.activeDeckId);
  return v ? Number(v) : null;
}

export function setActiveDeckId(id: number | null): void {
  if (id === null) localStorage.removeItem(KEYS.activeDeckId);
  else localStorage.setItem(KEYS.activeDeckId, String(id));
}

/** Whether the one-time "this log predates the match-format field" hint
 *  (plan §3.7) has been dismissed — once true, only the "Format unbekannt"
 *  badge itself is shown, never the hint again. */
export function isBestOfHintDismissed(): boolean {
  return localStorage.getItem(KEYS.bestOfHint) !== null;
}

export function dismissBestOfHint(): void {
  localStorage.setItem(KEYS.bestOfHint, '1');
}
