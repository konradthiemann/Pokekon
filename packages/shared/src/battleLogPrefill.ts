import { parseBattleLog, type ParsedBattleLog } from './battleLogParser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Battle-log-first opponent/result prefill (plan
// `.claude/plans/personal-data-role-rework.md` §3.1–§3.5). Pure logic, no UI
// constants: the caller (apps/web) supplies `ArchetypeSignature[]` built from
// its own KNOWN_ARCHETYPES table. `guessOpponentArchetype` deliberately
// returns a coverage ratio instead of a fabricated percent confidence — the
// parser exposes no confidence signal at all (plan §0.3), so inventing one
// would misrepresent how sure the guess actually is.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One archetype's recognition signature. Supplied BY THE CALLER (the web app owns
 * KNOWN_ARCHETYPES) so this module stays free of UI constants and stays testable
 * with tiny hand-written tables.
 */
export interface ArchetypeSignature {
  slug: string;
  name: string;
  /**
   * Card-name fragments as they appear in a GERMAN PTCG-Live log — Pokémon AND
   * Trainer names are localised (see plan §0.5). Must be non-empty.
   */
  logNames: string[];
}

export interface ArchetypeCandidate {
  slug: string;
  name: string;
  /** Distinct signature fragments found among the opponent's cards. */
  matched: string[];
  /** matched.length / logNames.length, in [0, 1]. Unrounded. */
  coverage: number;
}

/**
 * - 'unique'    exactly one candidate reaches coverage 1 and no other candidate
 *               shares the top coverage  -> safe to pre-select
 * - 'ambiguous' at least one candidate, but not the above -> offer, never pick
 * - 'none'      no fragment matched at all
 */
export type GuessConfidence = 'unique' | 'ambiguous' | 'none';

export interface OpponentArchetypeGuess {
  /** Sorted by coverage desc, then name asc. At most 3 entries. */
  candidates: ArchetypeCandidate[];
  /** Non-null exactly when confidence === 'unique'. */
  best: ArchetypeCandidate | null;
  confidence: GuessConfidence;
}

export interface BattleLogPrefill {
  parsed: ParsedBattleLog;
  /**
   * true when the supplied playerName exactly matched one of the two detected
   * players. false means the me/opponent split is a heuristic guess and the UI
   * MUST ask before using `result` (battleLogParser.ts:333-334).
   */
  playerPinned: boolean;
  detectedPlayers: [string, string];
  /** Opponent-side card names, de-duplicated, first-seen order. */
  opponentCards: string[];
  archetype: OpponentArchetypeGuess;
  /** See resultFromParsedLog. Never 'T'. */
  result: 'W' | 'L' | null;
}

/** Card-name suffix tokens that identify a card variant, not the card itself. */
const CARD_SUFFIX_TOKENS = new Set(['ex', 'gx', 'v', 'vmax', 'vstar']);

/**
 * Lower-cases, drops apostrophes, turns hyphens/underscores into spaces, removes
 * the card-suffix tokens ex/gx/v/vmax/vstar, and collapses whitespace.
 * "Ns Zoroark-ex" -> "ns zoroark"   "Türkisgrüne-Maske-Ogerpon-ex" -> "türkisgrüne maske ogerpon"
 */
export function normaliseCardName(name: string): string {
  const withoutApostrophes = name.replace(/['’]/g, '');
  const withSpaces = withoutApostrophes.replace(/[-_]/g, ' ').toLowerCase();
  const tokens = withSpaces.split(/\s+/).filter((t) => t.length > 0 && !CARD_SUFFIX_TOKENS.has(t));
  return tokens.join(' ');
}

/**
 * PTCG Live's fixed "played a Stadium" sentence ("X hat <name> auf das
 * Stadion-Feld gespielt.") has no dedicated regex in battleLogParser.ts — it
 * falls through to the generic "hat X gespielt." cardsPlayed match, which
 * therefore captures the whole "<name> auf das Stadion-Feld" clause verbatim.
 * Stripping this known, literal, deterministic suffix here (not in the
 * parser — no ParsedTurn field changes) turns that noise back into a clean
 * card name. Any other cardsPlayed entry is returned unchanged.
 */
const STADIUM_PLAY_SUFFIX = ' auf das Stadion-Feld';

function cleanPlayedCardName(raw: string): string {
  return raw.endsWith(STADIUM_PLAY_SUFFIX) ? raw.slice(0, -STADIUM_PLAY_SUFFIX.length) : raw;
}

/**
 * Card and Pokémon names attributable to the OPPONENT (parsed.player2):
 *   - activePokemon of every opponent turn
 *   - bench of every opponent turn
 *   - cardsPlayed of every opponent turn (Trainers included)
 *   - every KO whose owner is player2
 * De-duplicated, first-seen order. Empty array when the log has no opponent turns.
 */
export function opponentCardNames(parsed: ParsedBattleLog): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const push = (name: string | null | undefined): void => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const turn of parsed.turns) {
    if (turn.player === parsed.player2) {
      push(turn.activePokemon);
      for (const benched of turn.bench) push(benched);
      for (const card of turn.cardsPlayed) push(cleanPlayedCardName(card));
    }
    // KOs are recorded on whichever turn block the KO line fell in, not
    // necessarily the victim's own turn — so every turn's kos are scanned.
    for (const ko of turn.kos) {
      const match = ko.match(/^(.+) \((.+)\)$/);
      if (match && match[2] === parsed.player2) push(match[1]);
    }
  }

  return names;
}

