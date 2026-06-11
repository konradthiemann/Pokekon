import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { AuthModal } from './AuthModal';

/**
 * Derives up to two initials from a display name (fallback: email) for the
 * avatar circle when the account has no profile image.
 */
function initialsOf(name: string, email: string): string {
  const source = name.trim() !== '' ? name : email;
  const parts = source.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + second).toUpperCase();
}

/**
 * Sidebar-footer auth entry point.
 *
 * Signed out → compact "Sign in" button that opens the AuthModal (local
 * state, same pattern as AddLogModal in BottomNav). Signed in → user row
 * with avatar/initials + sign-out icon button. While the session request is
 * pending, a small pulse skeleton avoids a sign-in/out flash.
 *
 * Session is read via Better Auth's reactive `useSession` — a successful
 * sign-in inside the modal updates this component without extra wiring.
 */
export function UserMenu() {
  const { t } = useTranslation('auth');
  const { data: session, isPending } = authClient.useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5 animate-pulse" aria-hidden="true">
        <div className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2 w-20 rounded bg-white/[0.08]" />
          <div className="h-2 w-28 rounded bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white/80 border border-white/[0.08] transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
          {t('userMenu.signIn')}
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </>
    );
  }

  const { user } = session;

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 min-w-0">
      {user.image != null && user.image !== '' ? (
        <img src={user.image} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="w-7 h-7 rounded-full shrink-0 bg-brand-500/25 border border-brand-400/30 text-brand-300 text-[10px] font-bold flex items-center justify-center"
        >
          {initialsOf(user.name, user.email)}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white/80 truncate">{user.name}</p>
        <p className="text-[10px] text-white/40 truncate">{user.email}</p>
      </div>
      <button
        onClick={() => void authClient.signOut()}
        aria-label={t('userMenu.signOut')}
        title={t('userMenu.signOut')}
        className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
