// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTurn {
  turnNumber: number;
  player: string;
  cardsPlayed: string[];
  damageDealt: number;
  kos: string[];
  prizesGained: number;
  energyAttached: number;
  actionsCount: number;
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
}

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

function parseTurnBlock(
  blockLines: string[],
  turnNumber: number,
  p1: string,
  p2: string,
): ParsedTurn {
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
  let prizesGained = 0;
  let energyAttached = 0;
  let actionsCount = 0;

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    if (!line.trim()) continue;

    // Cards played
    const playMatch = line.match(/^(\S+) hat (.+?) gespielt\./);
    if (playMatch && playMatch[1] === player) {
      cardsPlayed.push(playMatch[2]);
      actionsCount++;
    }

    // Energy attached
    const energyMatch = line.match(/^(\S+) hat .+-Energie an /);
    if (energyMatch && energyMatch[1] === player) {
      energyAttached++;
      actionsCount++;
    }

    // Attack damage — primary target ("für X Schadenspunkte eingesetzt")
    const atkMatch = line.match(/für (\d+) Schadenspunkte eingesetzt/);
    if (atkMatch) {
      const attackerMatch = line.match(/^.+ von (\S+) hat /);
      if (!attackerMatch || attackerMatch[1] === player) {
        damageDealt += parseInt(atkMatch[1], 10);
      }
    }

    // KOs
    const koMatch = line.match(/^(.+) von (\S+) wurde kampfunfähig gemacht!/);
    if (koMatch) kos.push(`${koMatch[1]} (${koMatch[2]})`);

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
 * @param log - The raw text content of the battle log.
 * @param myPlayerName - The exact in-game username of the local player.
 * @returns Structured match statistics including turns, prize progression, and damage.
 */
export function parseBattleLog(log: string, myPlayerName: string): ParsedBattleLog {
  const lines = log.split('\n').map((l) => l.trimEnd());

  const [autoP1, autoP2] = detectPlayers(lines);
  // Exact string match is required — a partial name or different capitalisation will
  // fall through to autoP1, silently assigning the wrong player as player1.
  const player1 =
    myPlayerName && (myPlayerName === autoP1 || myPlayerName === autoP2) ? myPlayerName : autoP1;
  const player2 = player1 === autoP1 ? autoP2 : autoP1;

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

  const turns = turnBlocks.map((block, i) => parseTurnBlock(block, i + 1, player1, player2));

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
  let winner: string | null = null;
  for (const line of lines) {
    const m = line.match(/^(\S+) hat gewonnen/);
    if (m) {
      winner = m[1];
      break;
    }
  }

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
  };
}
