import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import type { FieldAnalysisArchetype } from '../../../lib/api';
import { getArchetypeSynthesis } from '../../../lib/api';
import { importCards } from '../../../lib/deckImport';
import { OnboardingFlow } from './OnboardingFlow';

interface StoreMock {
  decks: { id: number; archetype: string; archetypeName: string }[];
  setActiveArchetype: ReturnType<typeof vi.fn>;
  createNewDeck: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  setCoachTab: ReturnType<typeof vi.fn>;
}
let store: StoreMock;
vi.mock('../../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

let field: FieldAnalysisArchetype[] = [];
vi.mock('../../../hooks/useFieldAnalysis', () => ({
  useFieldAnalysis: () => ({ data: { archetypes: field }, isLoading: false, error: false }),
}));

vi.mock('../../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api')>()),
  getArchetypeSynthesis: vi.fn(),
}));
vi.mock('../../../lib/deckImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/deckImport')>()),
  importCards: vi.fn(),
}));
vi.mock('../../deck/ImportDeckModal', () => ({
  ImportDeckModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="import-stub">
      <button onClick={onClose}>close-import</button>
    </div>
  ),
}));

const mockedSynthesis = vi.mocked(getArchetypeSynthesis);
const mockedImport = vi.mocked(importCards);

function fieldEntry(archetypeId: string, archetypeName: string, sharePct: number) {
  return { archetypeId, archetypeName, sharePct, icons: [] } as unknown as FieldAnalysisArchetype;
}
const MEDOID = {
  pokemon: [{ name: 'Dragapult ex', count: 3 }],
  trainer: [{ name: 'Ultra Ball', count: 4 }],
  energy: [{ name: 'Basic Psychic Energy', count: 5 }],
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  field = Array.from({ length: 12 }, (_, i) =>
    fieldEntry(`deck-${i}`, `Deck ${i}`, i === 11 ? 12.34 : i + 1),
  );
  field.push(fieldEntry('dragapult-ex', 'Dragapult ex', 0.5));
  store = {
    decks: [],
    setActiveArchetype: vi.fn().mockResolvedValue(undefined),
    createNewDeck: vi.fn().mockResolvedValue(77),
    refresh: vi.fn().mockResolvedValue(undefined),
    setCoachTab: vi.fn(),
  };
  mockedSynthesis.mockReset().mockResolvedValue({
    clusters: [{ representative: MEDOID }],
  } as never);
  mockedImport.mockReset().mockResolvedValue(undefined);
});

async function chooseArchetype(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('OnboardingFlow (Spec 7 §5.1)', () => {
  it('step 1 lists the 10 most-played field archetypes with their share', () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    const list = screen.getByRole('list', { name: /most played/i });
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(10);
    expect(buttons[0]).toHaveTextContent('Deck 11');
    expect(buttons[0]).toHaveTextContent('12.3 %');
  });

  it('step 1 search filters known and field archetypes by name and slug', async () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zoroark');
    expect(screen.getByRole('button', { name: /N's Zoroark/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'deck-3');
    expect(screen.getByRole('button', { name: /Deck 3\b/ })).toBeInTheDocument();
  });

  it('choosing an archetype calls setActiveArchetype(slug) and moves to the list step', async () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    expect(store.setActiveArchetype).toHaveBeenCalledWith('deck-11');
    expect(await screen.findByRole('button', { name: /Take the meta list/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paste my own list/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Later/ })).toBeInTheDocument();
  });

  it('"take meta list" creates a deck and imports the best cluster medoid', async () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    const take = await screen.findByRole('button', { name: /Take the meta list/ });
    await waitFor(() => expect(take).toBeEnabled());
    await userEvent.click(take);
    await waitFor(() => expect(mockedImport).toHaveBeenCalled());
    expect(store.createNewDeck).toHaveBeenCalledWith('deck-11', 'Deck 11', 'Meta list');
    const [cards, replace, deckId] = mockedImport.mock.calls[0]!;
    expect(replace).toBe(true);
    expect(deckId).toBe(77);
    expect(cards.map((c) => [c.name, c.count])).toEqual([
      ['Dragapult ex', 3],
      ['Ultra Ball', 4],
      ['Basic Psychic Energy', 5],
    ]);
    expect(await screen.findByLabelText(/TCG Live name/)).toBeInTheDocument();
  });

  it('disables "take meta list" with a hint when the archetype has no clusters', async () => {
    mockedSynthesis.mockResolvedValue({ clusters: [] } as never);
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    expect(await screen.findByText(/no tournament lists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take the meta list/ })).toBeDisabled();
  });

  it('"paste my own list" creates an empty deck and opens the import dialog', async () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    await userEvent.click(await screen.findByRole('button', { name: /Paste my own list/ }));
    expect(store.createNewDeck).toHaveBeenCalledWith('deck-11', 'Deck 11', 'My list');
    await userEvent.click(await screen.findByRole('button', { name: 'close-import' }));
    expect(await screen.findByLabelText(/TCG Live name/)).toBeInTheDocument();
  });

  it('"later" skips to step 3 without creating a deck', async () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    await userEvent.click(await screen.findByRole('button', { name: /Later/ }));
    expect(store.createNewDeck).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/TCG Live name/)).toBeInTheDocument();
  });

  it('skips step 2 when a deck of the archetype already exists', async () => {
    store.decks = [{ id: 5, archetype: 'deck-11', archetypeName: 'Deck 11' }];
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    await chooseArchetype(/Deck 11/);
    expect(await screen.findByLabelText(/TCG Live name/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take the meta list/ })).toBeNull();
  });

  it('step 3 stores the TCG Live name and finishing lands on Start', async () => {
    const onDone = vi.fn();
    render(<OnboardingFlow mode="firstRun" onDone={onDone} />);
    await chooseArchetype(/Deck 11/);
    await userEvent.click(await screen.findByRole('button', { name: /Later/ }));
    await userEvent.type(await screen.findByLabelText(/TCG Live name/), 'Gtmap');
    await userEvent.click(screen.getByRole('button', { name: /Save and start/ }));
    expect(localStorage.getItem('tcg-player-name')).toBe('Gtmap');
    expect(store.setCoachTab).toHaveBeenCalledWith('start');
    expect(onDone).toHaveBeenCalled();
  });

  it('step 3 can be skipped', async () => {
    const onDone = vi.fn();
    render(<OnboardingFlow mode="firstRun" onDone={onDone} />);
    await chooseArchetype(/Deck 11/);
    await userEvent.click(await screen.findByRole('button', { name: /Later/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Skip/ }));
    expect(localStorage.getItem('tcg-player-name')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('switching archetype skips the name step and can be cancelled', async () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    render(<OnboardingFlow mode="switchArchetype" onDone={onDone} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalled();
    await chooseArchetype(/Deck 11/);
    await userEvent.click(await screen.findByRole('button', { name: /Later/ }));
    expect(onDone).toHaveBeenCalled();
    expect(screen.queryByLabelText(/TCG Live name/)).toBeNull();
  });

  it('uses real buttons that are at least 44 px tall', () => {
    render(<OnboardingFlow mode="firstRun" onDone={() => {}} />);
    for (const b of screen.getAllByRole('button')) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.className).toMatch(/min-h-\[44px\]|\bbtn\b|btn-/);
    }
  });
});
