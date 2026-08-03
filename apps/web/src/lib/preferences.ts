/** Thin localStorage wrapper for user preferences (no DB migration needed). */

const KEYS = {
  localMeta: 'tcg-local-meta-v1',
  localMetaField: 'tcg-local-meta-field-v1',
  deckArchSlug: 'tcg-deck-arch-slug-v1',
  activeDeckId: 'tcg-active-deck-id-v3',
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

export function getLocalMetaField(): LocalFieldEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEYS.localMetaField) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is LocalFieldEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as LocalFieldEntry).archetypeId === 'string' &&
        typeof (e as LocalFieldEntry).name === 'string' &&
        typeof (e as LocalFieldEntry).weight === 'number' &&
        Number.isFinite((e as LocalFieldEntry).weight),
    );
  } catch {
    return [];
  }
}

export function setLocalMetaField(field: LocalFieldEntry[]): void {
  localStorage.setItem(KEYS.localMetaField, JSON.stringify(field));
}

export function getDeckArchSlug(): string {
  return localStorage.getItem(KEYS.deckArchSlug) ?? '';
}

export function setDeckArchSlug(slug: string): void {
  localStorage.setItem(KEYS.deckArchSlug, slug);
}

export function getActiveDeckId(): number | null {
  const v = localStorage.getItem(KEYS.activeDeckId);
  return v ? Number(v) : null;
}

export function setActiveDeckId(id: number | null): void {
  if (id === null) localStorage.removeItem(KEYS.activeDeckId);
  else localStorage.setItem(KEYS.activeDeckId, String(id));
}
