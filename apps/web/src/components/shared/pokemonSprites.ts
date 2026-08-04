// Sprite sources, tried in order until one loads (see SpriteImg cascade).
//  1. Limitless' OWN icon CDN — matches the data-driven `deck.icons` slugs
//     exactly and carries mega/newest forms (excadrill-mega, dipplin, thwackey…)
//     that the pokesprite mirror lacks. This is why data-driven icons "just work"
//     for every current archetype and update automatically as the meta shifts.
//  2. pokesprite mirror — fallback for pokesprite-style slugs in the hand-
//     maintained map (e.g. ogerpon-teal-mask, slowking-galar) that Limitless
//     serves under a plainer name.
// A slug on neither source falls through to the Pokéball glyph.
const SPRITE_BASES = [
  'https://r2.limitlesstcg.net/pokemon/gen9',
  'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular',
] as const;

type Pair = [string, string?];

// ─── Explicit archetype → sprite map ─────────────────────────────────────────
// Use this for cases the auto-builder can't infer:
//   • Mega decks where the Mega form isn't the first/only word
//   • Box decks with a secondary Pokémon not in the name
//   • Ogerpon forms that differ from the default teal-mask
const ARCHETYPE_SPRITES: Record<string, Pair> = {
  // Dragapult
  'Dragapult ex': ['dragapult'],
  Dragapult: ['dragapult'],
  'Dragapult Blaziken': ['dragapult', 'blaziken'],
  'Dragapult Dusknoir': ['dragapult', 'dusknoir'],
  // Zoroark
  "N's Zoroark ex": ['zoroark'],
  "N's Zoroark": ['zoroark'],
  // Lucario
  'Mega Lucario': ['lucario-mega'],
  // Absol — the Box deck's second Pokémon is Kangaskhan, not derivable from the name
  'Mega Absol': ['absol-mega'],
  'Mega Absol Box': ['absol-mega', 'kangaskhan-mega'],
  // Starmie
  'Mega Starmie': ['starmie-mega'],
  // Lopunny — mega form used but not marked "Mega" in deck name
  'Lopunny Dudunsparce': ['lopunny-mega', 'dudunsparce'],
  // Diancie — same pattern
  'Diancie Dusknoir': ['diancie-mega', 'dusknoir'],
  // Ogerpon box: two different Ogerpon forms
  'Ogerpon Box': ['ogerpon-teal-mask', 'ogerpon-wellspring-mask'],
  // Other paired decks (auto-builder handles Ogerpon via POKEMON_FORM below)
  'Flareon Noctowl': ['flareon', 'noctowl'],
  // Festival Lead is a Grass/evolution deck — Limitless icons it as Dipplin + Thwackey
  // (the old ogerpon-teal-mask mapping was wrong). Data-driven deck.icons override this.
  'Festival Lead': ['dipplin', 'thwackey'],
  'Mega Excadrill': ['excadrill-mega'],
  // Possessives
  "Cynthia's Garchomp ex": ['garchomp'],
  "Cynthia's Garchomp": ['garchomp'],
  "Rocket's Mewtwo": ['mewtwo'],
  "Rocket's Honchkrow": ['honchkrow'],
  "Steven's Metagross": ['metagross'],
  // Misc single-Pokémon
  Slowking: ['slowking-galar'],
  'Mega Venusaur': ['venusaur-mega'],
};

