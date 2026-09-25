import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FieldAnalysisArchetype, MetaWindow } from '../../lib/api';
import { OpponentsPage } from './OpponentsPage';

const WINDOW: MetaWindow = { days: 14, online: true, bo1: true };
interface StoreMock {
  metaWindow: MetaWindow;
  setMetaWindow: ReturnType<typeof vi.fn>;
  archetypeStats: { archetype: string }[];
}
let store: StoreMock;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

let fieldState: {
  data: { archetypes: FieldAnalysisArchetype[] } | null;
  isLoading: boolean;
  error: boolean;
};
let requestedWindow: MetaWindow | null = null;
vi.mock('../../hooks/useFieldAnalysis', () => ({
  useFieldAnalysis: (w: MetaWindow) => {
    requestedWindow = w;
    return fieldState;
  },
}));

const seen: Record<string, unknown> = {};
vi.mock('../../components/deck/LocalMetaPanel', () => ({
  LocalMetaPanel: () => <div data-testid="local-meta" />,
}));
vi.mock('../../components/meta/PredictionPanel', () => ({
  PredictionPanel: (p: { archetypes: unknown; window: unknown }) => {
    seen.prediction = p;
    return <div data-testid="prediction" />;
  },
}));
vi.mock('../../components/meta/MyMatchupsTable', () => ({
  MyMatchupsTable: (p: { stats: unknown }) => {
    seen.matchups = p.stats;
    return <div data-testid="my-matchups" />;
  },
}));
vi.mock('../../components/meta/MetaWindowControl', () => ({
  MetaWindowControl: (p: {
    window: MetaWindow;
    onDaysChange: (d: number) => void;
    onOnlineBo1Change: (v: boolean) => void;
  }) => (
    <div data-testid="window-control">
      <button onClick={() => p.onDaysChange(30)}>days-30</button>
      <button onClick={() => p.onOnlineBo1Change(false)}>all-events</button>
    </div>
  ),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
  store = {
    metaWindow: WINDOW,
    setMetaWindow: vi.fn(),
    archetypeStats: [{ archetype: 'Gardevoir ex' }],
  };
  fieldState = {
    data: { archetypes: [{ archetypeId: 'gardevoir-ex' } as FieldAnalysisArchetype] },
    isLoading: false,
    error: false,
  };
});

describe('OpponentsPage (Spec 7 §5.5, Scheibe 1)', () => {
  it('renders LocalMetaPanel, PredictionPanel and MyMatchupsTable', () => {
    render(<OpponentsPage />);
    expect(screen.getByTestId('local-meta')).toBeInTheDocument();
    expect(screen.getByTestId('prediction')).toBeInTheDocument();
    expect(screen.getByTestId('my-matchups')).toBeInTheDocument();
    expect(seen.matchups).toEqual([{ archetype: 'Gardevoir ex' }]);
  });

  it('passes the store metaWindow and the field archetypes to PredictionPanel', () => {
    render(<OpponentsPage />);
    expect(requestedWindow).toEqual(WINDOW);
    expect(seen.prediction).toEqual({
      archetypes: [{ archetypeId: 'gardevoir-ex' }],
      window: WINDOW,
    });
  });

  it('shows a loading state and an error card for the field analysis', () => {
    fieldState = { data: null, isLoading: true, error: false };
    const { unmount } = render(<OpponentsPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading/);
    expect(screen.queryByTestId('prediction')).toBeNull();
    unmount();
    fieldState = { data: null, isLoading: false, error: true };
    render(<OpponentsPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('binds MetaWindowControl to setMetaWindow (online and Bo1 move together)', () => {
    render(<OpponentsPage />);
    screen.getByText('days-30').click();
    expect(store.setMetaWindow).toHaveBeenCalledWith({ days: 30, online: true, bo1: true });
    screen.getByText('all-events').click();
    expect(store.setMetaWindow).toHaveBeenCalledWith({ days: 14, online: false, bo1: false });
  });
});
