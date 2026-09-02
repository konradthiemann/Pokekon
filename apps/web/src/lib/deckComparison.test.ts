import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArchetypeComparison } from './deckComparison';

// A card can appear as more than one printing (different set/number) within
// the same decklist — deckComparison.ts:200-213 previously incremented
// listsCount once per PRINTING ENTRY instead of once per LIST, so a card
// split across two printings in one list inflated frequency past 100%.

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchArchetypeComparison — one inclusion per list, not per printing entry', () => {
  it('never reports a frequency above 100% for a card split across two printings in one list', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/tournaments?')) {
        return Promise.resolve(jsonResponse([{ id: 't1', name: 'Regional', players: 40 }]));
      }
      if (url.includes('/api/tournaments/t1/standings')) {
        return Promise.resolve(
          jsonResponse([
            {
              deck: { id: 'dragapult-ex', name: 'Dragapult ex' },
              placing: 1,
              record: { wins: 8, losses: 0, ties: 0 },
              decklist: {
                // "Basic Energy" appears as two printings in the same list —
                // a single list must still count as ONE inclusion.
                pokemon: [{ name: 'Dragapult ex', count: 3 }],
                trainer: [],
                energy: [
                  { name: 'Basic Energy', count: 6 },
                  { name: 'Basic Energy', count: 2 },
                ],
              },
            },
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await fetchArchetypeComparison('dragapult-ex', []);

    const basicEnergy = result.cardStats.find((c) => c.name === 'Basic Energy');
    expect(basicEnergy).toBeDefined();
    expect(basicEnergy?.frequency).toBeLessThanOrEqual(100);
    expect(basicEnergy?.frequency).toBe(100);
    // Copies across both printings are still summed for avgCount.
    expect(basicEnergy?.avgCount).toBe(8);
  });
});
