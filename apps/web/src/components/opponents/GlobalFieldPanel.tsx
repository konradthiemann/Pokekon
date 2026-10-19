import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useArchetypeAnalysis } from '../../hooks/useArchetypeAnalysis';
import type { MetaWindow } from '../../lib/api';
import { FieldScorePanel } from '../meta/FieldScorePanel';
import { MatchupTable } from '../meta/MatchupTable';
import { ThreatsPanel } from '../meta/ThreatsPanel';

/**
 * The coached archetype against the global (online) field: field score,
 * threats / free wins and — one click away — the full head-to-head table.
 * Formerly the "Matchups" tab of ArchetypeDetail (Spec 7 §6).
 */
export function GlobalFieldPanel({
  archetypeId,
  window,
}: {
  archetypeId: string;
  window: MetaWindow;
}) {
  const { t } = useTranslation('meta');
  const { data, isLoading, notInWindow, error } = useArchetypeAnalysis(archetypeId, window);
  const [showFull, setShowFull] = useState(false);

  if (isLoading) {
    return (
      <p role="status" className="card text-sm text-slate-600">
        {t('metaTable.loading')}
      </p>
    );
  }
  if (notInWindow) {
    return <p className="card text-sm text-slate-600">{t('opponents:page.notInWindow')}</p>;
  }
  if (error !== null || data === null) {
    return (
      <p role="alert" className="card text-sm text-slate-900">
        {t('opponents:page.unavailable')}
      </p>
    );
  }

  const { fieldScore } = data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldScorePanel
          fieldScore={fieldScore}
          totalRanked={data.totalRanked}
          matchupImportedAt={data.matchupImportedAt}
        />
        <ThreatsPanel fieldScore={fieldScore} />
      </div>
      <button
        type="button"
        onClick={() => setShowFull((v) => !v)}
        aria-expanded={showFull}
        className="flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${showFull ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
        {showFull
          ? t('archetypeDetail.matchupTable.hideFull')
          : t('archetypeDetail.matchupTable.showFull', {
              count: fieldScore.threats.length + fieldScore.freeWins.length,
            })}
      </button>
      {showFull && <MatchupTable fieldScore={fieldScore} iconsById={data.iconsById ?? {}} />}
    </div>
  );
}
