import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  X,
  FileText,
  Brain,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  Layers,
  Save,
  RefreshCw,
  BarChart2,
} from 'lucide-react';
import type { OpponentLog, BattleAnalysis, BattleAnalysisPlay, DeckCard } from '../../types';
import { updateOpponentLog, getDeckSnapshotById, parseDeckSnapshot } from '../../db/queries';
import { analyzeBattleLog } from '../../lib/battleLogAnalysis';
import { parseBattleLog } from '../../lib/battleLogParser';
import { MatchStatsTab } from './MatchStatsTab';
import { useDashboardStore } from '../../store/dashboardStore';

const LS_API_KEY = 'tcg-anthropic-key';
const LS_PLAYER = 'tcg-player-name';

interface Props {
  log: OpponentLog;
  onClose: () => void;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const cls =
    impact === 'high'
      ? 'bg-red-900/50 text-red-300 border border-red-700/50'
      : impact === 'medium'
        ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
        : 'bg-gray-700/50 text-gray-400 border border-gray-600/50';
  const label = impact === 'high' ? 'Hoch' : impact === 'medium' ? 'Mittel' : 'Niedrig';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function ActionBadge({ action }: { action: 'add' | 'remove' | 'increase' | 'decrease' }) {
  const map = {
    add: 'bg-green-900/50 text-green-300 border border-green-700/50',
    remove: 'bg-red-900/50 text-red-300 border border-red-700/50',
    increase: 'bg-blue-900/50 text-blue-300 border border-blue-700/50',
    decrease: 'bg-orange-900/50 text-orange-300 border border-orange-700/50',
  };
  const label = {
    add: '+hinzufügen',
    remove: '−entfernen',
    increase: '▲ erhöhen',
    decrease: '▼ reduzieren',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[action]}`}>
      {label[action]}
    </span>
  );
}

function PlayCard({ item }: { item: BattleAnalysisPlay }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-800/80 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-gray-500 shrink-0">Zug {item.turn}</span>
          <span className="text-sm text-gray-200 truncate">{item.observation}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ImpactBadge impact={item.impact} />
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          <blockquote className="border-l-2 border-gray-600 pl-2 text-gray-400 italic text-xs leading-relaxed">
            {item.evidence}
          </blockquote>
          {item.suggestion && (
            <div className="flex gap-1.5">
              <span className="text-[10px] text-brand-400 font-medium shrink-0 mt-0.5">
                Vorschlag:
              </span>
              <p className="text-xs text-gray-300">{item.suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analysis result renderer ─────────────────────────────────────────────────

function AnalysisView({ analysis }: { analysis: BattleAnalysis }) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-gray-800/40 rounded-lg px-4 py-3 border border-gray-700/40">
        <p className="text-sm text-gray-300 leading-relaxed">{analysis.summary}</p>
        <p className="text-[10px] text-gray-600 mt-2">
          Analysiert am {new Date(analysis.analyzedAt).toLocaleString('de-DE')} · Spieler:{' '}
          {analysis.playerName} · Gegner: {analysis.opponentName}
        </p>
      </div>

      {/* Mistakes */}
      {analysis.playMistakes.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Spielfehler / Verbesserungen ({analysis.playMistakes.length})
          </h4>
          <div className="space-y-1.5">
            {analysis.playMistakes.map((m, i) => (
              <PlayCard key={i} item={m} />
            ))}
          </div>
        </section>
      )}

      {/* Key moments */}
      {analysis.keyMoments.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Schlüsselmomente ({analysis.keyMoments.length})
          </h4>
          <div className="space-y-1.5">
            {analysis.keyMoments.map((m, i) => (
              <PlayCard key={i} item={m} />
            ))}
          </div>
        </section>
      )}

      {/* Deck suggestions */}
      {analysis.deckSuggestions.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">
            <Layers className="w-3.5 h-3.5" />
            Deck-Empfehlungen ({analysis.deckSuggestions.length})
          </h4>
          <div className="space-y-1.5">
            {analysis.deckSuggestions.map((s, i) => (
              <div
                key={i}
                className="bg-gray-800/60 rounded-lg border border-gray-700/50 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <ActionBadge action={s.action} />
                  <span className="text-sm text-gray-200 font-medium">{s.card}</span>
                </div>
                <p className="text-xs text-gray-400">{s.reasoning}</p>
                <blockquote className="border-l-2 border-gray-600 pl-2 text-gray-500 italic text-xs">
                  {s.evidence}
                </blockquote>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Card notes */}
      {analysis.cardNotes.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">
            <FileText className="w-3.5 h-3.5" />
            Karten-Analyse ({analysis.cardNotes.length})
          </h4>
          <div className="space-y-1.5">
            {analysis.cardNotes.map((n, i) => (
              <div
                key={i}
                className="bg-gray-800/60 rounded-lg border border-gray-700/50 px-3 py-2.5 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-200 font-medium">{n.card}</span>
                  {n.deckSuggestion && n.deckSuggestion !== null && (
                    <ActionBadge action={n.deckSuggestion} />
                  )}
                </div>
                <p className="text-xs text-gray-400">{n.observation}</p>
                {n.deckSuggestionReason && (
                  <p className="text-xs text-gray-500 italic">{n.deckSuggestionReason}</p>
                )}
                <blockquote className="border-l-2 border-gray-600 pl-2 text-gray-500 italic text-xs">
                  {n.evidence}
                </blockquote>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function MatchDetailModal({ log, onClose }: Props) {
  const { refresh } = useDashboardStore();

  const [battleLog, setBattleLog] = useState(log.battleLog ?? '');
  const [logDirty, setLogDirty] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) ?? '');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(LS_PLAYER) ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const storedAnalysis: BattleAnalysis | null = (() => {
    try {
      return log.analysis ? JSON.parse(log.analysis) : null;
    } catch {
      return null;
    }
  })();
  const [analysis, setAnalysis] = useState<BattleAnalysis | null>(storedAnalysis);

  const [activeTab, setActiveTab] = useState<'log' | 'stats' | 'analysis' | 'snapshot'>('log');
  const [snapshotCards, setSnapshotCards] = useState<DeckCard[] | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);

  useEffect(() => {
    if (activeTab !== 'snapshot' || !log.deckSnapshotId) return;
    getDeckSnapshotById(log.deckSnapshotId).then((snap) => {
      if (!snap) {
        setSnapshotError(true);
        return;
      }
      setSnapshotCards(parseDeckSnapshot(snap));
    });
  }, [activeTab, log.deckSnapshotId]);

  const parsedStats = useMemo(() => {
    if (!battleLog.trim()) return null;
    try {
      return parseBattleLog(battleLog, playerName);
    } catch {
      return null;
    }
  }, [battleLog, playerName]);

  const handleSaveLog = useCallback(async () => {
    if (log.id == null) return;
    setSavingLog(true);
    await updateOpponentLog(log.id, { battleLog: battleLog.trim() || undefined });
    setSavingLog(false);
    setLogDirty(false);
    refresh();
  }, [log.id, battleLog, refresh]);

  const handleAnalyze = useCallback(async () => {
    if (!battleLog.trim() || !apiKey.trim() || !playerName.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    localStorage.setItem(LS_API_KEY, apiKey);
    localStorage.setItem(LS_PLAYER, playerName);
    try {
      // Save log first if dirty
      if (logDirty && log.id != null) {
        await updateOpponentLog(log.id, { battleLog: battleLog.trim() });
        setLogDirty(false);
      }
      const result = await analyzeBattleLog(battleLog, playerName, apiKey);
      setAnalysis(result);
      if (log.id != null) {
        await updateOpponentLog(log.id, { analysis: JSON.stringify(result) });
        refresh();
      }
      setActiveTab('analysis');
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }, [battleLog, apiKey, playerName, logDirty, log.id, refresh]);

  const resultBadge =
    log.result === 'W' ? 'badge-win' : log.result === 'L' ? 'badge-loss' : 'badge-tie';
  const resultLabel =
    log.result === 'W' ? 'Sieg' : log.result === 'L' ? 'Niederlage' : 'Unentschieden';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-800 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-white font-semibold text-base">vs. {log.archetype}</h2>
              <span className={resultBadge}>{resultLabel}</span>
              <span className={log.eventType === 'LC' ? 'badge-lc' : 'badge-lcup'}>
                {log.eventType}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {log.eventDate}
              {log.round ? ` · Runde ${log.round}` : ''}
              {log.notes ? ` · ${log.notes}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-3 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('log')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'log'
                ? 'text-white border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Kampfprotokoll
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'stats'
                ? 'text-white border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Statistiken
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'analysis'
                ? 'text-white border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            KI-Analyse
            {analysis && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            )}
          </button>
          {log.deckSnapshotId != null && (
            <button
              onClick={() => setActiveTab('snapshot')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                activeTab === 'snapshot'
                  ? 'text-white border-b-2 border-brand-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Deckliste
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {/* ── Log tab ── */}
          {activeTab === 'log' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Füge das Kampfprotokoll aus PTCGL / PTCGO ein. Es wird lokal gespeichert und für die
                KI-Analyse verwendet.
              </p>
              <textarea
                value={battleLog}
                onChange={(e) => {
                  setBattleLog(e.target.value);
                  setLogDirty(true);
                }}
                placeholder="Protokoll hier einfügen…"
                rows={8}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none font-mono leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveLog}
                  disabled={!logDirty || savingLog}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingLog ? 'Speichern…' : 'Protokoll speichern'}
                </button>
              </div>
            </div>
          )}

