import { KNOWN_ARCHETYPES, type KnownArchetype } from '../../constants/archetypes';

interface ArchetypePickerProps {
  /** Selected slug ('' = none); controls the native select value. */
  value?: string;
  /** Fires with the chosen archetype (slug + display name). */
  onSelect: (archetype: KnownArchetype) => void;
  /** Extra archetypes to merge in (e.g. live-meta decks not in the known list). */
  extra?: KnownArchetype[];
  /** Placeholder option label (already translated by the caller). */
  placeholder: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * A native `<select>` for choosing a Standard archetype from the canonical list
 * (`KNOWN_ARCHETYPES`) plus any live-meta extras. Deliberately a menu, not a text
 * field: the user can't mistype and doesn't need to know the slug — the two
 * failure modes of the old free-text archetype/slug inputs. Native `<select>` is
 * the most accessible + mobile-friendly control and stays keyboard-searchable.
 */
export function ArchetypePicker({
  value = '',
  onSelect,
  extra = [],
  placeholder,
  ariaLabel,
  className = '',
}: ArchetypePickerProps) {
  // Merge + dedupe by slug, then sort by display name.
  const bySlug = new Map<string, KnownArchetype>();
  for (const a of [...KNOWN_ARCHETYPES, ...extra]) if (!bySlug.has(a.slug)) bySlug.set(a.slug, a);
  const options = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <select
      value={value}
      onChange={(e) => {
        const a = bySlug.get(e.target.value);
        if (a) onSelect(a);
      }}
      className={`input ${className}`}
      aria-label={ariaLabel}
    >
      <option value="">{placeholder}</option>
      {options.map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
