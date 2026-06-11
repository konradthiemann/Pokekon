import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { AuthModal } from './AuthModal';

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
  // Pin the language so assertions on English strings are deterministic,
  // regardless of the detector's localStorage/navigator result.
  await i18n.changeLanguage('en');
});

describe('AuthModal', () => {
  it('renders the sign-in form with email and password fields', () => {
    render(<AuthModal onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    // Name field only exists in sign-up mode
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('switches to the sign-up form with an additional name field', async () => {
    const user = userEvent.setup();
    render(<AuthModal onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }));

    expect(screen.getByRole('dialog', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AuthModal onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
