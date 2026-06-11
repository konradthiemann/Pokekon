import { useState } from 'react';

const SPRITE_BASE = 'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular';

type Pair = [string, string?];

// ─── Explicit archetype → sprite map ─────────────────────────────────────────
// Use this for cases the auto-builder can't infer:
//   • Mega decks where the Mega form isn't the first/only word
//   • Box decks with a secondary Pokémon not in the name
//   • Ogerpon forms that differ from the default teal-mask
const ARCHETYPE_SPRITES: Record<string, Pair> = {
  // Dragapult
  'Dragapult ex':           ['dragapult'],
  'Dragapult':              ['dragapult'],
  'Dragapult Blaziken':     ['dragapult',          'blaziken'],
  'Dragapult Dusknoir':     ['dragapult',          'dusknoir'],
  // Zoroark
  "N's Zoroark ex":         ['zoroark'],
  "N's Zoroark":            ['zoroark'],
  // Lucario
  'Mega Lucario':           ['lucario-mega'],
  // Absol — the Box deck's second Pokémon is Kangaskhan, not derivable from the name
  'Mega Absol':             ['absol-mega'],
  'Mega Absol Box':         ['absol-mega',         'kangaskhan-mega'],
  // Starmie
  'Mega Starmie':           ['starmie-mega'],
  // Lopunny — mega form used but not marked "Mega" in deck name
  'Lopunny Dudunsparce':    ['lopunny-mega',       'dudunsparce'],
  // Diancie — same pattern
  'Diancie Dusknoir':       ['diancie-mega',       'dusknoir'],
  // Ogerpon box: two different Ogerpon forms
  'Ogerpon Box':            ['ogerpon-teal-mask',  'ogerpon-wellspring-mask'],
  // Other paired decks (auto-builder handles Ogerpon via POKEMON_FORM below)
  'Flareon Noctowl':        ['flareon',            'noctowl'],
  'Festival Lead':          ['ogerpon-teal-mask'],
  // Possessives
  "Cynthia's Garchomp ex":  ['garchomp'],
  "Cynthia's Garchomp":     ['garchomp'],
  "Rocket's Mewtwo":        ['mewtwo'],
  "Rocket's Honchkrow":     ['honchkrow'],
  "Steven's Metagross":     ['metagross'],
  // Misc single-Pokémon
  'Slowking':               ['slowking-galar'],
  'Mega Venusaur':          ['venusaur-mega'],
};

// Kebab slugs from MatchupMatrix CSV / Limitless API
const SLUG_SPRITES: Record<string, Pair> = {
  // ── Still-legal originals ────────────────────────────────────────────────
  'alakazam-dudunsparce':   ['alakazam',            'dudunsparce'],
  'archaludon-zoroark':     ['archaludon',          'zoroark'],
  'clefairy-ogerpon':       ['clefairy',            'ogerpon-teal-mask'],
  'cynthias-garchomp':      ['garchomp'],
  'diancie-dusknoir':       ['diancie-mega',        'dusknoir'],
  'dragapult-blaziken':     ['dragapult',            'blaziken'],
  'dragapult-dusknoir':     ['dragapult',            'dusknoir'],
  'dragapult-ex':           ['dragapult'],
  'ethanss-typhlosion':     ['typhlosion'],
  'festival-lead':          ['ogerpon-teal-mask'],
  'flareon-noctowl':        ['flareon',             'noctowl'],
  'froslass-munkidori':     ['froslass',            'munkidori'],
  'grimmsnarl-froslass':    ['grimmsnarl',          'froslass'],
  'hops-trevenant':         ['trevenant'],
  'hops-zacian':            ['zacian'],
  'hydrapple-ogerpon':      ['hydrapple',           'ogerpon-teal-mask'],
  'jellicent-dusknoir':     ['jellicent',           'dusknoir'],
  'kangaskhan-bouffalant':  ['kangaskhan',          'bouffalant'],
  'lopunny-dudunsparce':    ['lopunny-mega',        'dudunsparce'],
  'lucario-hariyama':       ['lucario',             'hariyama'],
  'marnie-grimmsnarl':      ['grimmsnarl'],
  'mega-absol-box':         ['absol-mega',          'kangaskhan-mega'],
  'mega-charizard-x':       ['charizard-mega-x'],
  'mega-dragonite':         ['dragonite'],
  'mega-lucario':           ['lucario-mega'],
  'mega-starmie':           ['starmie-mega'],
  'mega-venusaur':          ['venusaur-mega'],
  'n-zoroark':              ['zoroark'],
  'ogerpon-box':            ['ogerpon-teal-mask',   'ogerpon-wellspring-mask'],
  'ogerpon-meganium':       ['ogerpon-teal-mask',   'meganium'],
  'okidogi-barbaracle':     ['okidogi',             'barbaracle'],
  'raging-bolt-ogerpon':    ['raging-bolt',         'ogerpon-teal-mask'],
  'rocket-mewtwo-ex':       ['mewtwo'],
  'rockets-honchkrow':      ['honchkrow'],
  'rockets-spidops':        ['spidops'],
  'starmie-froslass':       ['starmie',             'froslass'],
  'stevens-metagross':      ['metagross'],
  'tera-box':               ['terapagos'],
  'ursaluna-lunatone':      ['ursaluna-bloodmoon',  'lunatone'],
  'zygarde-barbaracle':     ['zygarde',             'barbaracle'],
  // ── Rotated (G-regulation, kept for backwards-compat with saved decks) ───
  'gardevoir-ex-sv':        ['gardevoir'],
  'gholdengo-lunatone':     ['gholdengo',           'lunatone'],
};

