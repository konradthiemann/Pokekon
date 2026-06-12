import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDeckList, importCards, type ParsedCard } from './deckImport';
import * as api from './api';

// importCards talks to the REST API — replace the whole module so tests
// can assert the PUT payload without any network.
vi.mock('./api');

const mockedApi = vi.mocked(api);

const PTCG_EXPORT = `Pokémon: 4
3 Dragapult ex TWM 130
4 Dreepy TWM 128
1 Fezandipiti ex SFA 38
2 Budew PRE 4

Trainer: 6
4 Iono PAL 185
2 Boss's Orders PAL 172
3 Buddy-Buddy Poffin TEF 144
2 Slateport City PAL 82
1 Hero's Cape TEF 152
1 Professor Turo's Scenario PAR 171

Energy: 1
6 Basic {P} Energy SVE 13

Karten insgesamt: 60`;

describe('parseDeckList', () => {
  it('parses all sections of a PTCG Live export', () => {
    const result = parseDeckList(PTCG_EXPORT);
    expect(result.cards).toHaveLength(11);
    expect(result.skippedLines).toHaveLength(0);
    expect(result.totalCount).toBe(29);
  });

  it('extracts count, name, set and collector number from a card line', () => {
    const { cards } = parseDeckList(PTCG_EXPORT);
    const dragapult = cards.find((c) => c.name === 'Dragapult ex');
    expect(dragapult).toMatchObject({
      count: 3,
      set: 'TWM',
      number: '130',
      type: 'Pokemon',
    });
  });

  it('infers Pokémon roles: tech list vs. default attacker', () => {
    const { cards } = parseDeckList(PTCG_EXPORT);
    expect(cards.find((c) => c.name === 'Fezandipiti ex')?.role).toBe('tech');
    expect(cards.find((c) => c.name === 'Budew')?.role).toBe('tech');
    expect(cards.find((c) => c.name === 'Dragapult ex')?.role).toBe('attacker');
  });

  it('infers trainer roles: supporter, item and stadium', () => {
    const { cards } = parseDeckList(PTCG_EXPORT);
    expect(cards.find((c) => c.name === 'Iono')?.role).toBe('supporter');
    expect(cards.find((c) => c.name === "Boss's Orders")?.role).toBe('supporter');
    // Possessive heuristic ("...'s Scenario") classifies as supporter
    expect(cards.find((c) => c.name === "Professor Turo's Scenario")?.role).toBe('supporter');
    // Known non-supporters despite possessive name
    expect(cards.find((c) => c.name === "Hero's Cape")?.role).toBe('item');
    expect(cards.find((c) => c.name === 'Buddy-Buddy Poffin')?.role).toBe('item');
    // Stadium via substring match ("city")
    expect(cards.find((c) => c.name === 'Slateport City')?.role).toBe('stadium');
  });

  it('assigns the energy role to cards in the energy section', () => {
    const { cards } = parseDeckList(PTCG_EXPORT);
    const energy = cards.find((c) => c.name === 'Basic {P} Energy');
    expect(energy?.type).toBe('Energy');
    expect(energy?.role).toBe('energy');
    expect(energy?.count).toBe(6);
  });

  it('supports German section headers', () => {
    const result = parseDeckList(`Pokemon: 1
2 Pikachu SVI 25

Energie: 1
4 Basis-Pflanzen-Energie SVE 9`);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[1].type).toBe('Energy');
  });

  it('ignores lines before the first section header', () => {
    const result = parseDeckList(`Mein bestes Deck
4 Iono PAL 185
Trainer: 1
4 Iono PAL 185`);
    expect(result.cards).toHaveLength(1);
  });

  it('collects unparseable lines as skipped instead of failing', () => {
    const result = parseDeckList(`Trainer: 2
4 Iono PAL 185
dies ist keine karte`);
    expect(result.cards).toHaveLength(1);
    expect(result.skippedLines).toEqual(['dies ist keine karte']);
  });

  it('rejects lines with an invalid set code or count', () => {
    const result = parseDeckList(`Trainer: 2
0 Iono PAL 185
4 Iono pal 185`);
    expect(result.cards).toHaveLength(0);
    expect(result.skippedLines).toHaveLength(2);
  });

  it('returns an empty result for empty input', () => {
    const result = parseDeckList('');
    expect(result.cards).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

describe('importCards (PUT /api/decks/:id/cards semantics)', () => {
  const parsed: ParsedCard[] = [
    {
      count: 3,
      name: 'Dragapult ex',
      set: 'TWM',
      number: '130',
      type: 'Pokemon',
      role: 'attacker',
    },
    { count: 4, name: 'Iono', set: 'PAL', number: '185', type: 'Trainer', role: 'supporter' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.replaceDeckCards.mockResolvedValue([]);
  });

  it('replaceExisting=true sends exactly the parsed cards as the new full list', async () => {
    await importCards(parsed, true, 7);

    expect(mockedApi.listDeckCards).not.toHaveBeenCalled();
    expect(mockedApi.replaceDeckCards).toHaveBeenCalledTimes(1);
    const [deckId, sent] = mockedApi.replaceDeckCards.mock.calls[0];
    expect(deckId).toBe(7);
    expect(sent.map((c) => c.name)).toEqual(['Dragapult ex', 'Iono']);
  });

  it('replaceExisting=false merges with the current server list, parsed cards winning by name', async () => {
    mockedApi.listDeckCards.mockResolvedValue([
      { id: 1, deckId: 7, cardId: 0, name: 'Iono', count: 2, type: 'Trainer', role: 'supporter' },
      { id: 2, deckId: 7, cardId: 0, name: 'Budew', count: 1, type: 'Pokemon', role: 'tech' },
    ]);

    await importCards(parsed, false, 7);

    const [deckId, sent] = mockedApi.replaceDeckCards.mock.calls[0];
    expect(deckId).toBe(7);
    // Budew kept, Iono overwritten with the parsed count, Dragapult added.
    expect(sent.find((c) => c.name === 'Budew')?.count).toBe(1);
    expect(sent.find((c) => c.name === 'Iono')?.count).toBe(4);
    expect(sent.find((c) => c.name === 'Dragapult ex')?.count).toBe(3);
    expect(sent).toHaveLength(3);
  });

  it('throws without a deckId and performs no request', async () => {
    await expect(importCards(parsed, true, undefined)).rejects.toThrow();
    expect(mockedApi.replaceDeckCards).not.toHaveBeenCalled();
  });
});
