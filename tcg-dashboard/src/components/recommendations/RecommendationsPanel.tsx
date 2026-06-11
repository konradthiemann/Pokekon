import type { DeckRecommendation } from '../../types';
import { AlertTriangle, TrendingUp, Info, Zap } from 'lucide-react';

interface Props {
  recommendations: DeckRecommendation[];
}

const PRIORITY_CONFIG = {
  high:   { Icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800',    label: 'High Priority' },
  medium: { Icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800', label: 'Medium Priority' },
  low:    { Icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-800',  label: 'Low Priority' },
};

const CATEGORY_LABELS: Record<string, string> = {
  add:     'Add',
  remove:  'Remove',
  ratio:   'Ratio',
  tech:    'Tech',
  version: 'Version',
};

export function RecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 gap-3">
        <Zap className="w-8 h-8 text-gray-700" />
        <p className="text-gray-500 text-sm text-center max-w-xs">
          No recommendations yet. Log at least 2 opponent matches to start receiving data-driven suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const config = PRIORITY_CONFIG[rec.priority];
        return (
          <div
            key={rec.id}
            className={`card border ${config.bg} p-4`}
          >
            <div className="flex items-start gap-3">
              <config.Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-white font-medium text-sm">{rec.suggestion}</span>
                  <span className={`badge border text-xs ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="badge bg-gray-800 text-gray-400 border-gray-700 text-xs">
                    {CATEGORY_LABELS[rec.category]}
                  </span>
                  {rec.dataPoints > 0 && (
                    <span className="text-gray-600 text-xs">{rec.dataPoints} games</span>
                  )}
                </div>
                <p className="text-gray-400 text-sm">{rec.reasoning}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
