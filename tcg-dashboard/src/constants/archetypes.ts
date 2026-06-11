// Canonical H/I/J Standard archetype list — single source of truth for
// CreateDeckModal combobox, AddLogModal tile grid, and slug generation.
// Update here when the meta rotates; do NOT maintain parallel lists elsewhere.

export interface KnownArchetype {
  slug: string;
  name: string;
}

export const KNOWN_ARCHETYPES: KnownArchetype[] = [
  // ── Tier 1 ───────────────────────────────────────────────────────────────
  { slug: 'dragapult-ex',          name: 'Dragapult ex'          },
  { slug: 'lucario-hariyama',      name: 'Lucario Hariyama'      },
  { slug: 'alakazam-dudunsparce',  name: 'Alakazam Dudunsparce'  },
  { slug: 'dragapult-blaziken',    name: 'Dragapult Blaziken'    },
  { slug: 'dragapult-dusknoir',    name: 'Dragapult Dusknoir'    },
  { slug: 'n-zoroark',             name: "N's Zoroark"           },
  { slug: 'rocket-mewtwo-ex',      name: "Rocket's Mewtwo"       },
  { slug: 'starmie-froslass',      name: 'Starmie Froslass'      },
  { slug: 'ogerpon-meganium',      name: 'Ogerpon Meganium'      },
  { slug: 'grimmsnarl-froslass',   name: 'Grimmsnarl Froslass'   },
  { slug: 'raging-bolt-ogerpon',   name: 'Raging Bolt Ogerpon'   },
  { slug: 'mega-absol-box',        name: 'Mega Absol Box'        },
  // ── Tier 2 ───────────────────────────────────────────────────────────────
  { slug: 'cynthias-garchomp',     name: "Cynthia's Garchomp"    },
  { slug: 'okidogi-barbaracle',    name: 'Okidogi Barbaracle'    },
  { slug: 'festival-lead',         name: 'Festival Lead'         },
  { slug: 'rockets-honchkrow',     name: "Rocket's Honchkrow"    },
  { slug: 'slowking',              name: 'Slowking'              },
  { slug: 'crustle',               name: 'Crustle'               },
  { slug: 'greninja',              name: 'Greninja'              },
  { slug: 'mega-venusaur',         name: 'Mega Venusaur'         },
  { slug: 'stevens-metagross',     name: "Steven's Metagross"    },
  { slug: 'clefairy-ogerpon',      name: 'Clefairy Ogerpon'      },
  { slug: 'mega-lucario',          name: 'Mega Lucario'          },
  { slug: 'ogerpon-box',           name: 'Ogerpon Box'           },
  { slug: 'flareon-noctowl',       name: 'Flareon Noctowl'       },
  { slug: 'ceruledge',             name: 'Ceruledge'             },
  { slug: 'froslass-munkidori',    name: 'Froslass Munkidori'    },
  { slug: 'mega-starmie',          name: 'Mega Starmie'          },
  { slug: 'diancie-dusknoir',      name: 'Diancie Dusknoir'      },
  { slug: 'tera-box',              name: 'Tera Box'              },
  { slug: 'jellicent-dusknoir',    name: 'Jellicent Dusknoir'    },
  { slug: 'rockets-spidops',       name: "Rocket's Spidops"      },
  { slug: 'hops-trevenant',        name: "Hop's Trevenant"       },
  { slug: 'decidueye',             name: 'Decidueye'             },
  { slug: 'ursaluna-lunatone',     name: 'Ursaluna Lunatone'     },
  { slug: 'lopunny-dudunsparce',   name: 'Lopunny Dudunsparce'   },
  { slug: 'hydrapple-ogerpon',     name: 'Hydrapple Ogerpon'     },
  { slug: 'yanmega',               name: 'Yanmega'               },
  { slug: 'ethanss-typhlosion',    name: "Ethan's Typhlosion"    },
  { slug: 'archaludon',            name: 'Archaludon'            },
  { slug: 'hops-zacian',           name: "Hop's Zacian"          },
  { slug: 'hydreigon',             name: 'Hydreigon'             },
  { slug: 'mega-charizard-x',      name: 'Mega Charizard X'      },
  { slug: 'zygarde-barbaracle',    name: 'Zygarde Barbaracle'    },
  { slug: 'marnie-grimmsnarl',     name: "Marnie's Grimmsnarl"   },
  { slug: 'archaludon-zoroark',    name: 'Archaludon Zoroark'    },
  { slug: 'kangaskhan-bouffalant', name: 'Kangaskhan Bouffalant' },
  { slug: 'mega-dragonite',        name: 'Mega Dragonite'        },
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
