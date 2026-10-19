import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArchetypeCardStat, CardSignalTier } from '@pokekon/shared';
import { useArchetypeCardStats } from '../../hooks/useArchetypeCardStats';
import { CardDelta } from '../shared/CardDelta';
import { TIER_LABEL_KEYS } from '../shared/cardSignalTiers';

const FILTER_TIERS: readonly CardSignalTier[] = [
  'confirmed',
  'hiddenGem',
  'popularityParadox',
  'discouraged',
];
const TYPE_ORDER = ['pokemon', 'trainer', 'energy'] as const;

/**
 * Card statistics of the coached archetype (Spec 7 §5.6): play rate, average
 * count and the performance delta with its signal tier, per card type, with
 * tier filter chips. Correlation, not causation — CardDelta keeps that note.
 */
export function CardStatsPanel({ archetypeId, days }: { archetypeId: string; days: number }) {
  const { t, i18n } = useTranslation('coach');
  const { data, isLoading, error } = useArchetypeCardStats(archetypeId, days);
  const [tier, setTier] = useState<CardSignalTier | 'all'>('all');

  const groups = useMemo(() => {
    const cards = (data?.cards ?? []).filter((c) => tier === 'all' || c.tier === tier);
    return TYPE_ORDER.map((type) => ({
      type,
      cards: cards.filter((c) => c.cardType === type),
    })).filter((g) => g.cards.length > 0);
  }, [data, tier]);

  if (isLoading) {
    return (
      <p role="status" className="text-sm text-slate-600">
        {t('tools.cardStats.loading')}
      </p>
    );
  }
  if (error || data === null) {
    return (
      <p role="alert" className="text-sm text-slate-900">
        {t('tools.cardStats.error')}
      </p>
    );
  }
  if (data.computedAt === null) {
    return <p className="text-sm text-slate-600">{t('tools.cardStats.coldStart')}</p>;
  }

  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(data.computedAt),
  );
  const chip = (id: CardSignalTier | 'all', label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={tier === id}
      onClick={() => setTier(id)}
      className={`min-h-[44px] rounded-full border px-3 text-xs font-semibold ${
        tier === id
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        {t('tools.cardStats.header', { lists: data.listsAnalyzed, days: data.windowDays, date })}
      </p>
      <div className="flex flex-wrap gap-2">
        {chip('all', t('tools.cardStats.filterAll'))}
        {FILTER_TIERS.map((id) => chip(id, t(TIER_LABEL_KEYS[id], { ns: 'recommendations' })))}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-slate-600">{t('tools.cardStats.empty')}</p>
      )}
      {groups.map((g) => (
        <div key={g.type} className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <caption className="py-1 text-left text-[11px] font-extrabold uppercase tracking-widest text-slate-600">
              {t(`tools.cardStats.types.${g.type}`)}
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-1 pr-2 font-semibold">{t('tools.cardStats.card')}</th>
                <th className="py-1 pr-2 text-right font-semibold">
                  {t('tools.cardStats.inclusion')}
                </th>
                <th className="py-1 pr-2 text-right font-semibold">
                  {t('tools.cardStats.avgCount')}
                </th>
                <th className="py-1 font-semibold">{t('tools.cardStats.signal')}</th>
              </tr>
            </thead>
            <tbody>
              {g.cards.map((c: ArchetypeCardStat) => (
                <tr key={c.cardName} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-1.5 pr-2 font-semibold text-slate-900">{c.cardName}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">
                    {c.inclusionPct.toFixed(0)} %
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">
                    {c.avgCount.toFixed(1)}
                  </td>
                  <td className="py-1.5">
                    <CardDelta delta={c.delta ?? undefined} tier={c.tier} className="" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
