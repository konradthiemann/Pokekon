// Wire contract for GET /api/analytics/deck/:id — shared so apps/api (producer)
// and apps/web (consumer) agree on one shape with no duplication.

export interface WinRateBlock {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** wins / (wins + losses) as a percentage, or null when no game was decided. */
  winRatePct: number | null;
}

export interface PrizeCurvePoint {
  turn: number;
  avgPrizesRemaining: number;
  games: number;
}

export interface DeckAnalytics {
  deckId: number;
  weeks: number;
  /** Record over all logs in the window (parsed or not). */
  record: WinRateBlock;
  /** Win rate among parsed games where the player went first / second. */
  goingFirst: WinRateBlock;
  goingSecond: WinRateBlock;
  setup: {
    parsedGames: number;
    cleanByTurn2: number;
    /** Share of parsed games with a clean setup by turn 2, as a percentage. */
    cleanRatePct: number | null;
  };
  deadTurns: {
    parsedGames: number;
    /** Average dead (zero-activity) turns per parsed game. */
    avgPerGame: number | null;
  };
  /** Average remaining prizes per turn across WON games (the "winning curve"). */
  prizeCurveWins: PrizeCurvePoint[];
}