// ─── Auto-builder ─────────────────────────────────────────────────────────────
// Overrides for Pokémon whose competitive sprite filename differs from their name.
const POKEMON_FORM: Record<string, string> = {
  'ogerpon': 'ogerpon-teal-mask',    // always teal-mask in competitive play
  'zoroark': 'zoroark',              // Hisuian, but filename in this repo is just "zoroark"
  'slowking': 'slowking-galar',      // only Galarian is competitively relevant
};

function pokemonToSprite(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return POKEMON_FORM[lower] ?? lower;
}

/**
 * Derives a sprite pair from an archetype name when no explicit entry exists.
 *
 * Rules (applied in order):
 *  1. Possessive ("N's Zoroark ex") → second word only (the Pokémon)
 *  2. "Mega X [Y]"                  → x-mega primary, Y secondary if present
 *  3. Two words "X Y"               → X primary, Y secondary
 *  4. One word                      → X primary
 *  5. Three+ words                  → first + last as the two featured Pokémon
 *
 * Ogerpon is remapped to ogerpon-teal-mask via POKEMON_FORM.
 *
 * Test: "Archaludon Zoroark" → ['archaludon', 'zoroark'] ✓
 */
function autoBuild(archetype: string): Pair | undefined {
  const text = archetype
    .replace(/[''ʼʹ]/g, "'")
    .replace(/\s+ex\s*$/i,  '')
    .replace(/\s+box\s*$/i, '')
    .trim();

  // Possessive: "X's Y" → Y only
  const pos = text.match(/^.+?'s\s+(.+)$/i);
  if (pos) return [pokemonToSprite(pos[1].split(/\s+/)[0])];

  const words = text.split(/\s+/).filter(Boolean);

  if (words[0]?.toLowerCase() === 'mega' && words.length >= 2) {
    const primary   = `${words[1].toLowerCase()}-mega`;
    const secondary = words[2] ? pokemonToSprite(words[2]) : undefined;
    return secondary ? [primary, secondary] : [primary];
  }

  if (words.length === 2) return [pokemonToSprite(words[0]), pokemonToSprite(words[1])];
  if (words.length === 1) return [pokemonToSprite(words[0])];
  if (words.length >= 3)  return [pokemonToSprite(words[0]), pokemonToSprite(words[words.length - 1])];

  return undefined;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────
// Normalises Unicode apostrophes before lookup so a single map entry handles
// all variants the Limitless API might return (U+2019, U+02BC, …).
function resolve(archetype: string): Pair | undefined {
  if (ARCHETYPE_SPRITES[archetype]) return ARCHETYPE_SPRITES[archetype];
  if (SLUG_SPRITES[archetype])      return SLUG_SPRITES[archetype];
  const norm = archetype.replace(/[''ʼʹ]/g, "'");
  return ARCHETYPE_SPRITES[norm] ?? SLUG_SPRITES[norm] ?? autoBuild(archetype);
}

export { resolve as resolveArchetypeSprites, SPRITE_BASE };

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
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: px, height: px }} aria-hidden="true">
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

export function PokemonIcon({ archetype, size = 'sm', dual = false, reserveSecondary = false, className = '' }: PokemonIconProps) {
  const px   = SIZE_PX[size];
  const pair = resolve(archetype);

  if (!pair) {
    return (
      <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
        <Pokeball px={px} />
        {dual && reserveSecondary && <span style={{ width: px, height: px, display: 'inline-block' }} />}
      </span>
    );
  }

  const [primary, secondary] = pair;

  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
      <SpriteImg name={primary} px={px} />
      {dual && secondary && <SpriteImg name={secondary} px={px} />}
      {dual && !secondary && reserveSecondary && <span style={{ width: px, height: px, display: 'inline-block' }} />}
    </span>
  );
}