/**
 * A fragment matches a card name iff the fragment appears as a whole token
 * (space-delimited) inside the card name — see plan §3.2's match rule.
 * An empty fragment never matches.
 */
function fragmentMatchesCard(cardNormalised: string, fragmentNormalised: string): boolean {
  if (fragmentNormalised === '') return false;
  return ` ${cardNormalised} `.includes(` ${fragmentNormalised} `);
}

/**
 * Coverage-based, ambiguity-aware archetype guess. Deliberately NOT a score in
 * percent: the parser exposes no confidence at all (plan §0.3), so inventing one
 * would be a fabricated number. Coverage ("how much of this archetype's signature
 * did we actually see") is directly derived from evidence.
 */
export function guessOpponentArchetype(
  opponentCards: string[],
  signatures: ArchetypeSignature[],
): OpponentArchetypeGuess {
  const normalisedCards = opponentCards.map(normaliseCardName);

  const candidates: ArchetypeCandidate[] = [];
  for (const signature of signatures) {
    if (signature.logNames.length === 0) continue;

    const matched: string[] = [];
    for (const fragment of signature.logNames) {
      const fragmentNormalised = normaliseCardName(fragment);
      const isMatched = normalisedCards.some((card) =>
        fragmentMatchesCard(card, fragmentNormalised),
      );
      if (isMatched) matched.push(fragment);
    }
    if (matched.length === 0) continue;

    candidates.push({
      slug: signature.slug,
      name: signature.name,
      matched,
      coverage: matched.length / signature.logNames.length,
    });
  }

  candidates.sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name));
  const top = candidates.slice(0, 3);

  if (top.length === 0) {
    return { candidates: [], best: null, confidence: 'none' };
  }

  const isUnique = top[0].coverage === 1 && top[1]?.coverage !== top[0].coverage;
  if (isUnique) {
    return { candidates: top, best: top[0], confidence: 'unique' };
  }

  return { candidates: top, best: null, confidence: 'ambiguous' };
}

/**
 * 'W' when parsed.winner === parsed.player1, 'L' when it === parsed.player2,
 * null otherwise (no winner line, or a name matching neither).
 * NEVER 'T': German PTCG-Live logs carry no draw marker the parser recognises,
 * so a tie always stays a manual decision (plan §0.3/§3.5).
 */
export function resultFromParsedLog(parsed: ParsedBattleLog): 'W' | 'L' | null {
  if (parsed.winner === parsed.player1) return 'W';
  if (parsed.winner === parsed.player2) return 'L';
  return null;
}

/**
 * Returns null when the text is not usable as a battle log — currently: no
 * "Zug von" turn blocks were found (parsed.turns.length === 0). The caller then
 * silently keeps the manual form; per the spec's AC this must NOT look like a crash.
 */
export function prefillFromBattleLog(
  log: string,
  playerName: string,
  signatures: ArchetypeSignature[],
): BattleLogPrefill | null {
  if (!log.trim()) return null;

  try {
    const trimmedName = playerName.trim();
    const parsed = parseBattleLog(log, trimmedName);
    if (parsed.turns.length === 0) return null;

    const playerPinned = trimmedName !== '' && parsed.player1 === trimmedName;
    const opponentCards = opponentCardNames(parsed);
    const archetype = guessOpponentArchetype(opponentCards, signatures);
    const result = resultFromParsedLog(parsed);

    return {
      parsed,
      playerPinned,
      detectedPlayers: [parsed.player1, parsed.player2],
      opponentCards,
      archetype,
      result,
    };
  } catch {
    // A parser failure (unexpected input shape) must not surface as a crash —
    // the caller falls back to the fully manual form (plan §3.5 rule 5).
    return null;
  }
}
