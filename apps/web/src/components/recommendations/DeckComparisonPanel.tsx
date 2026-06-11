import { useDashboardStore } from '../../store/dashboardStore';
import { RefreshCw, TrendingUp, TrendingDown, ArrowRightLeft, GitCompare } from 'lucide-react';
import type { CardStat } from '../../lib/deckComparison';

function FrequencyBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">{pct}%</span>
    </div>
  );
}

function CardRow({ card }: { card: CardStat }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-800/40 last:border-0">
      <span
        className={`text-xs px-1.5 py-0.5 rounded font-mono uppercase tracking-wide ${
          card.cardType === 'pokemon'
            ? 'bg-red-900/40 text-red-400'
            : card.cardType === 'trainer'
              ? 'bg-blue-900/40 text-blue-400'
              : 'bg-orange-900/40 text-orange-400'
        }`}
      >
        {card.cardType[0]}
      </span>
      <span className="flex-1 text-sm text-gray-200 truncate">{card.name}</span>
      <FrequencyBar pct={card.frequency} />
      {card.inUserDeck && (
        <span className="text-xs text-gray-500 tabular-nums w-14 text-right">
          you: {card.userCount} / avg: {card.topAvgCount}
        </span>
      )}
    </div>
  );
}

export function DeckComparisonPanel() {
  const {
    deckArchSlug,
    comparisonResult,
    isComparing,
    compareProgress,
    compareError,
    runDeckComparison,
    setActiveTab,
  } = useDashboardStore();

  if (!deckArchSlug) {
    return (
      <div className="card p-5 flex items-start gap-3">
        <GitCompare className="w-5 h-5 text-gray-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-gray-400 font-medium">Deck comparison not set up</p>
          <p className="text-xs text-gray-500 mt-1">
            Go to{' '}
            <button onClick={() => setActiveTab('deck')} className="text-brand-400 underline">
              My Deck
            </button>{' '}
            and set your archetype slug (e.g. <code className="text-brand-400">n-zoroark</code>) to
            compare your list against tournament results.
          </p>
        </div>
      </div>
    );
  }

  const r = comparisonResult;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-brand-400" />
            List Comparison — <code className="text-brand-300 font-mono">{deckArchSlug}</code>
          </h3>
          {r && (
            <p className="text-xs text-gray-500 mt-0.5">
              {r.listsAnalyzed} lists · {r.topListsAnalyzed} top-placing ·{' '}
              {r.fetchedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={runDeckComparison}
          disabled={isComparing}
          className="btn-primary text-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isComparing ? 'animate-spin' : ''}`} />
          {isComparing ? 'Comparing…' : r ? 'Refresh' : 'Compare'}
        </button>
      </div>

      {isComparing && compareProgress && (
        <p className="text-xs text-gray-500 animate-pulse">{compareProgress}</p>
      )}

      {compareError && (
        <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
          {compareError}
        </div>
      )}

      {r && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Suggested adds */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Consider Adding ({r.suggestedAdds.length})
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.suggestedAdds.length === 0 ? (
                <p className="text-xs text-gray-600 py-3">
                  None — your deck covers the high-freq cards.
                </p>
              ) : (
                r.suggestedAdds.map((c) => <CardRow key={c.name} card={c} />)
              )}
            </div>
          </div>

          {/* Suggested removes */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Consider Removing ({r.suggestedRemoves.length})
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.suggestedRemoves.length === 0 ? (
                <p className="text-xs text-gray-600 py-3">None — everything looks standard.</p>
              ) : (
                r.suggestedRemoves.map((c) => <CardRow key={c.name} card={c} />)
              )}
            </div>
          </div>

          {/* Count adjustments */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Count Adjustments ({r.countAdjustments.length})
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.countAdjustments.length === 0 ? (
                <p className="text-xs text-gray-600 py-3">
                  Counts look good across high-freq cards.
                </p>
              ) : (
                r.countAdjustments.map((adj) => (
                  <div
                    key={adj.name}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-800/40 last:border-0"
                  >
                    <span className="flex-1 text-sm text-gray-200 truncate">{adj.name}</span>
                    <span
                      className={`text-xs tabular-nums font-mono px-1.5 py-0.5 rounded ${adj.diff > 0 ? 'text-emerald-400 bg-emerald-900/30' : 'text-red-400 bg-red-900/30'}`}
                    >
                      {adj.diff > 0 ? `+${adj.diff}` : adj.diff} ({adj.userCount}→{adj.typicalCount}
                      )
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!r && !isComparing && !compareError && (
        <p className="text-xs text-gray-600 py-2">
          Click "Compare" to analyze your list against tournament-winning{' '}
          <code className="text-gray-500">{deckArchSlug}</code> lists from Limitless TCG.
        </p>
      )}
    </div>
  );
}
