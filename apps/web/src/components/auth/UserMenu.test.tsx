import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { UserMenu } from './UserMenu';
import { authClient } from '../../lib/authClient';

// Tests must never hit the network: the entire auth client is replaced.
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

const useSessionMock = vi.mocked(authClient.useSession);

beforeAll(async () => {
  // Pin the language so assertions on English strings are deterministic.
  await i18n.changeLanguage('en');
});

describe('UserMenu', () => {
  it('shows a sign-in button when there is no session', () => {
    useSessionMock.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserMenu />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows the user row with sign-out button when signed in', () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: 'u1',
          name: 'Ash Ketchum',
          email: 'ash@example.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {},
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof authClient.useSession>);

    render(<UserMenu />);

    expect(screen.getByText('Ash Ketchum')).toBeInTheDocument();
    expect(screen.getByText('ash@example.com')).toBeInTheDocument();
    // No image on the account → initials avatar
    expect(screen.getByText('AK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
