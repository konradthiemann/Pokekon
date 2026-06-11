import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ParsedBattleLog } from '../../lib/battleLogParser';

// Brand: #d946ef  Opponent: #f87171  Neutral: #60a5fa

const C_P1 = '#d946ef';
const C_P2 = '#f87171';
const C_TIP = { background: '#111827', border: '1px solid #374151', borderRadius: 8 };
const C_LAB = { color: '#f9fafb', fontWeight: 600, fontSize: 12 };

interface Props {
  data: ParsedBattleLog;
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/40 px-3 py-2.5 text-center">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export function MatchStatsTab({ data }: Props) {
  const {
    player1,
    player2,
    totalTurns,
    prizeProgression,
    damageByTurn,
    cardFrequency,
    totalDamage,
    totalKOs,
  } = data;

  const dmgP1 = totalDamage.find((d) => d.player === player1)?.damage ?? 0;
  const dmgP2 = totalDamage.find((d) => d.player === player2)?.damage ?? 0;
  const kosP1 = totalKOs.find((k) => k.player === player1)?.kos ?? 0;
  const kosP2 = totalKOs.find((k) => k.player === player2)?.kos ?? 0;

  const hasDamage = damageByTurn.length > 0;
  const hasCards = cardFrequency.length > 0;
  const hasPrizes = prizeProgression.length > 1;

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Züge gesamt" value={totalTurns} />
        <SummaryCard
          label="Schaden (du)"
          value={dmgP1.toLocaleString()}
          sub={`Gegner: ${dmgP2.toLocaleString()}`}
        />
        <SummaryCard label="KOs (du)" value={kosP1} sub={`Gegner: ${kosP2}`} />
        <SummaryCard
          label="Sieger"
          value={data.winner ?? '—'}
          sub={data.winner === player1 ? 'Gewonnen!' : data.winner ? 'Verloren' : ''}
        />
      </div>

      {/* Prize race */}
      {hasPrizes && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Preiskarten-Rennen
          </h4>
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/40 p-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={prizeProgression}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5, 6]}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val, nm) => [`${val ?? 0} übrig`, String(nm ?? '')]}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>{value}</span>
                  )}
                />
                <Line
                  type="stepAfter"
                  dataKey="p1"
                  name={player1}
                  stroke={C_P1}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="stepAfter"
                  dataKey="p2"
                  name={player2}
                  stroke={C_P2}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Damage per turn */}
      {hasDamage && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Angriffs-Schaden pro Zug
          </h4>
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/40 p-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={damageByTurn} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val, nm) => [`${val ?? 0} Schaden`, String(nm ?? '')]}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>{value}</span>
                  )}
                />
                <Bar
                  dataKey="p1"
                  name={player1}
                  fill={C_P1}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="p2"
                  name={player2}
                  fill={C_P2}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Card frequency */}
      {hasCards && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Meist gespielte Karten ({player1})
          </h4>
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/40 p-3">
            <ResponsiveContainer width="100%" height={Math.max(140, cardFrequency.length * 24)}>
              <BarChart
                data={cardFrequency}
                layout="vertical"
                margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="card"
                  width={160}
                  tick={{ fill: '#d1d5db', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val) => [`${val ?? 0}×`, 'gespielt']}
                />
                <Bar dataKey="count" fill={C_P1} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {!hasPrizes && !hasDamage && !hasCards && (
        <p className="text-sm text-gray-600 text-center py-8">
          Das Protokoll enthält keine auswertbaren Kampfereignisse.
        </p>
      )}
    </div>
  );
}
