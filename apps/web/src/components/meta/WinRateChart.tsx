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
  const withData = stats.filter((s) => s.encounters > 0);

  if (withData.length === 0) {
    return (
      <div className="card h-56 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Log opponent matches to see your win rates.</p>
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
      <div className="card-header">Win Rate vs Archetype</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
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
          <ReferenceLine x={50} stroke="#374151" strokeDasharray="4 2" />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
            formatter={(value, _name, props) => [
              `${value ?? 0}% (${(props as TooltipItem).payload?.encounters ?? 0} games)`,
              'Win Rate',
            ]}
          />
          <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.winRate >= 60 ? '#10b981' : entry.winRate >= 40 ? '#f97316' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-600 mt-2">
        Green = favorable (60%+) &nbsp; Orange = even (40–60%) &nbsp; Red = unfavorable (&lt;40%)
      </p>
    </div>
  );
}
