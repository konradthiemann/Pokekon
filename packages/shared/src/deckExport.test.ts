import { describe, expect, it } from 'vitest';
import {
  basicEnergyType,
  exportCardsFromDecklist,
  exportDeckList,
  type ExportCard,
} from './deckExport.js';

describe('basicEnergyType', () => {
  it.each([
    ['Basic {D} Energy', 'D'],
    ['Darkness Energy', 'D'],
    ['Basic Darkness Energy', 'D'],
    ['Dark Energy', 'D'],
    ['Basis-Finsternis-Energie', 'D'],
    ['Basic {P} Energy', 'P'],
    ['Basis-Pflanzen-Energie', 'G'],
    ['Lightning Energy', 'L'],
  ])('recognises %s', (name, symbol) => {
    expect(basicEnergyType(name)?.symbol).toBe(symbol);
  });

  it.each(['Jet Energy', 'Mist Energy', 'Luminous Energy', "Boss's Orders"])(
    'does not treat %s as basic Energy',
    (name) => {
      expect(basicEnergyType(name)).toBeNull();
    },
  );
});

describe('exportDeckList', () => {
  const deck: ExportCard[] = [
    { name: "N's Zorua", count: 4, type: 'Pokemon', set: 'JTG', number: '97' },
    { name: "N's Zoroark ex", count: 4, type: 'Pokemon', set: 'JTG', number: '98' },
    { name: "Boss's Orders", count: 3, type: 'Trainer', set: 'MEG', number: '114' },
    { name: 'Darkness Energy', count: 8, type: 'Energy' },
  ];

  it('writes PTCGL sections with summed headers and a total line', () => {
    const { text, totalCards, missingPrints } = exportDeckList(deck);
    expect(text).toBe(
      [
        'Pokémon: 8',
        "4 N's Zorua JTG 97",
        "4 N's Zoroark ex JTG 98",
        '',
        'Trainer: 3',
        "3 Boss's Orders MEG 114",
        '',
        'Energy: 8',
        '8 Basic {D} Energy SVE 7',
        '',
        'Total Cards: 19',
      ].join('\n'),
    );
    expect(totalCards).toBe(19);
    expect(missingPrints).toEqual([]);
  });

  it('uses German headers on request', () => {
    const { text } = exportDeckList(deck, { lang: 'de' });
    expect(text).toContain('Energie: 8');
    expect(text).toContain('Karten insgesamt: 19');
  });

  it('keeps an explicit basic Energy print', () => {
    const { text } = exportDeckList([
      { name: 'Basic {D} Energy', count: 5, type: 'Energy', set: 'SVE', number: '15' },
    ]);
    expect(text).toContain('5 Basic {D} Energy SVE 15');
  });

  it('reports cards without a print instead of hiding them', () => {
    const { text, missingPrints } = exportDeckList([
      { name: 'Munkidori', count: 2, type: 'Pokemon' },
    ]);
    expect(text).toContain('2 Munkidori\n');
    expect(missingPrints).toEqual(['Munkidori']);
  });

  it('merges duplicate lines of the same print and omits empty sections', () => {
    const { text } = exportDeckList([
      { name: 'Darkness Energy', count: 4, type: 'Energy' },
      { name: 'Basic {D} Energy', count: 4, type: 'Energy' },
    ]);
    expect(text).toBe('Energy: 8\n8 Basic {D} Energy SVE 7\n\nTotal Cards: 8');
  });
});

describe('exportCardsFromDecklist', () => {
  it('maps a Limitless decklist and round-trips through the exporter', () => {
    const cards = exportCardsFromDecklist({
      pokemon: [{ name: "N's Zorua", count: 4, set: 'JTG', number: '97' }],
      trainer: [{ name: 'Secret Box', count: 1, set: 'TWM', number: '163' }],
      energy: [{ name: 'Darkness Energy', count: 8, set: 'SVE', number: '15' }],
    });
    expect(cards.map((c) => c.type)).toEqual(['Pokemon', 'Trainer', 'Energy']);
    expect(exportDeckList(cards).text).toContain('8 Basic {D} Energy SVE 15');
  });
});
