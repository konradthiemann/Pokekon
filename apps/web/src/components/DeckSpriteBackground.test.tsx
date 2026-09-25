import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckSpriteBackground } from './DeckSpriteBackground';

interface StoreMock {
  activeArchetypeId: string | null;
  activeDeck: { archetype: string } | null;
}
let storeState: StoreMock;
vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: (selector: (s: StoreMock) => unknown) => selector(storeState),
}));

// The image probe is covered by its own test; here every first candidate "loads".
vi.mock('../hooks/useFirstLoadableImage', () => ({
  useFirstLoadableImage: (urls: readonly string[]) => urls[0] ?? null,
}));

function spriteLayer(container: HTMLElement): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('div')].find((d) =>
    d.style.backgroundImage.includes('url('),
  );
}

beforeEach(() => {
  storeState = { activeArchetypeId: null, activeDeck: null };
});

describe('DeckSpriteBackground (Spec 7 §9a, AC 9)', () => {
  it('uses activeArchetypeId even without an active deck', () => {
    storeState = { activeArchetypeId: 'n-zoroark', activeDeck: null };
    const { container } = render(<DeckSpriteBackground />);
    expect(spriteLayer(container)?.style.backgroundImage).toContain('/gen9/zoroark.png');
  });

  it('prefers the chosen archetype over the active deck', () => {
    storeState = { activeArchetypeId: 'n-zoroark', activeDeck: { archetype: 'dragapult-ex' } };
    const { container } = render(<DeckSpriteBackground />);
    expect(spriteLayer(container)?.style.backgroundImage).toContain('zoroark.png');
  });

  it('falls back to activeDeck.archetype while no archetype is chosen', () => {
    storeState = { activeArchetypeId: null, activeDeck: { archetype: 'dragapult-ex' } };
    const { container } = render(<DeckSpriteBackground />);
    expect(spriteLayer(container)?.style.backgroundImage).toContain('dragapult.png');
  });

  // jsdom drops multi-gradient `background` values, so the tint input is
  // asserted via data attributes instead of the computed gradient.
  it('tints by the chosen archetype (n-zoroark → rgba(167,139,250,0.40))', () => {
    storeState = { activeArchetypeId: 'n-zoroark', activeDeck: { archetype: 'dragapult-ex' } };
    const { container } = render(<DeckSpriteBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.archetype).toBe('n-zoroark');
    expect(root.dataset.tint).toBe('rgba(167,139,250,0.40)');
  });

  it('renders no sprite layer without any archetype', () => {
    const { container } = render(<DeckSpriteBackground />);
    expect(spriteLayer(container)).toBeUndefined();
  });
});
