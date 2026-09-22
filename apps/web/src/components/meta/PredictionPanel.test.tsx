import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { PredictionPanel } from './PredictionPanel';
import type { FieldAnalysisArchetype, MetaWindow } from '../../lib/api';

// Spec 10 Slice D (specs/archetype-meta-analysis.md, plan
// velvety-finding-bengio.md): PredictionPanel used to keep its own,
// independent archetype list (`LocalFieldEntry[]`, localStorage key
// `tcg-local-meta-field-v1`) alongside LocalMetaPanel's `localMeta` in the
// Zustand store — two places to manage "which decks do I expect locally".
// This suite pins the consolidated behaviour: `localMeta` (store) is the
// only archetype-list input; PredictionPanel only adds a per-entry WEIGHT
// override on top, no independent add/remove UI of its own anymore.

const WINDOW: MetaWindow = { days: 30, online: true, bo1: true };

function archetype(overrides: Partial<FieldAnalysisArchetype> = {}): FieldAnalysisArchetype {
  return {
    archetypeId: 'dragapult-ex',
    archetypeName: 'Dragapult ex',
    sharePct: 12.3,
    winRatePct: 50,
    wins: 10,
    losses: 10,
    ties: 0,
    playerCount: 20,
    icons: [],
    fieldWinRatePct: null,
    coveragePct: 100,
    rank: 1,
    ...overrides,
  };
}

let storeState: { localMeta: string[]; setLocalMeta: (a: string[]) => void };
const setLocalMetaSpy = vi.fn((a: string[]) => {
  storeState.localMeta = a;
});

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

vi.mock('../../lib/api', () => ({
  getMetaMatchups: vi.fn().mockResolvedValue({
    rows: [],
    matchupSource: { trainerHillImportedAt: null },
  }),
  getArchetypeLists: vi.fn().mockResolvedValue({ lists: [], total: 0 }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  setLocalMetaSpy.mockClear();
  storeState = { localMeta: [], setLocalMeta: setLocalMetaSpy };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PredictionPanel — field is derived from the shared localMeta store (Spec 10 Slice D)', () => {
  it('renders one row per store localMeta entry, weighted by the online share by default', () => {
    storeState.localMeta = ['Dragapult ex'];
    render(<PredictionPanel archetypes={[archetype({ sharePct: 12.3 })]} window={WINDOW} />);

    expect(screen.getByText('Dragapult ex')).toBeInTheDocument();
    // seedWeight = Math.max(1, Math.round(sharePct)) = 12
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
  });

  it('applies a stored weight override instead of the online-share default', () => {
    localStorage.setItem(
      'tcg-local-meta-weight-overrides-v1',
      JSON.stringify({ 'dragapult-ex': 40 }),
    );
    storeState.localMeta = ['Dragapult ex'];
    render(<PredictionPanel archetypes={[archetype({ sharePct: 12.3 })]} window={WINDOW} />);

    expect(screen.getByDisplayValue('40')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('12')).not.toBeInTheDocument();
  });

  it('renders nothing in the field editor when localMeta is empty', () => {
    storeState.localMeta = [];
    render(<PredictionPanel archetypes={[archetype()]} window={WINDOW} />);
    expect(screen.getByText(i18n.t('meta:prediction.empty'))).toBeInTheDocument();
  });
});

describe('PredictionPanel — no more independent add/remove UI (LocalMetaPanel owns that now)', () => {
  it('does not render an "add to field" select/button', () => {
    storeState.localMeta = ['Dragapult ex'];
    render(
      <PredictionPanel
        archetypes={[archetype(), archetype({ archetypeId: 'x', archetypeName: 'X' })]}
        window={WINDOW}
      />,
    );
    expect(
      screen.queryByRole('button', { name: i18n.t('meta:prediction.add') }),
    ).not.toBeInTheDocument();
  });

  it('does not render a per-row remove button', () => {
    storeState.localMeta = ['Dragapult ex'];
    render(<PredictionPanel archetypes={[archetype()]} window={WINDOW} />);
    expect(
      screen.queryByRole('button', {
        name: i18n.t('meta:prediction.remove', { archetype: 'Dragapult ex' }),
      }),
    ).not.toBeInTheDocument();
  });
});

describe('PredictionPanel — "seed from online" now writes through the shared store', () => {
  it('calls setLocalMeta with the online archetype names and resets weight overrides', () => {
    localStorage.setItem('tcg-local-meta-weight-overrides-v1', JSON.stringify({ old: 99 }));
    storeState.localMeta = [];
    render(
      <PredictionPanel
        archetypes={[
          archetype({ archetypeName: 'Dragapult ex' }),
          archetype({ archetypeId: 'y', archetypeName: 'Y', sharePct: 5 }),
        ]}
        window={WINDOW}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: i18n.t('meta:prediction.seed') }));

    expect(setLocalMetaSpy).toHaveBeenCalledWith(['Dragapult ex', 'Y']);
    expect(localStorage.getItem('tcg-local-meta-weight-overrides-v1')).toBe('{}');
  });
});

describe('PredictionPanel — one-time legacy field migration (Spec 10 Slice D)', () => {
  it('folds a legacy tcg-local-meta-field-v1 entry into localMeta and the weight overrides, then deletes the legacy key', () => {
    localStorage.setItem(
      'tcg-local-meta-field-v1',
      JSON.stringify([{ archetypeId: 'dragapult-ex', name: 'Dragapult ex', weight: 27 }]),
    );
    storeState.localMeta = [];
    render(<PredictionPanel archetypes={[archetype({ sharePct: 12.3 })]} window={WINDOW} />);

    expect(setLocalMetaSpy).toHaveBeenCalledWith(['Dragapult ex']);
    expect(localStorage.getItem('tcg-local-meta-field-v1')).toBeNull();
    expect(screen.getByDisplayValue('27')).toBeInTheDocument();
  });

  it('does nothing when there is no legacy key', () => {
    storeState.localMeta = ['Dragapult ex'];
    render(<PredictionPanel archetypes={[archetype({ sharePct: 12.3 })]} window={WINDOW} />);
    expect(setLocalMetaSpy).not.toHaveBeenCalled();
  });
});