// Kebab slugs from MatchupMatrix CSV / Limitless API
const SLUG_SPRITES: Record<string, Pair> = {
  // ── Still-legal originals ────────────────────────────────────────────────
  'alakazam-dudunsparce': ['alakazam', 'dudunsparce'],
  'archaludon-zoroark': ['archaludon', 'zoroark'],
  'clefairy-ogerpon': ['clefairy', 'ogerpon-teal-mask'],
  'cynthias-garchomp': ['garchomp'],
  'diancie-dusknoir': ['diancie-mega', 'dusknoir'],
  'dragapult-blaziken': ['dragapult', 'blaziken'],
  'dragapult-dusknoir': ['dragapult', 'dusknoir'],
  'dragapult-ex': ['dragapult'],
  'ethanss-typhlosion': ['typhlosion'],
  'festival-lead': ['dipplin', 'thwackey'],
  'flareon-noctowl': ['flareon', 'noctowl'],
  'froslass-munkidori': ['froslass', 'munkidori'],
  'grimmsnarl-froslass': ['grimmsnarl', 'froslass'],
  'hops-trevenant': ['trevenant'],
  'hops-zacian': ['zacian'],
  'hydrapple-ogerpon': ['hydrapple', 'ogerpon-teal-mask'],
  'jellicent-dusknoir': ['jellicent', 'dusknoir'],
  'kangaskhan-bouffalant': ['kangaskhan', 'bouffalant'],
  'lopunny-dudunsparce': ['lopunny-mega', 'dudunsparce'],
  'lucario-hariyama': ['lucario', 'hariyama'],
  'marnie-grimmsnarl': ['grimmsnarl'],
  'mega-absol-box': ['absol-mega', 'kangaskhan-mega'],
  'mega-charizard-x': ['charizard-mega-x'],
  'mega-dragonite': ['dragonite'],
  'mega-excadrill': ['excadrill-mega'],
  'mega-lucario': ['lucario-mega'],
  'mega-starmie': ['starmie-mega'],
  'mega-venusaur': ['venusaur-mega'],
  'n-zoroark': ['zoroark'],
  'ogerpon-box': ['ogerpon-teal-mask', 'ogerpon-wellspring-mask'],
  'ogerpon-meganium': ['ogerpon-teal-mask', 'meganium'],
  'okidogi-barbaracle': ['okidogi', 'barbaracle'],
  'raging-bolt-ogerpon': ['raging-bolt', 'ogerpon-teal-mask'],
  'rocket-mewtwo-ex': ['mewtwo'],
  'rockets-honchkrow': ['honchkrow'],
  'rockets-spidops': ['spidops'],
  'starmie-froslass': ['starmie', 'froslass'],
  'stevens-metagross': ['metagross'],
  'tera-box': ['terapagos'],
  'ursaluna-lunatone': ['ursaluna-bloodmoon', 'lunatone'],
  'zygarde-barbaracle': ['zygarde', 'barbaracle'],
  // ── Rotated (G-regulation, kept for backwards-compat with saved decks) ───
  'gardevoir-ex-sv': ['gardevoir'],
  'gholdengo-lunatone': ['gholdengo', 'lunatone'],
};

// ─── Auto-builder ─────────────────────────────────────────────────────────────
// Overrides for Pokémon whose competitive sprite filename differs from their name.
const POKEMON_FORM: Record<string, string> = {
  ogerpon: 'ogerpon-teal-mask', // always teal-mask in competitive play
  zoroark: 'zoroark', // Hisuian, but filename in this repo is just "zoroark"
  slowking: 'slowking-galar', // only Galarian is competitively relevant
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
    .replace(/\s+ex\s*$/i, '')
    .replace(/\s+box\s*$/i, '')
    .trim();

  // Possessive: "X's Y" → Y only
  const pos = text.match(/^.+?'s\s+(.+)$/i);
  if (pos) return [pokemonToSprite(pos[1].split(/\s+/)[0])];

  const words = text.split(/\s+/).filter(Boolean);

  if (words[0]?.toLowerCase() === 'mega' && words.length >= 2) {
    const primary = `${words[1].toLowerCase()}-mega`;
    const secondary = words[2] ? pokemonToSprite(words[2]) : undefined;
    return secondary ? [primary, secondary] : [primary];
  }

  if (words.length === 2) return [pokemonToSprite(words[0]), pokemonToSprite(words[1])];
  if (words.length === 1) return [pokemonToSprite(words[0])];
  if (words.length >= 3)
    return [pokemonToSprite(words[0]), pokemonToSprite(words[words.length - 1])];

  return undefined;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────
// Normalises Unicode apostrophes before lookup so a single map entry handles
// all variants the Limitless API might return (U+2019, U+02BC, …).
function resolve(archetype: string): Pair | undefined {
  if (ARCHETYPE_SPRITES[archetype]) return ARCHETYPE_SPRITES[archetype];
  if (SLUG_SPRITES[archetype]) return SLUG_SPRITES[archetype];
  const norm = archetype.replace(/[''ʼʹ]/g, "'");
  return ARCHETYPE_SPRITES[norm] ?? SLUG_SPRITES[norm] ?? autoBuild(archetype);
}

/** Map a single Pokémon slug (e.g. a Limitless `deck.icons` entry) to its
 *  competitive sprite filename, applying the form overrides (ogerpon → teal-mask
 *  etc.). Used by the data-driven icon path in PokemonIcon. */
export function spriteForPokemon(name: string): string {
  return pokemonToSprite(name);
}

export { resolve as resolveArchetypeSprites, SPRITE_BASES };
