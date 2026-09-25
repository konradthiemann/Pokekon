import type { KnownArchetype } from '../../constants/archetypes';
import type { Deck } from '../../types';
import type { FieldAnalysisArchetype } from '../api';

/** Display name for an archetype slug: curated list → current field analysis →
 *  an own deck → the slug itself (never empty for a non-empty slug). */
export function archetypeDisplayName(
  slug: string,
  sources: {
    known: readonly Pick<KnownArchetype, 'slug' | 'name'>[];
    field: readonly Pick<FieldAnalysisArchetype, 'archetypeId' | 'archetypeName'>[];
    decks: readonly Pick<Deck, 'archetype' | 'archetypeName'>[];
  },
): string {
  return (
    sources.known.find((k) => k.slug === slug)?.name ??
    sources.field.find((f) => f.archetypeId === slug)?.archetypeName ??
    sources.decks.find((d) => d.archetype === slug)?.archetypeName ??
    slug
  );
}
