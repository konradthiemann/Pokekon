import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardPaste, ListPlus } from 'lucide-react';
import { AddLogModal } from '../../components/opponent/AddLogModal';
import { winRateColorClass } from '../../components/meta/winRateColor';
import { CopyDeckListButton } from '../../components/shared/CopyDeckListButton';
import { PokemonIcon } from '../../components/shared/PokemonIcon';
import { useFieldAnalysis } from '../../hooks/useFieldAnalysis';
import { fieldThisWeek, logsOfArchetype, nextStep, recentForm } from '../../lib/coach/start';
import { useDashboardStore } from '../../store/dashboardStore';

/** "Field this week" always looks at the last 7 days (Spec 7 §5.2). */
const WEEK_WINDOW = { days: 7, online: true, bo1: true } as const;
const RECENT_GAMES = 3;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card">
      <h2 id={id} className="card-header">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Start (cockpit) of the archetype-first UI (Spec 7 §5.2): active list, next
 * step, recent form, the field this week and the last games — all for the
 * coached archetype only.
 */
export function StartPage() {
  const { t, i18n } = useTranslation('coach');
  const {
    activeArchetypeId,
    activeDeck,
    activeDeckId,
    decks,
    deckCards,
    opponentLogs,
    archetypeStats,
    setCoachTab,
    setDeckView,
  } = useDashboardStore();
  const [showAddLog, setShowAddLog] = useState(false);
  const { data: field, isLoading: fieldLoading, error: fieldError } = useFieldAnalysis(WEEK_WINDOW);

  const logs = useMemo(
    () => (activeArchetypeId ? logsOfArchetype(opponentLogs, decks, activeArchetypeId) : []),
    [opponentLogs, decks, activeArchetypeId],
  );
  const form = useMemo(() => recentForm(logs, new Date()), [logs]);
  const step = nextStep({ hasActiveDeck: activeDeck !== null, hasLogs: logs.length > 0 });
  const fieldRows = useMemo(
    () => fieldThisWeek(field?.archetypes ?? [], archetypeStats),
    [field, archetypeStats],
  );
  const recent = useMemo(
    () => [...logs].sort((a, b) => b.eventDate.localeCompare(a.eventDate)).slice(0, RECENT_GAMES),
    [logs],
  );

  const pct = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }),
    [i18n.language],
  );
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }),
    [i18n.language],
  );

  function openMyLists() {
    setCoachTab('deck');
    setDeckView('myLists');
  }

  const rowButton =
    'flex w-full min-h-[44px] items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500';

  return (
    <div className="space-y-3">
      <Section id="start-active-list" title={t('start.activeList')}>
        {activeDeck ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <PokemonIcon archetype={activeDeck.archetype} size="md" />
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900">
                  {activeDeck.variant.trim() !== '' ? activeDeck.variant : activeDeck.archetypeName}
                </p>
                <p className="truncate text-xs text-slate-600">{activeDeck.archetypeName}</p>
              </div>
            </div>
            <CopyDeckListButton cards={deckCards} />
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600">{t('start.noList')}</p>
            <button type="button" className="btn-primary mt-3" onClick={openMyLists}>
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              {t('start.setUpList')}
            </button>
          </div>
        )}
      </Section>

      <Section id="start-next-step" title={t('start.nextStep')}>
        <div className="rounded-md border-l-4 border-energy-500 bg-energy-400/10 p-3">
          <p className="font-bold text-slate-900">{t(`start.next.${step.kind}.title`)}</p>
          <p className="mt-1 text-sm text-slate-600">{t(`start.next.${step.kind}.body`)}</p>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={step.kind === 'pasteLog' ? () => setShowAddLog(true) : openMyLists}
          >
            {step.kind === 'pasteLog' ? (
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ListPlus className="h-4 w-4" aria-hidden="true" />
            )}
            {t(`start.next.${step.kind}.action`)}
          </button>
        </div>
      </Section>

      <Section id="start-form" title={t('start.form')}>
        <p className="text-xs text-slate-600">{t('start.formWindow')}</p>
        {form.winRatePct === null ? (
          <p className="mt-1 text-sm text-slate-600">{t('start.formEmpty')}</p>
        ) : (
          <div className="mt-1">
            <span className={`stat-value ${winRateColorClass(form.winRatePct)}`}>
              {pct.format(form.winRatePct)} %
            </span>
            <p className="mt-1 text-sm font-semibold text-slate-700 tabular-nums">
              {t('start.formRecord', { wins: form.wins, losses: form.losses, ties: form.ties })}
            </p>
            {form.band && (
              <p className="text-xs text-slate-600">
                {t('start.formBand', {
                  low: pct.format(form.band.lowPct),
                  high: pct.format(form.band.highPct),
                })}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section id="start-field" title={t('start.field')}>
        {fieldLoading && <p className="text-sm text-slate-600">{t('start.fieldLoading')}</p>}
        {fieldError && <p className="text-sm text-slate-600">{t('start.fieldUnavailable')}</p>}
        <ul className="space-y-1">
          {fieldRows.map((row) => (
            <li key={row.archetypeId}>
              <button type="button" className={rowButton} onClick={() => setCoachTab('opponents')}>
                <PokemonIcon archetype={row.archetypeId} size="sm" />
                <span className="flex-1 truncate font-semibold text-slate-900">{row.name}</span>
                <span className="text-xs text-slate-600 tabular-nums">
                  {t('start.fieldShare', { share: pct.format(row.sharePct) })}
                </span>
                <span
                  className={`w-24 text-right text-xs font-semibold tabular-nums ${
                    row.ownWinRatePct === null
                      ? 'text-slate-500'
                      : winRateColorClass(row.ownWinRatePct)
                  }`}
                >
                  {row.ownWinRatePct === null
                    ? t('start.fieldOwnNone')
                    : t('start.fieldOwn', { wr: pct.format(row.ownWinRatePct) })}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="start-recent" title={t('start.recent')}>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600">{t('start.recentEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((log) => (
              <li key={log.id ?? `${log.eventDate}-${log.archetype}`}>
                <button type="button" className={rowButton} onClick={() => setCoachTab('coaching')}>
                  <span
                    className={`w-6 text-center text-xs font-extrabold ${
                      log.result === 'W' ? 'wr-pos' : log.result === 'L' ? 'wr-neg' : 'wr-mid'
                    }`}
                    aria-label={t(`start.result.${log.result}`)}
                  >
                    {log.result}
                  </span>
                  <span className="flex-1 truncate text-slate-900">{log.archetype}</span>
                  <span className="text-xs text-slate-600">
                    {date.format(new Date(`${log.eventDate}T00:00:00`))}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {showAddLog && (
        <AddLogModal
          onClose={() => setShowAddLog(false)}
          preselectedDeckId={activeDeckId ?? undefined}
        />
      )}
    </div>
  );
}
