import { useTranslation } from 'react-i18next';
import type { DeckRecommendation } from '../../types';
import { AlertTriangle, TrendingUp, Info, Zap } from 'lucide-react';

interface Props {
  recommendations: DeckRecommendation[];
}

/**
 * Static icon/color config per priority tier. Labels are i18n keys in the
 * `recommendations` namespace, resolved at render time.
 */
const PRIORITY_CONFIG = {
  high: {
    Icon: AlertTriangle,
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    labelKey: 'panel.priority.high',
  },
  medium: {
    Icon: TrendingUp,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    labelKey: 'panel.priority.medium',
  },
  low: {
    Icon: Info,
    color: 'text-brand-700',
    bg: 'bg-brand-50 border-brand-200',
    labelKey: 'panel.priority.low',
  },
};

export function RecommendationsPanel({ recommendations }: Props) {
  const { t } = useTranslation('recommendations');

  if (recommendations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 gap-3">
        <Zap className="w-8 h-8 text-slate-400" />
        <p className="text-slate-500 text-sm text-center max-w-xs">{t('panel.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const config = PRIORITY_CONFIG[rec.priority];
        return (
          <div key={rec.id} className={`card border ${config.bg} p-4`}>
            <div className="flex items-start gap-3">
              <config.Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-slate-900 font-medium text-sm">{rec.suggestion}</span>
                  <span className={`badge border text-xs ${config.bg} ${config.color}`}>
                    {t(config.labelKey)}
                  </span>
                  <span className="badge bg-slate-100 text-slate-600 border-slate-200 text-xs">
                    {t(`panel.category.${rec.category}`)}
                  </span>
                  {rec.dataPoints > 0 && (
                    <span className="text-slate-500 text-xs">
                      {t('games', { count: rec.dataPoints })}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 text-sm">{rec.reasoning}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
