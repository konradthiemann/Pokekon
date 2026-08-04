import { useState } from 'react';
import { resolveArchetypeSprites, SPRITE_BASES } from './pokemonSprites';

type Pair = [string, string?];

// ─── Component ────────────────────────────────────────────────────────────────

const SIZE_PX: Record<'sm' | 'md', number> = { sm: 24, md: 40 };

/**
 * Renders one Pokémon sprite, cascading through SPRITE_BASES on load error:
 * Limitless' CDN first (has every current archetype's icons incl. mega/new
 * forms and matches the data-driven deck.icons), then the pokesprite mirror,
 * then nothing (the parent renders a Pokéball only when no slug resolved at all).
 * Callers pass `key={name}` so a new slug remounts and restarts the cascade.
 */
function SpriteImg({ name, px }: { name: string; px: number }) {
  const [baseIdx, setBaseIdx] = useState(0);
  if (baseIdx >= SPRITE_BASES.length) return null;
  return (
    <img
      src={`${SPRITE_BASES[baseIdx]}/${name}.png`}
      alt=""
      width={px}
      height={px}
      className="object-contain shrink-0"
      onError={() => setBaseIdx((i) => i + 1)}
      loading="lazy"
    />
  );
}

function Pokeball({ px }: { px: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: px, height: px }}>
        {/* Fallback glyph (no sprite resolved) — soft slate-400 to sit quietly
            on the light playmat; the archetype name renders alongside it. */}
        <circle cx="12" cy="12" r="10" stroke="#94a3b8" strokeWidth="2" />
        <path d="M2 12h20" stroke="#94a3b8" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="#94a3b8" />
      </svg>
    </span>
  );
}

interface PokemonIconProps {
  /** Archetype display name or kebab slug. Apostrophe variants handled automatically. */
  archetype: string;
  /**
   * Data-driven Pokémon sprite slugs (Limitless `deck.icons`). When present and
   * non-empty, these win over the name-based lookup — so the meta always renders
   * the icons the source actually publishes (fixes wrong/missing archetype icons).
   * The hand-maintained map remains the fallback for locally-typed archetypes.
   */
  icons?: string[];
  /** 'sm' = 24px, 'md' = 40px. Defaults to 'sm'. */
  size?: 'sm' | 'md';
  /** When true, renders the secondary Pokémon sprite alongside the primary. */
  dual?: boolean;
  /**
   * When true (and dual is true), always reserves space for a second icon even if
   * the archetype has only one Pokémon — renders an invisible spacer so all rows
   * have identical width.
   */
  reserveSecondary?: boolean;
  className?: string;
}

export function PokemonIcon({
  archetype,
  icons,
  size = 'sm',
  dual = false,
  reserveSecondary = false,
  className = '',
}: PokemonIconProps) {
  const px = SIZE_PX[size];
  // Data-driven icons (from Limitless) take precedence; fall back to the map.
  // Data-driven icons ARE Limitless deck.icons slugs already (pruned server-side),
  // so use them verbatim — they resolve on the Limitless CDN (first cascade base)
  // directly. Only the name-based fallback needs the pokesprite-form remapping.
  const dataPair: Pair | undefined = icons && icons.length > 0 ? [icons[0], icons[1]] : undefined;
  const pair = dataPair ?? resolveArchetypeSprites(archetype);

  if (!pair) {
    return (
      <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
        <Pokeball px={px} />
        {dual && reserveSecondary && (
          <span style={{ width: px, height: px, display: 'inline-block' }} />
        )}
      </span>
    );
  }

  const [primary, secondary] = pair;

  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
      <SpriteImg key={primary} name={primary} px={px} />
      {dual && secondary && <SpriteImg key={secondary} name={secondary} px={px} />}
      {dual && !secondary && reserveSecondary && (
        <span style={{ width: px, height: px, display: 'inline-block' }} />
      )}
    </span>
  );
}
