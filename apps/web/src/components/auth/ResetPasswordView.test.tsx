import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { ResetPasswordView } from './ResetPasswordView';
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

const resetPassword = vi.mocked(authClient.resetPassword);

type ResetResult = Awaited<ReturnType<typeof authClient.resetPassword>>;

/** Points jsdom's location at /reset-password with the given query string. */
function setLocation(search: string) {
  window.history.replaceState(null, '', `/reset-password${search}`);
}

beforeAll(async () => {
  // Pin the language so assertions on English strings are deterministic.
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  resetPassword.mockReset();
});

describe('ResetPasswordView', () => {
  it('renders the password form when a token is present', () => {
    setLocation('?token=tok123');
    render(<ResetPasswordView />);

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save password' })).toBeInTheDocument();
  });

  it('shows the missing-token state without a token', () => {
    setLocation('');
    render(<ResetPasswordView />);

    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This link is incomplete — the security token is missing.',
    );
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
  });

  it('shows the invalid-token state for ?error=INVALID_TOKEN', () => {
    setLocation('?error=INVALID_TOKEN');
    render(<ResetPasswordView />);

    expect(screen.getByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
  });

  it('rejects mismatching passwords without calling the API', async () => {
    setLocation('?token=tok123');
    const user = userEvent.setup();
    render(<ResetPasswordView />);

    await user.type(screen.getByLabelText('New password'), 'longenough1');
    await user.type(screen.getByLabelText('Repeat password'), 'different1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('submits the new password and shows the success state', async () => {
    setLocation('?token=tok123');
    resetPassword.mockResolvedValue({ data: { status: true }, error: null } as ResetResult);
    const user = userEvent.setup();
    render(<ResetPasswordView />);

    await user.type(screen.getByLabelText('New password'), 'longenough1');
    await user.type(screen.getByLabelText('Repeat password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'longenough1', token: 'tok123' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your password has been changed. You can sign in now.',
    );
    expect(screen.getByRole('button', { name: 'Go to sign in' })).toBeInTheDocument();
  });

  it('switches to the invalid-token state when the server rejects the token', async () => {
    setLocation('?token=expired');
    resetPassword.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_TOKEN', message: 'invalid token', status: 400, statusText: '' },
    } as ResetResult);
    const user = userEvent.setup();
    render(<ResetPasswordView />);

    await user.type(screen.getByLabelText('New password'), 'longenough1');
    await user.type(screen.getByLabelText('Repeat password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
  });
});
