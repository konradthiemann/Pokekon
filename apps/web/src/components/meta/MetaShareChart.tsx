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

// Categorical bar palette — deepened so each bar clears ~3:1 on the white card
// (WCAG 1.4.11), while keeping the playful type-colour rainbow.
const COLORS = [
  '#c026d3',
  '#9333ea',
  '#7c3aed',
  '#4f46e5',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#e11d48',
];

const DEFAULT_VISIBLE = 5;
const ROW_HEIGHT = 36;

export function MetaShareChart({ snapshots }: Props) {
  const { t } = useTranslation('meta');
  const [showAll, setShowAll] = useState(false);

  if (snapshots.length === 0) {
    return (
      <div className="card h-64 flex items-center justify-center">
        <p className="text-slate-500 text-sm font-semibold">{t('metaShareChart.empty')}</p>
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
            className="text-xs text-brand-700 hover:text-brand-800 transition-colors font-bold shrink-0"
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 'dataMax + 2']}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: '#334155', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(37,99,235,0.06)' }}
              contentStyle={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 10px 28px -14px rgba(37,99,235,0.25)',
              }}
              labelStyle={{ color: '#0f172a', fontWeight: 800 }}
              itemStyle={{ color: '#334155', fontWeight: 700 }}
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
