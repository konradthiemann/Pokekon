import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CoachSidebar } from './CoachSidebar';

let store: { coachTab: string; setCoachTab: ReturnType<typeof vi.fn> };
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('../auth/AccountPanel', () => ({
  AccountPanel: () => <div data-testid="account-panel" />,
}));
vi.mock('../settings/AiSettingsModal', () => ({ AiSettingsModal: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = { coachTab: 'tools', setCoachTab: vi.fn() };
});

describe('CoachSidebar (Spec 7 §4, desktop)', () => {
  it('lists the five areas including Tools and marks the active one', async () => {
    render(<CoachSidebar />);
    const nav = screen.getByRole('navigation');
    const items = [...nav.querySelectorAll('button')].map((b) => b.textContent);
    expect(items).toEqual(['Start', 'Deck', 'Coaching', 'Opponents', 'Tools']);
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Coaching' }));
    expect(store.setCoachTab).toHaveBeenCalledWith('coaching');
  });

  it('contains the account area', () => {
    render(<CoachSidebar />);
    expect(screen.getByTestId('account-panel')).toBeInTheDocument();
  });
});
