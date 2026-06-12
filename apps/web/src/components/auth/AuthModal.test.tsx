import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { AuthModal } from './AuthModal';
import { authClient } from '../../lib/authClient';

// Tests must never hit the network: the entire auth client is replaced.
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const requestPasswordReset = vi.mocked(authClient.requestPasswordReset);

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

describe('AuthModal — forgot password', () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
  });

  it('switches to the forgot-password form with the email prefilled', async () => {
    const user = userEvent.setup();
    render(<AuthModal onClose={() => undefined} />);

    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByRole('dialog', { name: 'Reset password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('a@example.com');
    // No password field while requesting a reset link
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument();
  });

  it('shows the neutral success message after requesting a reset', async () => {
    requestPasswordReset.mockResolvedValue({
      data: { status: true },
      error: null,
    } as Awaited<ReturnType<typeof authClient.requestPasswordReset>>);
    const user = userEvent.setup();
    render(<AuthModal onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'a@example.com',
      redirectTo: window.location.origin + '/reset-password',
    });
    expect(
      screen.getByText("If an account exists, we've sent you a link. Please check your inbox."),
    ).toBeInTheDocument();
  });

  it('shows the same neutral success message when the API reports an error', async () => {
    requestPasswordReset.mockResolvedValue({
      data: null,
      error: { code: 'USER_NOT_FOUND', message: 'User not found', status: 400, statusText: '' },
    } as Awaited<ReturnType<typeof authClient.requestPasswordReset>>);
    const user = userEvent.setup();
    render(<AuthModal onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(
      screen.getByText("If an account exists, we've sent you a link. Please check your inbox."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('returns to sign-in via the back link', async () => {
    const user = userEvent.setup();
    render(<AuthModal onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));

    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
