import { describe, expect, it } from 'vitest';
import { parseBattleLog, validateAnalysis } from '@pokekon/shared';
import { DEMO_PLAYER, DEMO_LOGGED_MATCHES, DECK_A_MATCHES, DECK_A_CARDS_V2 } from './demoSeed.js';

type Match = (typeof DECK_A_MATCHES)[number];

function record(matches: Match[]) {
  const wins = matches.filter((m) => m.result === 'W').length;
  const losses = matches.filter((m) => m.result === 'L').length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  return { encounters: matches.length, wins, losses, winRate };
}

// These tests guard the demo content against parser/format drift: every seeded
// battle log must parse to something useful, and every pre-baked analysis item
// must survive the verbatim-evidence grounding gate (validateAnalysis drops any
// item whose evidence quote is not found in the raw log). If an edit to a log or
// an analysis breaks the quote, this fails loudly instead of silently shipping an
// empty analysis to demo visitors.

describe('demo seed content', () => {
  it('ships at least 3 logged matches (so battle-log performance recs fire)', () => {
    expect(DEMO_LOGGED_MATCHES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(DEMO_LOGGED_MATCHES.map((m, i) => [i, m] as const))(
    'match #%i (%o) parses and keeps every analysis item',
    (_i, match) => {
      const parsed = parseBattleLog(match.log, DEMO_PLAYER);

      // The log is non-trivial and the local player is pinned correctly.
      expect(parsed.totalTurns).toBeGreaterThan(0);
      expect(parsed.player1).toBe(DEMO_PLAYER);

      // Every analysis item is grounded — none is dropped by the evidence gate.
      const validated = validateAnalysis(match.analysis, match.log);
      expect(validated.keyMoments.length).toBe(match.analysis.keyMoments.length);
      expect(validated.playMistakes.length).toBe(match.analysis.playMistakes.length);
      expect(validated.cardNotes.length).toBe(match.analysis.cardNotes.length);
      expect(validated.deckSuggestions.length).toBe(match.analysis.deckSuggestions.length);
    },
  );

  it('detects gtmap as the winner of the clean win logs', () => {
    // Logs that end with a literal "Gtmap hat gewonnen!" line (the headline match
    // uses a surrender line instead, so it is intentionally excluded here).
    const cleanWins = DEMO_LOGGED_MATCHES.filter((m) => m.log.includes('Gtmap hat gewonnen!'));
    expect(cleanWins.length).toBeGreaterThanOrEqual(2);
    for (const m of cleanWins) {
      expect(parseBattleLog(m.log, DEMO_PLAYER).winner).toBe(DEMO_PLAYER);
    }
  });
});

// Guards the recommendation-triggering shape of the demo data against future edits
// to the match plan (mirrors the thresholds in apps/web/src/hooks/useRecommendations.ts).
describe('demo seed recommendation triggers', () => {
  const TECH_BAD_MATCHUPS = ['Dragapult ex', "N's Zoroark"];

  it.each(TECH_BAD_MATCHUPS)('%s is a tech-suggestion target (≥5 encounters, ≤50%% WR)', (arch) => {
    const r = record(DECK_A_MATCHES.filter((m) => m.archetype === arch));
    expect(r.encounters).toBeGreaterThanOrEqual(5);
    expect(r.winRate).toBeLessThanOrEqual(50);
  });

  it.each(TECH_BAD_MATCHUPS)('%s shows a ≥15-point version swing (v1 → v2)', (arch) => {
    const v1 = record(DECK_A_MATCHES.filter((m) => m.archetype === arch && m.snapshot === 'v1'));
    const v2 = record(DECK_A_MATCHES.filter((m) => m.archetype === arch && m.snapshot === 'v2'));
    expect(v1.encounters).toBeGreaterThanOrEqual(1);
    expect(v2.encounters).toBeGreaterThanOrEqual(1);
    expect(Math.abs(v2.winRate - v1.winRate)).toBeGreaterThanOrEqual(15);
  });

  it('has ≥2 logged losses (so the prize-dominated rec can fire)', () => {
    const loggedLosses = DECK_A_MATCHES.filter((m) => m.log && m.result === 'L');
    expect(loggedLosses.length).toBeGreaterThanOrEqual(2);
  });

  it('omits the cards whose absence drives recommendations (Boss’s Orders, Eri, Briar)', () => {
    const names = DECK_A_CARDS_V2.map((c) => c.name.toLowerCase());
    expect(names).not.toContain("boss's orders");
    expect(names).not.toContain('eri');
    expect(names).not.toContain('briar');
  });
});
