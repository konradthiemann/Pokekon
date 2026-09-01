// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Parser output version. Bump whenever the parsing logic changes in a way that
 * would produce different `ParsedTurn`/board-state output for the same input,
 * so persisted results (match_log_parsed.parserVersion) can be re-parsed
 * selectively. v1 = aggregates only; v2 = + board-state reconstruction.
 */
export const PARSER_VERSION = 2;

export interface ParsedTurn {
  turnNumber: number;
  player: string;
  cardsPlayed: string[];
  damageDealt: number;
  kos: string[];
  prizesGained: number;
  energyAttached: number;
  actionsCount: number;

  // ── Board-state reconstruction (v2, best-effort) ──────────────────────────
  // Derived from the same German log lines; fields degrade gracefully (null /
  // empty / carried-forward) when the log does not contain the needed markers.
  /** Cards the turn player drew this turn (excludes the opening hand). */
  cardsDrawn: number;
  /** Supporter cards the turn player played this turn (matched against KNOWN_SUPPORTERS). */
  supportersPlayed: string[];
  /** The turn player's active Pokémon, inferred from attack lines; carried forward until it changes/KOs. */
  activePokemon: string | null;
  /** The turn player's benched Pokémon (names seen placed, minus knocked-out ones). */
  bench: string[];
  /** Approximate hand size of the turn player after this turn (from opening 7 ± draws/plays/prizes). */
  handSize: number | null;
  /** Cumulative energy the turn player has attached through this turn (ignores discards — best-effort). */
  energyInPlay: number;
}

export interface PrizePoint {
  label: string; // e.g. "Zug 3"
  turn: number;
  p1: number; // prizes remaining for player1
  p2: number; // prizes remaining for player2
}

export interface DamagePoint {
  label: string;
  turn: number;
  p1: number;
  p2: number;
}

export interface CardCount {
  card: string;
  count: number;
}

export interface ParsedBattleLog {
  player1: string;
  player2: string;
  winner: string | null;
  totalTurns: number;
  turns: ParsedTurn[];
  prizeProgression: PrizePoint[];
  damageByTurn: DamagePoint[];
  cardFrequency: CardCount[]; // cards played by player1
  totalDamage: { player: string; damage: number }[];
  totalKOs: { player: string; kos: number }[];

  // ── Match-level turn-quality signals (v2) ─────────────────────────────────
  parserVersion: number;
  /** Who took the first turn (first "Zug von" block), or null if no turns. */
  firstPlayer: string | null;
  /** Did player1 go first? null when unknown. */
  wentFirst: boolean | null;
  /** Did player1 attach energy AND play a draw supporter within their first two turns? */
  setupCleanByTurn2: boolean;
  /** Number of player1 turns with zero recognised actions (brick indicator). */
  deadTurns: number;
}

/**
 * Draw/search supporters and other common Supporter cards used to flag a "clean
 * setup". This is a heuristic allow-list — it is intentionally conservative and
 * may need extending as the meta rotates; an unknown supporter simply isn't
 * counted (it never produces a wrong attacker or damage figure).
 *
 * CORRECTION (plan `personal-data-role-rework.md` §0.5 — belegt against
 * apps/api/src/lib/demoSeed.ts's real reference log, LOG_NZOROARK_WIN): this
 * list is English, but real German PTCG-Live logs localise Trainer names too
 * ("Rockos Erkundung", "Schloss von N", "Höhlensystem Null", ...), not just
 * Pokémon names. The claim that used to sit here — that German-locale logs
 * print English Trainer names verbatim — does not hold. Practical effect: this
 * allow-list effectively never matches in a real German log, so
 * `setupCleanByTurn2` below runs on a systematically weak signal. Fixing the
 * list itself is parser work and out of scope for that plan (documented as a
 * known gap in docs/features.md §7, not silently left as an apparent
 * oversight).
 */
