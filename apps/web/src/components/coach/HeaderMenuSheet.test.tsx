import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { HeaderMenuSheet } from './HeaderMenuSheet';

let store: { setCoachTab: ReturnType<typeof vi.fn> };
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('../auth/AccountPanel', () => ({
  AccountPanel: () => <div data-testid="account-panel" />,
}));
vi.mock('../settings/AiSettingsModal', () => ({ AiSettingsModal: () => null }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = { setCoachTab: vi.fn() };
});

describe('HeaderMenuSheet (Spec 7 §4, mobile menu)', () => {
  it('renders nothing when closed', () => {
    render(<HeaderMenuSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog with Tools and the account area', () => {
    render(<HeaderMenuSheet open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('account-panel')).toBeInTheDocument();
  });

  it('"Tools" opens the tools page and closes', async () => {
    const onClose = vi.fn();
    render(<HeaderMenuSheet open onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tools' }));
    expect(store.setCoachTab).toHaveBeenCalledWith('tools');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<HeaderMenuSheet open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('HeaderMenuSheet focus management', () => {
  it('moves focus into the dialog on open and back to the trigger on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(<HeaderMenuSheet open onClose={() => {}} />);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    rerender(<HeaderMenuSheet open={false} onClose={() => {}} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
