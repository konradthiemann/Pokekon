import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste } from 'lucide-react';
import { DeckTurnQualityPanel } from '../../components/deck/DeckTurnQualityPanel';
import { AddLogModal } from '../../components/opponent/AddLogModal';
import { OpponentLog } from '../../components/opponent/OpponentLog';
import { logsOfArchetype } from '../../lib/coach/start';
import { useDashboardStore } from '../../store/dashboardStore';

/**
 * Coaching of the archetype-first UI, Scheibe 1 scope (Spec 7 §5.4): paste a
 * log (the core loop's action), the history of this archetype's games and the
 * active deck's turn quality. Filters, result card and recurring-mistake
 * detection arrive with Spec 8.
 */
export function CoachingPage() {
  const { t } = useTranslation('coach');
  const { activeArchetypeId, activeDeckId, decks, opponentLogs, refresh } = useDashboardStore();
  const [showAddLog, setShowAddLog] = useState(false);

  const logs = useMemo(
    () => (activeArchetypeId ? logsOfArchetype(opponentLogs, decks, activeArchetypeId) : []),
    [opponentLogs, decks, activeArchetypeId],
  );
  const guideSteps = t('coaching.guide.steps', { returnObjects: true }) as string[];

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-base font-extrabold text-slate-900">{t('coaching.heading')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('coaching.intro')}</p>
        <button type="button" className="btn-primary mt-3" onClick={() => setShowAddLog(true)}>
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
          {t('coaching.pasteLog')}
        </button>
      </section>

      {logs.length === 0 ? (
        <section className="card">
          <h2 id="coaching-guide" className="card-header">
            {t('coaching.guide.title')}
          </h2>
          <ol
            aria-labelledby="coaching-guide"
            className="list-decimal space-y-1 pl-5 text-sm text-slate-700"
          >
            {guideSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="card">
          <h2 className="card-header">{t('coaching.history')}</h2>
          <OpponentLog chrome="bare" logs={logs} />
        </section>
      )}

      {activeDeckId != null && (
        <section aria-label={t('coaching.turnQuality')}>
          <DeckTurnQualityPanel deckId={activeDeckId} />
        </section>
      )}

      {showAddLog && (
        <AddLogModal
          preselectedDeckId={activeDeckId ?? undefined}
          onClose={() => {
            setShowAddLog(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
