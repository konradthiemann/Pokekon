import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { WelcomeScreen } from './WelcomeScreen';

// Tests must never hit the network: the entire auth client is replaced.
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

beforeAll(async () => {
  // Pin the language so assertions on English strings are deterministic.
  await i18n.changeLanguage('en');
});

describe('WelcomeScreen', () => {
  it('renders the sign-in CTA for visitors without a session', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText('TCG Meta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in or create account' })).toBeInTheDocument();
    // No auth dialog until the CTA is clicked
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the AuthModal when the CTA is clicked', async () => {
    const user = userEvent.setup();
    render(<WelcomeScreen />);

    await user.click(screen.getByRole('button', { name: 'Sign in or create account' }));

    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
  });
});
