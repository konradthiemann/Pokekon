import { useTranslation } from 'react-i18next';
import { Brain, LogOut } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { LegalLinks } from '../layout/LegalLinks';
import { SyncControls } from '../layout/SyncControls';

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

/** Round avatar: profile image, else initials. */
export function AccountAvatar({
  user,
}: {
  user: { name: string; email: string; image?: string | null };
}) {
  return user.image != null && user.image !== '' ? (
    <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 text-brand-800 text-[11px] font-bold flex items-center justify-center"
    >
      {initialsOf(user.name, user.email)}
    </span>
  );
}

/**
 * Account content — identity, AI settings, sync, language, sign-out, legal
 * links. Shared by the mobile account sheet and the archetype-first UI's
 * header menu (Spec 7 §4: settings live in the account area for everyone,
 * decision E16). The AI settings modal is owned by the caller.
 */
export function AccountPanel({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  const { t } = useTranslation('auth');
  const { data: session } = authClient.useSession();
  if (!session) return null;
  const { user } = session;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <AccountAvatar user={user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
          <p className="text-xs text-slate-600 truncate">{user.email}</p>
        </div>
      </div>

      <button
        onClick={onOpenAiSettings}
        className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-brand-700" aria-hidden="true" />
        {t('aiSettings.title')}
      </button>

      <div data-testid="sync-controls" className="border-t border-slate-200 pt-4 mb-3 space-y-2">
        <SyncControls />
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <LanguageSwitcher />
        <button
          onClick={() => void authClient.signOut()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          {t('userMenu.signOut')}
        </button>
      </div>

      <LegalLinks className="mt-4" />
    </div>
  );
}
