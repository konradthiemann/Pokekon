import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import type {
  OpponentLog,
  BattleAnalysis,
  BattleAnalysisPlay,
  DeckCard,
  BestOf,
} from '../../types';
import { updateOpponentLog, getDeckSnapshotById, parseDeckSnapshot } from '../../db/queries';
import { analyzeBattleLogViaApi, getAiSettings, updateAiSettings } from '../../lib/api';
import { isBestOfHintDismissed, dismissBestOfHint } from '../../lib/preferences';
import { BEST_OF_VALUES, parseBattleLog } from '@pokekon/shared';
import { MatchStatsTab } from './MatchStatsTab';
import { useDashboardStore } from '../../store/dashboardStore';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY, PLAYER_NAME_KEY, isAnonymousUser } from '../../lib/demo';

const LS_PLAYER = PLAYER_NAME_KEY;

interface Props {
  log: OpponentLog;
  onClose: () => void;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const { t } = useTranslation('opponents');
  const cls =
    impact === 'high'
      ? 'bg-red-100 text-red-700 border border-red-200'
      : impact === 'medium'
        ? 'bg-amber-100 text-amber-700 border border-amber-200'
        : 'bg-slate-100 text-slate-600 border border-slate-200';
  const label = t(`matchDetail.impact.${impact}`);
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function ActionBadge({ action }: { action: 'add' | 'remove' | 'increase' | 'decrease' }) {
  const { t } = useTranslation('opponents');
  const map = {
    add: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    remove: 'bg-red-100 text-red-700 border border-red-200',
    increase: 'bg-brand-100 text-brand-800 border border-brand-200',
    decrease: 'bg-orange-100 text-orange-700 border border-orange-200',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[action]}`}>
      {t(`matchDetail.action.${action}`)}
    </span>
  );
}

function PlayCard({ item }: { item: BattleAnalysisPlay }) {
  const { t } = useTranslation('opponents');
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-slate-500 shrink-0">
            {t('matchDetail.turn', { turn: item.turn })}
          </span>
          <span className="text-sm text-slate-800 truncate">{item.observation}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ImpactBadge impact={item.impact} />
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          <blockquote className="border-l-2 border-slate-300 pl-2 text-slate-600 italic text-xs leading-relaxed">
            {item.evidence}
          </blockquote>
          {item.suggestion && (
            <div className="flex gap-1.5">
              <span className="text-[10px] text-brand-700 font-medium shrink-0 mt-0.5">
                {t('matchDetail.suggestion')}
              </span>
              <p className="text-xs text-slate-700">{item.suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analysis result renderer ─────────────────────────────────────────────────

function AnalysisView({ analysis }: { analysis: BattleAnalysis }) {
  const { t, i18n } = useTranslation('opponents');
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-slate-100 rounded-lg px-4 py-3 border border-slate-200">
        <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
        <p className="text-[10px] text-slate-400 mt-2">
          {t('matchDetail.analyzedMeta', {
            date: new Date(analysis.analyzedAt).toLocaleString(i18n.language),
            player: analysis.playerName,
            opponent: analysis.opponentName,
          })}
        </p>
      </div>

      {/* Mistakes */}
      {analysis.playMistakes.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('matchDetail.sections.mistakes', { count: analysis.playMistakes.length })}
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
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            {t('matchDetail.sections.keyMoments', { count: analysis.keyMoments.length })}
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
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
            <Layers className="w-3.5 h-3.5" />
            {t('matchDetail.sections.deckSuggestions', { count: analysis.deckSuggestions.length })}
          </h4>
          <div className="space-y-1.5">
            {analysis.deckSuggestions.map((s, i) => (
              <div
                key={i}
                className="bg-slate-100 rounded-lg border border-slate-200 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <ActionBadge action={s.action} />
                  <span className="text-sm text-slate-800 font-medium">{s.card}</span>
                </div>
                <p className="text-xs text-slate-600">{s.reasoning}</p>
                <blockquote className="border-l-2 border-slate-300 pl-2 text-slate-500 italic text-xs">
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
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            <FileText className="w-3.5 h-3.5" />
            {t('matchDetail.sections.cardNotes', { count: analysis.cardNotes.length })}
          </h4>
          <div className="space-y-1.5">
            {analysis.cardNotes.map((n, i) => (
              <div
                key={i}
                className="bg-slate-100 rounded-lg border border-slate-200 px-3 py-2.5 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-800 font-medium">{n.card}</span>
                  {n.deckSuggestion && n.deckSuggestion !== null && (
                    <ActionBadge action={n.deckSuggestion} />
                  )}
                </div>
                <p className="text-xs text-slate-600">{n.observation}</p>
                {n.deckSuggestionReason && (
                  <p className="text-xs text-slate-500 italic">{n.deckSuggestionReason}</p>
                )}
                <blockquote className="border-l-2 border-slate-300 pl-2 text-slate-500 italic text-xs">
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
  const { t } = useTranslation('opponents');
  const { refresh } = useDashboardStore();

  const [battleLog, setBattleLog] = useState(log.battleLog ?? '');
  const [logDirty, setLogDirty] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  // bestOf (plan §3.7): tracked locally so a fix-up applied in this modal shows
  // immediately, without waiting for the parent list's next full reload.
  const [bestOf, setBestOfState] = useState(log.bestOf);
  const [bestOfHintDismissed, setBestOfHintDismissed] = useState(isBestOfHintDismissed);
  const [savingBestOf, setSavingBestOf] = useState(false);

  const applyBestOf = useCallback(
    async (value: BestOf) => {
      if (log.id == null) return;
      setSavingBestOf(true);
      try {
        await updateOpponentLog(log.id, { bestOf: value });
        setBestOfState(value);
        refresh();
      } finally {
        setSavingBestOf(false);
      }
    },
    [log.id, refresh],
  );

  const handleDismissBestOfHint = useCallback(() => {
    dismissBestOfHint();
    setBestOfHintDismissed(true);
  }, []);

  // The LLM key lives server-side (encrypted, BYOK). `apiKey` is only the value being
  // entered now; `hasApiKey` reflects whether a key is already stored on the server.
  const [apiKey, setApiKey] = useState('');
  const [serverHasKey, setServerHasKey] = useState(false);
  // Whether a demo, browser-only token is present (set when one is entered below).
  const [demoTokenPresent, setDemoTokenPresent] = useState(() =>
    Boolean(localStorage.getItem(DEMO_AI_TOKEN_KEY)),
  );
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(LS_PLAYER) ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Demo guests never persist their key server-side; it lives only in the browser
  // (DEMO_AI_TOKEN_KEY) and is sent per request. Regular users use the stored key.
  const { data: session } = authClient.useSession();
  const isDemo = isAnonymousUser(session?.user);
  const hasApiKey = isDemo ? demoTokenPresent : serverHasKey;

  useEffect(() => {
    if (isDemo) return; // demo mode keeps the token in the browser, not on the server
    getAiSettings()
      .then((s) => setServerHasKey(s.hasApiKey))
      .catch(() => setServerHasKey(false));
  }, [isDemo]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    const enteredKey = apiKey.trim();
    if (!battleLog.trim() || !playerName.trim() || (!enteredKey && !hasApiKey)) return;
    setAnalyzing(true);
    setAnalysisError(null);
    localStorage.setItem(LS_PLAYER, playerName);
    try {
      let ephemeralToken: string | undefined;
      if (isDemo) {
        // Demo: keep the token only in the browser, send it per request.
        if (enteredKey) {
          localStorage.setItem(DEMO_AI_TOKEN_KEY, enteredKey);
          setApiKey('');
          setDemoTokenPresent(true);
        }
        ephemeralToken = enteredKey || localStorage.getItem(DEMO_AI_TOKEN_KEY) || undefined;
      } else if (enteredKey) {
        // Regular: persist server-side (encrypted), then forget it locally.
        await updateAiSettings({ apiKey: enteredKey });
        setApiKey('');
        setServerHasKey(true);
      }
      // Save log first if dirty
      if (logDirty && log.id != null) {
        await updateOpponentLog(log.id, { battleLog: battleLog.trim() });
        setLogDirty(false);
      }
      const result = await analyzeBattleLogViaApi(
        battleLog,
        playerName,
        ephemeralToken ? { apiKey: ephemeralToken } : undefined,
      );
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
  }, [battleLog, apiKey, hasApiKey, playerName, logDirty, log.id, refresh, isDemo]);

  const resultBadge =
    log.result === 'W' ? 'badge-win' : log.result === 'L' ? 'badge-loss' : 'badge-tie';
  const resultLabel =
    log.result === 'W'
      ? t('matchDetail.result.win')
      : log.result === 'L'
        ? t('matchDetail.result.loss')
        : t('matchDetail.result.tie');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-detail-modal-title"
        className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-card"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 id="match-detail-modal-title" className="text-slate-900 font-bold text-base">
                {t('matchDetail.versus', { archetype: log.archetype })}
              </h2>
              <span className={resultBadge}>{resultLabel}</span>
              <span className={log.eventType === 'LC' ? 'badge-lc' : 'badge-lcup'}>
                {log.eventType}
              </span>
              {bestOf === undefined ? (
                <span
                  className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"
                  title={t('bestOf.hint')}
                >
                  {t('bestOf.unknown')}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                  {t(`bestOf.${bestOf === 'BO1' ? 'bo1' : 'bo3'}`)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {log.eventDate}
              {log.round ? ` · ${t('matchDetail.roundLabel', { round: log.round })}` : ''}
              {log.notes ? ` · ${log.notes}` : ''}
            </p>
            {/* One-time nudge to fill in the match format on a legacy log
                (plan §3.7) — the "unknown" badge above stays either way. */}
            {bestOf === undefined && !bestOfHintDismissed && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">{t('bestOf.hint')}</span>
                {BEST_OF_VALUES.map((format) => (
                  <button
                    key={format}
                    type="button"
                    disabled={savingBestOf}
                    onClick={() => void applyBestOf(format)}
                    className="text-xs font-bold px-2 py-0.5 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                  >
                    {t(`bestOf.${format === 'BO1' ? 'bo1' : 'bo3'}`)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleDismissBestOfHint}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  {t('bestOf.dismiss')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-slate-500 hover:text-slate-700 ml-3 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('log')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'log'
                ? 'text-slate-900 border-b-2 border-brand-500'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            {t('matchDetail.tabs.log')}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'stats'
                ? 'text-slate-900 border-b-2 border-brand-500'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" aria-hidden="true" />
            {t('matchDetail.tabs.stats')}
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
              activeTab === 'analysis'
                ? 'text-slate-900 border-b-2 border-brand-500'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Brain className="w-3.5 h-3.5" aria-hidden="true" />
            {t('matchDetail.tabs.analysis')}
            {analysis && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            )}
          </button>
          {log.deckSnapshotId != null && (
            <button
              onClick={() => setActiveTab('snapshot')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                activeTab === 'snapshot'
                  ? 'text-slate-900 border-b-2 border-brand-500'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              {t('matchDetail.tabs.deckList')}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {/* ── Log tab ── */}
          {activeTab === 'log' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">{t('matchDetail.logTab.hint')}</p>
              <textarea
                value={battleLog}
                onChange={(e) => {
                  setBattleLog(e.target.value);
                  setLogDirty(true);
                }}
                placeholder={t('matchDetail.logTab.placeholder')}
                rows={8}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-none font-mono leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveLog}
                  disabled={!logDirty || savingLog}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  {savingLog ? t('saving', { ns: 'common' }) : t('matchDetail.logTab.save')}
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
                <p className="text-sm text-slate-500 text-center py-10">
                  {battleLog.trim()
                    ? t('matchDetail.stats.parseFailed')
                    : t('matchDetail.stats.pasteFirst')}
                </p>
              )}
            </div>
          )}

          {/* ── Snapshot tab ── */}
          {activeTab === 'snapshot' && (
            <div>
              {snapshotError && (
                <p className="text-sm text-slate-500 text-center py-10">
                  {t('matchDetail.snapshot.missing')}
                </p>
              )}
              {!snapshotError && !snapshotCards && (
                <p className="text-sm text-slate-500 text-center py-10">
                  {t('loading', { ns: 'common' })}
                </p>
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
                            ? 'text-red-700'
                            : type === 'Trainer'
                              ? 'text-brand-700'
                              : 'text-orange-700';
                        return (
                          <section key={type}>
                            <h4
                              className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}
                            >
                              {t(`matchDetail.cardTypes.${type}`)} (
                              {cards.reduce((s, c) => s + c.count, 0)})
                            </h4>
                            <div className="space-y-0.5">
                              {cards.map((c) => (
                                <div
                                  key={c.name}
                                  className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-100"
                                >
                                  <span className="text-slate-500 tabular-nums w-5 text-right shrink-0">
                                    {c.count}×
                                  </span>
                                  <span className="text-slate-800">{c.name}</span>
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
              <div className="bg-slate-100 rounded-lg border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  {t('matchDetail.analysisTab.settings')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      {t('matchDetail.analysisTab.playerNameLabel')}
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder={t('matchDetail.analysisTab.playerNamePlaceholder')}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      {t('matchDetail.analysisTab.apiKeyLabel')}
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        hasApiKey
                          ? t(
                              isDemo
                                ? 'matchDetail.analysisTab.apiKeyStoredDemo'
                                : 'matchDetail.analysisTab.apiKeyStored',
                            )
                          : 'GitHub Models Token (ghp_…)'
                      }
                      className="input font-mono"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      {t(
                        isDemo
                          ? 'matchDetail.analysisTab.apiKeyHintDemo'
                          : 'matchDetail.analysisTab.apiKeyHint',
                      )}
                    </p>
                  </div>
                </div>
                {!battleLog.trim() && (
                  <p className="text-xs text-amber-700">{t('matchDetail.analysisTab.noLog')}</p>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={
                    !battleLog.trim() ||
                    !playerName.trim() ||
                    (!apiKey.trim() && !hasApiKey) ||
                    analyzing
                  }
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      {t('matchDetail.analysisTab.analyzing')}
                    </>
                  ) : (
                    <>
                      <Brain className="w-3.5 h-3.5" aria-hidden="true" />
                      {analysis
                        ? t('matchDetail.analysisTab.reanalyze')
                        : t('matchDetail.analysisTab.start')}
                    </>
                  )}
                </button>
                {analysisError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {analysisError}
                  </p>
                )}
              </div>

              {/* Results */}
              {analysis && <AnalysisView analysis={analysis} />}
              {!analysis && !analyzing && !analysisError && (
                <p className="text-sm text-slate-500 text-center py-8">
                  {t('matchDetail.analysisTab.empty')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
