import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { NAV_ITEMS } from './navItems';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LegalLinks } from './LegalLinks';
import { UserMenu } from '../auth/UserMenu';
import { PokeballMark } from '../shared/PokeballMark';

export function Sidebar() {
  const { t } = useTranslation('layout');
  const {
    activeTab,
    setActiveTab,
    refresh,
    isLoading,
    lastRefreshed,
    syncMeta,
    isSyncing,
    syncProgress,
    lastSynced,
    syncError,
  } = useDashboardStore();

  const [syncDone, setSyncDone] = useState(false);

  const handleSyncMeta = async () => {
    setSyncDone(false);
    try {
      await syncMeta();
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 4000);
    } catch {
      /* error shown via store */
    }
  };

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white/80 backdrop-blur-md border-r border-slate-200 min-h-screen relative z-10 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-200">
        <PokeballMark className="w-7 h-7 drop-shadow-sm" />
        <span className="font-extrabold text-slate-900 text-sm tracking-wide">TCG Meta</span>
        <span className="ml-auto text-[10px] text-slate-400 tracking-widest uppercase font-bold">
          {t('sidebar.dashboard')}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 mt-2">
        {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all ${
                active
                  ? 'bg-brand-100 text-brand-800 border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="p-4 border-t border-slate-200 space-y-2">
        {/* Sync Live Meta */}
        <button
          onClick={handleSyncMeta}
          disabled={isSyncing || isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors disabled:opacity-50"
        >
          {syncDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          ) : (
            <Globe
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
          )}
          {isSyncing
            ? t('sidebar.syncing')
            : syncDone
              ? t('sidebar.synced')
              : t('sidebar.syncLiveMeta')}
        </button>

        {isSyncing && syncProgress && (
          <p className="text-center text-slate-500 text-xs truncate px-1" title={syncProgress}>
            {syncProgress}
          </p>
        )}
        {!isSyncing && syncError && (
          <div className="flex items-start gap-1 text-xs text-red-700 px-1 font-semibold">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-words">{syncError}</span>
          </div>
        )}
        {!isSyncing && !syncError && lastSynced && (
          <p className="text-center text-slate-500 text-xs">
            {t('sidebar.syncedAt', { time: lastSynced.toLocaleTimeString() })}
          </p>
        )}

        {/* Refresh local */}
        <button
          onClick={refresh}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {t('sidebar.refreshData')}
        </button>
        {lastRefreshed && (
          <p className="text-center text-slate-500 text-xs">{lastRefreshed.toLocaleTimeString()}</p>
        )}

        <div className="pt-1 border-t border-slate-200">
          <UserMenu />
        </div>

        <div className="flex justify-center pt-1">
          <LanguageSwitcher />
        </div>

        <LegalLinks className="pt-1" />
      </div>
    </aside>
  );
}
