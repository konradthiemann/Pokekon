import { useState } from 'react';
import {
  LayoutDashboard, Layers, Lightbulb,
  RefreshCw, Zap, Globe, CheckCircle2, AlertCircle, BarChart2,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';

const NAV_ITEMS = [
  { id: 'overview',         label: 'Overview',        Icon: LayoutDashboard },
  { id: 'meta',             label: 'Meta',            Icon: BarChart2 },
  { id: 'deck',             label: 'My Deck',         Icon: Layers },
  { id: 'recommendations',  label: 'Recommendations', Icon: Lightbulb },
] as const;

export function Sidebar() {
  const {
    activeTab, setActiveTab,
    refresh, isLoading, lastRefreshed,
    syncMeta, isSyncing, syncProgress, lastSynced, syncError,
  } = useDashboardStore();

  const [syncDone, setSyncDone] = useState(false);

  const handleSyncMeta = async () => {
    setSyncDone(false);
    try {
      await syncMeta();
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 4000);
    } catch { /* error shown via store */ }
  };

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white/[0.05] backdrop-blur-md border-r border-white/[0.10] min-h-screen relative z-10" style={{ boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/[0.08]">
        <Zap className="w-5 h-5 text-brand-400" />
        <span className="font-bold text-white text-sm tracking-wide">TCG Meta</span>
        <span className="ml-auto text-[10px] text-white/30 tracking-widest uppercase">Dashboard</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 mt-2">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-400/30 shadow-[0_0_12px_rgba(96,165,250,0.15)]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="p-4 border-t border-white/[0.08] space-y-2">
        {/* Sync Live Meta */}
        <button
          onClick={handleSyncMeta}
          disabled={isSyncing || isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border border-brand-400/25 transition-colors disabled:opacity-50"
        >
          {syncDone
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            : <Globe className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
          }
          {isSyncing ? 'Syncing…' : syncDone ? 'Synced!' : 'Sync Live Meta'}
        </button>

        {isSyncing && syncProgress && (
          <p className="text-center text-gray-500 text-xs truncate px-1" title={syncProgress}>
            {syncProgress}
          </p>
        )}
        {!isSyncing && syncError && (
          <div className="flex items-start gap-1 text-xs text-red-500 px-1">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-words">{syncError}</span>
          </div>
        )}
        {!isSyncing && !syncError && lastSynced && (
          <p className="text-center text-gray-600 text-xs">
            Synced {lastSynced.toLocaleTimeString()}
          </p>
        )}

        {/* Refresh local */}
        <button
          onClick={refresh}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white/80 border border-white/[0.08] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
        {lastRefreshed && (
          <p className="text-center text-gray-600 text-xs">{lastRefreshed.toLocaleTimeString()}</p>
        )}
      </div>
    </aside>
  );
}
