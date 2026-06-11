/** Thin localStorage wrapper for user preferences (no DB migration needed). */

const KEYS = {
  localMeta: 'tcg-local-meta-v1',
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