const KNOWN_SUPPORTERS = new Set<string>([
  'Iono',
  "Professor's Research",
  "Boss's Orders",
  'Arven',
  'Nemona',
  'Penny',
  'Carmine',
  'Briar',
  'Crispin',
  'Kieran',
  'Lacey',
  'Cyrano',
  "Professor Turo's Scenario",
  "Professor Sada's Vitality",
  'Roxanne',
  "Cynthia's Power Weight",
  'Judge',
  'Colress',
  "Colress's Experimentation",
  'Pokémon Center Lady',
  'Iono ex',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Heuristically identifies the two player names from log lines by counting
 * how often each token appears as a sentence subject in known German action patterns.
 * Failure mode: only designed for 2-player games — a third player's name could
 * displace one of the real players if it scores higher in the frequency ranking.
 */
function detectPlayers(lines: string[]): [string, string] {
  const counts = new Map<string, number>();

  for (const line of lines) {
    // "Name hat für die Starthand" / "Name hat Zahl" / "Name hat den Münzwurf"
    const m1 = line.match(/^(\S+) hat (?:für die Starthand|Zahl|den Münzwurf)/);
    if (m1) counts.set(m1[1], (counts.get(m1[1]) ?? 0) + 5); // high-confidence boost

    // "Name hat <anything>" — general action lines
    const m2 = line.match(/^(\S+) hat /);
    if (m2) counts.set(m2[1], (counts.get(m2[1]) ?? 0) + 1);

    // "Pokemon von Name hat/wurde"
    const m3 = line.match(/\bvon (\S+) (?:hat|wurde|ist)\b/);
    if (m3) counts.set(m3[1], (counts.get(m3[1]) ?? 0) + 1);
  }

  // Remove German stop-words that might appear as "subjects"
  const stop = new Set([
    'eine',
    'einen',
    'einem',
    'einer',
    'die',
    'der',
    'das',
    'den',
    'dem',
    'ist',
    'hat',
    'auf',
    'von',
    'mit',
    'zu',
    'in',
    'aus',
    'nach',
    'bei',
    'bis',
    'für',
    'durch',
    'gegen',
    'ohne',
    'um',
    'an',
    'jetzt',
    'Schadensaufteilung',
    'Grundschaden',
    'Gesamtschaden',
    'Schwäche',
    'Pokémon',
    'Karte',
    'Karten',
    'Basis',
    'Enthüllte',
  ]);

  const candidates = [...counts.entries()]
    .filter(([name]) => !stop.has(name) && name.length > 2 && /^[A-Z\d]/.test(name))
    .sort((a, b) => b[1] - a[1]);

  const p1 = candidates[0]?.[0] ?? 'Spieler 1';
  const p2 = candidates.find(([n]) => n !== p1)?.[0] ?? 'Spieler 2';
  return [p1, p2];
}

/** Per-turn parse result plus board-state deltas the main pass folds into running state. */
interface ParsedTurnRaw extends ParsedTurn {
  /** Pokémon the turn player placed on the bench this turn. */
  benchedThisTurn: string[];
  /** Pokémon knocked out this turn, with their owner, for removing from play. */
  koDetails: { pokemon: string; owner: string }[];
}

function parseTurnBlock(
  blockLines: string[],
  turnNumber: number,
  p1: string,
  p2: string,
): ParsedTurnRaw {
  // Determine whose turn it is from the first recognisable action
  let player = p1;
  for (const line of blockLines) {
    const m = line.match(/^(\S+) hat /);
    if (m && (m[1] === p1 || m[1] === p2)) {
      player = m[1];
      break;
    }
    const m2 = line.match(/^.+ von (\S+) hat .+ eingesetzt/);
    if (m2 && (m2[1] === p1 || m2[1] === p2)) {
      player = m2[1];
      break;
    }
  }

  const cardsPlayed: string[] = [];
  let damageDealt = 0;
  const kos: string[] = [];
  const koDetails: { pokemon: string; owner: string }[] = [];
  let prizesGained = 0;
  let energyAttached = 0;
  let actionsCount = 0;
  let cardsDrawn = 0;
  const supportersPlayed: string[] = [];
  const benchedThisTurn: string[] = [];
  let activePokemon: string | null = null;

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    if (!line.trim()) continue;

    // Cards played
    const playMatch = line.match(/^(\S+) hat (.+?) gespielt\./);
    if (playMatch && playMatch[1] === player) {
      cardsPlayed.push(playMatch[2]);
      actionsCount++;
      if (KNOWN_SUPPORTERS.has(playMatch[2])) supportersPlayed.push(playMatch[2]);
    }

    // Energy attached
    const energyMatch = line.match(/^(\S+) hat .+-Energie an /);
    if (energyMatch && energyMatch[1] === player) {
      energyAttached++;
      actionsCount++;
    }

    // Bench placement (best-effort — pattern absent from some logs)
    const benchMatch = line.match(/^(\S+) hat (.+?) auf die Bank gelegt/);
    if (benchMatch && benchMatch[1] === player) {
      benchedThisTurn.push(benchMatch[2]);
      actionsCount++;
    }

    // Card draw (excludes the opening "Starthand" line, handled separately)
    if (!line.includes('Starthand')) {
      const drawOne = line.match(/^(\S+) hat eine Karte gezogen/);
      if (drawOne && drawOne[1] === player) cardsDrawn += 1;
      const drawN = line.match(/^(\S+) hat (\d+) Karten gezogen/);
      if (drawN && drawN[1] === player) cardsDrawn += parseInt(drawN[2], 10);
    }

    // Attack damage — primary target ("für X Schadenspunkte eingesetzt")
    const atkMatch = line.match(/für (\d+) Schadenspunkte eingesetzt/);
    if (atkMatch) {
      const attackerMatch = line.match(/^(.+?) von (\S+) hat /);
      if (!attackerMatch || attackerMatch[2] === player) {
        damageDealt += parseInt(atkMatch[1], 10);
        // The attacking Pokémon is, by definition, the turn player's active.
        if (attackerMatch && attackerMatch[2] === player) activePokemon = attackerMatch[1];
      }
    }

    // KOs
    const koMatch = line.match(/^(.+) von (\S+) wurde kampfunfähig gemacht!/);
    if (koMatch) {
      kos.push(`${koMatch[1]} (${koMatch[2]})`);
      koDetails.push({ pokemon: koMatch[1], owner: koMatch[2] });
    }

    // Prizes gained
    const prize1 = line.match(/^(\S+) hat eine Preiskarte aufgenommen/);
    if (prize1 && prize1[1] === player) prizesGained += 1;

    const prizeN = line.match(/^(\S+) hat (\d+) Preiskarten aufgenommen/);
    if (prizeN && prizeN[1] === player) prizesGained += parseInt(prizeN[2], 10);
  }

  // Deduplicate: if we saw BOTH "für X eingesetzt" and "Gesamtschaden: X", we
  // may have double-counted. The Gesamtschaden lines are in sub-bullets ("   •")
  // so they won't match the attack regex — no double-count risk.

  return {
    turnNumber,
    player,
    cardsPlayed,
    damageDealt,
    kos,
    prizesGained,
    energyAttached,
    actionsCount,
    cardsDrawn,
    supportersPlayed,
    activePokemon,
    bench: [],
    handSize: null,
    energyInPlay: 0,
    benchedThisTurn,
    koDetails,
  };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parses a raw PTCG Live battle log (German locale only — regex patterns match
 * German action verbs such as "hat gespielt", "wurde kampfunfähig gemacht").
 * `myPlayerName` pins which detected player is treated as player1 (the local user);
 * if it doesn't exactly match either auto-detected name, the heuristic winner
 * becomes player1 instead, and card-frequency stats will track the wrong player.
 * An empty `turns` array in the result means the log contained no "Zug von" markers.
 *
 * Board-state fields (active/bench/handSize/...) are best-effort reconstructions:
 * accurate when the log contains the relevant markers, gracefully empty otherwise.
 *
 * @param log - The raw text content of the battle log.
 * @param myPlayerName - The exact in-game username of the local player.
 * @returns Structured match statistics including turns, board state, and turn-quality signals.
 */
export function parseBattleLog(log: string, myPlayerName: string): ParsedBattleLog {
  const lines = log.split('\n').map((l) => l.trimEnd());

  const [autoP1, autoP2] = detectPlayers(lines);
  // Exact string match is required — a partial name or different capitalisation will
  // fall through to autoP1, silently assigning the wrong player as player1.
  const player1 =
    myPlayerName && (myPlayerName === autoP1 || myPlayerName === autoP2) ? myPlayerName : autoP1;
  const player2 = player1 === autoP1 ? autoP2 : autoP1;

  // ── Opening hand sizes ("… hat für die Starthand N Karten gezogen") ────────
  const handSize: Record<string, number> = {};
  for (const line of lines) {
    const m = line.match(/^(\S+) hat für die Starthand (\d+) Karten gezogen/);
    if (m && (m[1] === player1 || m[1] === player2)) handSize[m[1]] = parseInt(m[2], 10);
  }

  // ── Split into turn blocks ────────────────────────────────────────────────
  const turnBlocks: string[][] = [];
  let current: string[] = [];
  let inTurn = false;

  for (const line of lines) {
    if (line.startsWith('Zug von ')) {
      if (inTurn && current.length) turnBlocks.push(current);
      current = [];
      inTurn = true;
    } else if (inTurn) {
      current.push(line);
    }
  }
  if (inTurn && current.length) turnBlocks.push(current);

  const rawTurns = turnBlocks.map((block, i) => parseTurnBlock(block, i + 1, player1, player2));

  // ── Fold board-state across turns (running per-player state) ───────────────
  const benchByPlayer: Record<string, string[]> = { [player1]: [], [player2]: [] };
  const energyByPlayer: Record<string, number> = { [player1]: 0, [player2]: 0 };
  const activeByPlayer: Record<string, string | null> = { [player1]: null, [player2]: null };

  const turns: ParsedTurn[] = rawTurns.map((t) => {
    const { benchedThisTurn, koDetails, ...turn } = t;

    // Hand size: opening hand ± draws + prizes − cards played − energy attached.
    if (handSize[turn.player] === undefined) handSize[turn.player] = 7;
    handSize[turn.player] = Math.max(
      0,
      handSize[turn.player] +
        turn.cardsDrawn +
        turn.prizesGained -
        turn.cardsPlayed.length -
        turn.energyAttached,
    );

    // Active Pokémon: update from this turn's attack, otherwise carry forward.
    if (turn.activePokemon) activeByPlayer[turn.player] = turn.activePokemon;

    // Bench: add placements, then remove anything knocked out this turn.
    benchByPlayer[turn.player].push(...benchedThisTurn);
    for (const ko of koDetails) {
      const owner = ko.owner === player1 || ko.owner === player2 ? ko.owner : null;
      if (owner) {
        benchByPlayer[owner] = benchByPlayer[owner].filter((p) => p !== ko.pokemon);
        if (activeByPlayer[owner] === ko.pokemon) activeByPlayer[owner] = null;
      }
    }

    // Cumulative energy in play (best-effort, ignores discards).
    energyByPlayer[turn.player] += turn.energyAttached;

    return {
      ...turn,
      activePokemon: activeByPlayer[turn.player],
      bench: [...benchByPlayer[turn.player]],
      handSize: handSize[turn.player],
      energyInPlay: energyByPlayer[turn.player],
    };
  });

  // ── Prize progression ────────────────────────────────────────────────────
  const prizes: Record<string, number> = { [player1]: 6, [player2]: 6 };
  const prizeProgression: PrizePoint[] = [{ label: 'Start', turn: 0, p1: 6, p2: 6 }];

  for (const turn of turns) {
    if (turn.prizesGained > 0) {
      prizes[turn.player] = Math.max(0, (prizes[turn.player] ?? 6) - turn.prizesGained);
    }
    prizeProgression.push({
      label: `Z${turn.turnNumber}`,
      turn: turn.turnNumber,
      p1: prizes[player1] ?? 6,
      p2: prizes[player2] ?? 6,
    });
  }

  // ── Damage by turn ────────────────────────────────────────────────────────
  const dmgByTurn: DamagePoint[] = turns
    .filter((t) => t.damageDealt > 0)
    .map((t) => ({
      label: `Z${t.turnNumber}`,
      turn: t.turnNumber,
      p1: t.player === player1 ? t.damageDealt : 0,
      p2: t.player === player2 ? t.damageDealt : 0,
    }));

  // ── Card frequency (player1 only) ─────────────────────────────────────────
  const cardMap = new Map<string, number>();
  for (const turn of turns.filter((t) => t.player === player1)) {
    for (const card of turn.cardsPlayed) {
      cardMap.set(card, (cardMap.get(card) ?? 0) + 1);
    }
  }
  const cardFrequency = [...cardMap.entries()]
    .map(([card, count]) => ({ card, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // ── Totals ────────────────────────────────────────────────────────────────
  const dmgTotals = new Map<string, number>();
  const koTotals = new Map<string, number>();
  for (const turn of turns) {
    dmgTotals.set(turn.player, (dmgTotals.get(turn.player) ?? 0) + turn.damageDealt);
    koTotals.set(turn.player, (koTotals.get(turn.player) ?? 0) + turn.kos.length);
  }

  // ── Winner ────────────────────────────────────────────────────────────────
  // The "X hat gewonnen" sentence can be preceded by another sentence on the
  // same line — e.g. a concession: "Du hast aufgegeben. Gtmap hat gewonnen."
  // (verbatim tail of Konrad's own reference log, demoSeed.ts:224). Anchoring
  // only to the start of the line would silently drop the winner for every
  // conceded game, which is the common case online. The sentence-boundary
  // prefix (start of string, or `.`/`!`/`?` + whitespace) still excludes a
  // coin-toss win line ("X hat den Münzwurf gewonnen"), since that phrase has
  // no "gewonnen" directly after the player name.
  // Plan personal-data-role-rework §3.4, Entscheidung 5 — the ONE sanctioned
  // exception to this plan's "battleLogParser.ts is out of scope" boundary.
  let winner: string | null = null;
  for (const line of lines) {
    const m = line.match(/(?:^|[.!?]\s+)(\S+) hat gewonnen/);
    if (m) {
      winner = m[1];
      break;
    }
  }

  // ── Turn-quality signals ───────────────────────────────────────────────────
  const firstPlayer = turns[0]?.player ?? null;
  const wentFirst = firstPlayer === null ? null : firstPlayer === player1;

  const p1Turns = turns.filter((t) => t.player === player1);
  const earlyTurns = p1Turns.slice(0, 2);
  const setupCleanByTurn2 =
    earlyTurns.some((t) => t.energyAttached > 0) &&
    earlyTurns.some((t) => t.supportersPlayed.length > 0);
  // A "dead" turn did genuinely nothing — no plays/energy, no attack, no KO, no prize.
  // (actionsCount alone would misflag an attack-only turn, since attacks don't count as actions.)
  const deadTurns = p1Turns.filter(
    (t) =>
      t.actionsCount === 0 && t.damageDealt === 0 && t.kos.length === 0 && t.prizesGained === 0,
  ).length;

  return {
    player1,
    player2,
    winner,
    totalTurns: turns.length,
    turns,
    prizeProgression,
    damageByTurn: dmgByTurn,
    cardFrequency,
    totalDamage: [...dmgTotals.entries()].map(([player, damage]) => ({ player, damage })),
    totalKOs: [...koTotals.entries()].map(([player, kos]) => ({ player, kos })),
    parserVersion: PARSER_VERSION,
    firstPlayer,
    wentFirst,
    setupCleanByTurn2,
    deadTurns,
  };
}
