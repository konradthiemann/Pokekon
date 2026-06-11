import { useState } from 'react';
import { resolveArchetypeSprites, SPRITE_BASE } from './pokemonSprites';

// ─── Component ────────────────────────────────────────────────────────────────

const SIZE_PX: Record<'sm' | 'md', number> = { sm: 24, md: 40 };

function SpriteImg({ name, px }: { name: string; px: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`${SPRITE_BASE}/${name}.png`}
      alt=""
      width={px}
      height={px}
      className="object-contain shrink-0"
      onError={() => setFailed(true)}
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
        <circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" />
        <path d="M2 12h20" stroke="#6b7280" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="#6b7280" />
      </svg>
    </span>
  );
}

interface PokemonIconProps {
  /** Archetype display name or kebab slug. Apostrophe variants handled automatically. */
  archetype: string;
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
  size = 'sm',
  dual = false,
  reserveSecondary = false,
  className = '',
}: PokemonIconProps) {
  const px = SIZE_PX[size];
  const pair = resolveArchetypeSprites(archetype);

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
      <SpriteImg name={primary} px={px} />
      {dual && secondary && <SpriteImg name={secondary} px={px} />}
      {dual && !secondary && reserveSecondary && (
        <span style={{ width: px, height: px, display: 'inline-block' }} />
      )}
    </span>
  );
}
