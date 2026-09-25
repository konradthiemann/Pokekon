import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { ArchetypeDetail } from './ArchetypeDetail';

// The detail view fetches on mount; keep every request pending so only the
// header renders (this test is about the back button only).
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    getArchetypeAnalysis: vi.fn(pending),
    getArchetypeLists: vi.fn(pending),
    getArchetypeTournaments: vi.fn(pending),
  };
});
vi.mock('./ArchetypeRecommendationPanel', () => ({ ArchetypeRecommendationPanel: () => null }));
vi.mock('./TournamentBestListPanel', () => ({ TournamentBestListPanel: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const props = {
  archetypeId: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  window: { days: 30, online: true, bo1: true },
  onDaysChange: () => {},
  onOnlineBo1Change: () => {},
  archetypeStats: [],
  archetypes: [],
  localMeta: [],
};

describe('ArchetypeDetail back button (Spec 7 §5.6: embedded under Tools)', () => {
  it('shows the back button with onBack', () => {
    render(<ArchetypeDetail {...props} onBack={() => {}} />);
    expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument();
  });

  it('hides the back button when onBack is omitted', () => {
    render(<ArchetypeDetail {...props} />);
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  });
});
