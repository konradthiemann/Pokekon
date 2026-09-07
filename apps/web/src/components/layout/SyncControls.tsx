import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';

export function SyncControls() {
  const { t } = useTranslation('layout');
  const {
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
    <>
      {/* Sync Live Meta */}
      <button
        onClick={handleSyncMeta}
        disabled={isSyncing || isLoading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors disabled:opacity-50"
      >
        {syncDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
        ) : (
          <Globe className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
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
    </>
  );
}
