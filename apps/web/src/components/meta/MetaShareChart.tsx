import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { MetaSnapshot } from '../../types';

interface Props {
  snapshots: MetaSnapshot[];
}

const COLORS = [
  '#c026d3',
  '#a855f7',
  '#7c3aed',
  '#6366f1',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#84cc16',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#f43f5e',
];

const DEFAULT_VISIBLE = 5;
const ROW_HEIGHT = 36;

export function MetaShareChart({ snapshots }: Props) {
  const { t } = useTranslation('meta');
  const [showAll, setShowAll] = useState(false);

  if (snapshots.length === 0) {
    return (
      <div className="card h-64 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{t('metaShareChart.empty')}</p>
      </div>
    );
  }

  const allData = [...snapshots]
    .sort((a, b) => b.frequencyPct - a.frequencyPct)
    .map((s) => ({ name: s.archetype, pct: s.frequencyPct, wr: s.winRatePct }));

  const data = showAll ? allData : allData.slice(0, DEFAULT_VISIBLE);
  const chartHeight = data.length * ROW_HEIGHT + 8;

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="card-header mb-0">{t('metaShareChart.title')}</span>
        {allData.length > DEFAULT_VISIBLE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium shrink-0"
          >
            {showAll
              ? t('metaShareChart.showTop', { count: DEFAULT_VISIBLE })
              : t('metaShareChart.showAll', { count: allData.length })}
          </button>
        )}
      </div>

      <div
        className="overflow-y-auto"
        style={{ maxHeight: showAll ? `${DEFAULT_VISIBLE * ROW_HEIGHT + 8}px` : undefined }}
      >
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 'dataMax + 2']}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: '#d1d5db', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
              formatter={(value, name) =>
                name === 'pct'
                  ? [`${value ?? 0}%`, t('metaShareChart.metaShare')]
                  : [`${value ?? 0}%`, t('metaShareChart.winRate')]
              }
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