          {/* ── Stats tab ── */}
          {activeTab === 'stats' && (
            <div>
              {parsedStats ? (
                <MatchStatsTab data={parsedStats} />
              ) : (
                <p className="text-sm text-gray-600 text-center py-10">
                  {battleLog.trim()
                    ? 'Das Protokoll konnte nicht ausgewertet werden.'
                    : 'Füge im Tab "Kampfprotokoll" ein Protokoll ein, um Statistiken zu sehen.'}
                </p>
              )}
            </div>
          )}

          {/* ── Snapshot tab ── */}
          {activeTab === 'snapshot' && (
            <div>
              {snapshotError && (
                <p className="text-sm text-gray-500 text-center py-10">
                  Snapshot nicht mehr vorhanden.
                </p>
              )}
              {!snapshotError && !snapshotCards && (
                <p className="text-sm text-gray-600 text-center py-10">Lade…</p>
              )}
              {snapshotCards &&
                (() => {
                  const grouped: Record<string, DeckCard[]> = {
                    Pokemon: [],
                    Trainer: [],
                    Energy: [],
                  };
                  for (const c of snapshotCards) grouped[c.type]?.push(c);
                  return (
                    <div className="space-y-4">
                      {(['Pokemon', 'Trainer', 'Energy'] as const).map((type) => {
                        const cards = grouped[type];
                        if (!cards.length) return null;
                        const color =
                          type === 'Pokemon'
                            ? 'text-red-400'
                            : type === 'Trainer'
                              ? 'text-blue-400'
                              : 'text-orange-400';
                        return (
                          <section key={type}>
                            <h4
                              className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}
                            >
                              {type} ({cards.reduce((s, c) => s + c.count, 0)})
                            </h4>
                            <div className="space-y-0.5">
                              {cards.map((c) => (
                                <div
                                  key={c.name}
                                  className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-800/40"
                                >
                                  <span className="text-gray-500 tabular-nums w-5 text-right shrink-0">
                                    {c.count}×
                                  </span>
                                  <span className="text-gray-200">{c.name}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
          )}

          {/* ── Analysis tab ── */}
          {activeTab === 'analysis' && (
            <div className="space-y-4">
              {/* Config area */}
              <div className="bg-gray-800/40 rounded-lg border border-gray-700/40 p-4 space-y-3">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Analyse-Einstellungen
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Mein Spielername im Protokoll
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="z.B. Premiox"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Anthropic API-Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                </div>
                {!battleLog.trim() && (
                  <p className="text-xs text-yellow-500">
                    Kein Kampfprotokoll vorhanden — erst im Tab "Kampfprotokoll" einfügen.
                  </p>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={!battleLog.trim() || !apiKey.trim() || !playerName.trim() || analyzing}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Analysiere…
                    </>
                  ) : (
                    <>
                      <Brain className="w-3.5 h-3.5" />
                      {analysis ? 'Neu analysieren' : 'Analyse starten'}
                    </>
                  )}
                </button>
                {analysisError && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded px-3 py-2">
                    {analysisError}
                  </p>
                )}
              </div>

              {/* Results */}
              {analysis && <AnalysisView analysis={analysis} />}
              {!analysis && !analyzing && !analysisError && (
                <p className="text-sm text-gray-600 text-center py-8">
                  Noch keine Analyse vorhanden. Gib deinen Spielernamen und API-Key ein und starte
                  die Analyse.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
