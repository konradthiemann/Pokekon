// Canonical H/I/J Standard archetype list — single source of truth for
// CreateDeckModal combobox, AddLogModal tile grid, and slug generation.
// Update here when the meta rotates; do NOT maintain parallel lists elsewhere.

import { normaliseCardName, type ArchetypeSignature } from '@pokekon/shared';

export interface KnownArchetype {
  slug: string;
  name: string;
  /**
   * Card-name fragments as they appear in a GERMAN PTCG Live battle log.
   * Optional: when omitted, the English display name's tokens are used — which
   * is correct only where the German name is identical (Zoroark, Absol, Latias).
   * A wrong-language fragment can only cause a MISSED detection, never a wrong
   * one, so the table may be filled in incrementally (plan
   * personal-data-role-rework §3.6, Risiko 1).
   */
  logNames?: string[];
}

export const KNOWN_ARCHETYPES: KnownArchetype[] = [
  // ── Tier 1 ───────────────────────────────────────────────────────────────
  { slug: 'dragapult-ex', name: 'Dragapult ex' },
  { slug: 'lucario-hariyama', name: 'Lucario Hariyama' },
  { slug: 'alakazam-dudunsparce', name: 'Alakazam Dudunsparce' },
  { slug: 'dragapult-blaziken', name: 'Dragapult Blaziken' },
  { slug: 'dragapult-dusknoir', name: 'Dragapult Dusknoir' },
  // logNames: 'Zoroark' is identical in German PTCG-Live logs (verified,
  // demoSeed.ts:150-224 "Ns Zoroark-ex" / "Ns Zorua").
  { slug: 'n-zoroark', name: "N's Zoroark", logNames: ['Zoroark'] },
  { slug: 'rocket-mewtwo-ex', name: "Rocket's Mewtwo" },
  { slug: 'starmie-froslass', name: 'Starmie Froslass' },
  { slug: 'ogerpon-meganium', name: 'Ogerpon Meganium' },
  { slug: 'grimmsnarl-froslass', name: 'Grimmsnarl Froslass' },
  // logNames: German localised name for "Raging Bolt" verified in
  // demoSeed.ts:179 ("Furienblitz-ex von Gtmap ..."). Only this one fragment
  // is used (not "Ogerpon") — the specific Ogerpon variant paired with Raging
  // Bolt in a real log is not yet a verified fact, and this plan's safety
  // rule (a missing fragment only ever under-detects, never mis-detects)
  // means a single, verified fragment is strictly safer than a compound one
  // built partly on an unverified guess.
  { slug: 'raging-bolt-ogerpon', name: 'Raging Bolt Ogerpon', logNames: ['Furienblitz'] },
  { slug: 'mega-absol-box', name: 'Mega Absol Box' },
  // ── Tier 2 ───────────────────────────────────────────────────────────────
  { slug: 'cynthias-garchomp', name: "Cynthia's Garchomp" },
  { slug: 'okidogi-barbaracle', name: 'Okidogi Barbaracle' },
  { slug: 'festival-lead', name: 'Festival Lead' },
  { slug: 'rockets-honchkrow', name: "Rocket's Honchkrow" },
  { slug: 'slowking', name: 'Slowking' },
  { slug: 'crustle', name: 'Crustle' },
  { slug: 'greninja', name: 'Greninja' },
  { slug: 'mega-venusaur', name: 'Mega Venusaur' },
  { slug: 'stevens-metagross', name: "Steven's Metagross" },
  { slug: 'clefairy-ogerpon', name: 'Clefairy Ogerpon' },
  { slug: 'mega-lucario', name: 'Mega Lucario' },
  { slug: 'ogerpon-box', name: 'Ogerpon Box' },
  { slug: 'flareon-noctowl', name: 'Flareon Noctowl' },
  { slug: 'ceruledge', name: 'Ceruledge' },
  { slug: 'froslass-munkidori', name: 'Froslass Munkidori' },
  { slug: 'mega-starmie', name: 'Mega Starmie' },
  { slug: 'diancie-dusknoir', name: 'Diancie Dusknoir' },
  { slug: 'tera-box', name: 'Tera Box' },
  { slug: 'jellicent-dusknoir', name: 'Jellicent Dusknoir' },
  { slug: 'rockets-spidops', name: "Rocket's Spidops" },
  { slug: 'hops-trevenant', name: "Hop's Trevenant" },
  { slug: 'decidueye', name: 'Decidueye' },
  { slug: 'ursaluna-lunatone', name: 'Ursaluna Lunatone' },
  // logNames: German localised names verified in demoSeed.ts:150-224
  // ("Mega-Schlapor-ex" = Lopunny, "Haspiror" = Dudunsparce) — the real,
  // ambiguity-triggering pairing with n-zoroark from plan §3.3 row 5.
  { slug: 'lopunny-dudunsparce', name: 'Lopunny Dudunsparce', logNames: ['Schlapor', 'Haspiror'] },
  { slug: 'hydrapple-ogerpon', name: 'Hydrapple Ogerpon' },
  { slug: 'yanmega', name: 'Yanmega' },
  { slug: 'ethanss-typhlosion', name: "Ethan's Typhlosion" },
  { slug: 'archaludon', name: 'Archaludon' },
  { slug: 'hops-zacian', name: "Hop's Zacian" },
  { slug: 'hydreigon', name: 'Hydreigon' },
  { slug: 'mega-charizard-x', name: 'Mega Charizard X' },
  { slug: 'zygarde-barbaracle', name: 'Zygarde Barbaracle' },
  { slug: 'marnie-grimmsnarl', name: "Marnie's Grimmsnarl" },
  { slug: 'archaludon-zoroark', name: 'Archaludon Zoroark' },
  { slug: 'kangaskhan-bouffalant', name: 'Kangaskhan Bouffalant' },
  { slug: 'mega-dragonite', name: 'Mega Dragonite' },
];

