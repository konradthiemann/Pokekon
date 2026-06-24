import { useTranslation } from 'react-i18next';
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
import type { ParsedBattleLog } from '@pokekon/shared';

// Brand: #d946ef  Opponent: #f87171  Neutral: #60a5fa

const C_P1 = '#d946ef';
const C_P2 = '#f87171';
const C_TIP = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 };
const C_LAB = { color: '#0f172a', fontWeight: 600, fontSize: 12 };

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
    <div className="bg-slate-100 rounded-lg border border-slate-200 px-3 py-2.5 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function MatchStatsTab({ data }: Props) {
  const { t } = useTranslation('opponents');
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
        <SummaryCard label={t('statsTab.totalTurns')} value={totalTurns} />
        <SummaryCard
          label={t('statsTab.damageYou')}
          value={dmgP1.toLocaleString()}
          sub={t('statsTab.opponentValue', { value: dmgP2.toLocaleString() })}
        />
        <SummaryCard
          label={t('statsTab.kosYou')}
          value={kosP1}
          sub={t('statsTab.opponentValue', { value: kosP2 })}
        />
        <SummaryCard
          label={t('statsTab.winner')}
          value={data.winner ?? '—'}
          sub={data.winner === player1 ? t('statsTab.won') : data.winner ? t('statsTab.lost') : ''}
        />
      </div>

      {/* Prize race */}
      {hasPrizes && (
        <section>
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
            {t('statsTab.prizeRace')}
          </h4>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={prizeProgression}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5, 6]}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val, nm) => [
                    t('statsTab.prizesLeft', { value: val ?? 0 }),
                    String(nm ?? ''),
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#475569', fontSize: 11 }}>{value}</span>
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
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
            {t('statsTab.damagePerTurn')}
          </h4>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={damageByTurn} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val, nm) => [
                    t('statsTab.damageValue', { value: val ?? 0 }),
                    String(nm ?? ''),
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#475569', fontSize: 11 }}>{value}</span>
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
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
            {t('statsTab.mostPlayedCards', { player: player1 })}
          </h4>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <ResponsiveContainer width="100%" height={Math.max(140, cardFrequency.length * 24)}>
              <BarChart
                data={cardFrequency}
                layout="vertical"
                margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="card"
                  width={160}
                  tick={{ fill: '#334155', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={C_TIP}
                  labelStyle={C_LAB}
                  formatter={(val) => [`${val ?? 0}×`, t('statsTab.played')]}
                />
                <Bar dataKey="count" fill={C_P1} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {!hasPrizes && !hasDamage && !hasCards && (
        <p className="text-sm text-slate-500 text-center py-8">{t('statsTab.noEvents')}</p>
      )}
    </div>
  );
}
