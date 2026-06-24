import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { ArchetypeStats } from '../../types';

interface Props {
  stats: ArchetypeStats[];
}

/** Minimal shape of the Recharts tooltip item used by the formatter below. */
interface TooltipItem {
  payload?: { encounters?: number };
}

export function WinRateChart({ stats }: Props) {
  const { t } = useTranslation('meta');
  const withData = stats.filter((s) => s.encounters > 0);

  if (withData.length === 0) {
    return (
      <div className="card h-56 flex items-center justify-center">
        <p className="text-slate-500 text-sm font-semibold">{t('winRateChart.empty')}</p>
      </div>
    );
  }

  const data = [...withData]
    .sort((a, b) => a.winRate - b.winRate)
    .map((s) => ({
      name: s.archetype,
      winRate: s.winRate,
      encounters: s.encounters,
    }));

  return (
    <div className="card">
      <div className="card-header">{t('winRateChart.title')}</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
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
          <ReferenceLine x={50} stroke="#94a3b8" strokeDasharray="4 2" />
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
            formatter={(value, _name, props) => [
              t('winRateChart.tooltipValue', {
                value: value ?? 0,
                count: (props as TooltipItem).payload?.encounters ?? 0,
              }),
              t('winRateChart.winRate'),
            ]}
          />
          <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.winRate >= 60 ? '#059669' : entry.winRate >= 40 ? '#d97706' : '#dc2626'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500 mt-2 font-semibold">{t('winRateChart.legend')}</p>
    </div>
  );
}