/**
 * Converts a display name to a URL-safe archetype slug.
 *
 * Handles apostrophes explicitly before stripping other non-alphanum characters
 * so that "N's Zoroark" produces "n-zoroark" (not "ns-zoroark").
 */
export function toArchetypeSlug(name: string): string {
  // Strip the entire possessive suffix ("'s", "'") so "N's Zoroark" → "n-zoroark"
  // rather than "ns-zoroark", which would break PokemonIcon sprite lookup.
  return name
    .toLowerCase()
    .replace(/'\w*/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Generic display-name tokens that describe a deck's role, not a card. */
const GENERIC_NAME_STOPWORDS = new Set(['box', 'lead']);

/**
 * KNOWN_ARCHETYPES mapped to shared's ArchetypeSignature (plan
 * personal-data-role-rework §3.6). Entries without `logNames` fall back to
 * the display-name tokens, minus the generic words 'box'/'lead' and minus
 * any token that normalises to an empty fragment (e.g. a bare "ex"/"gx" word
 * in the display name, such as "Dragapult ex" — normaliseCardName always
 * strips those suffix tokens, so keeping them as a *required* fragment would
 * make coverage 1 permanently unreachable for that archetype). Entries that
 * would end up with an empty fragment list are dropped entirely.
 */
export function archetypeSignatures(): ArchetypeSignature[] {
  const signatures: ArchetypeSignature[] = [];

  for (const archetype of KNOWN_ARCHETYPES) {
    const logNames =
      archetype.logNames && archetype.logNames.length > 0
        ? archetype.logNames
        : archetype.name
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token !== '')
            .filter((token) => !GENERIC_NAME_STOPWORDS.has(token.toLowerCase()))
            .filter((token) => normaliseCardName(token) !== '');

    if (logNames.length === 0) continue;
    signatures.push({ slug: archetype.slug, name: archetype.name, logNames });
  }

  return signatures;
}
