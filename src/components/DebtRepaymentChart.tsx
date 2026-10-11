import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DebtMonthSnapshot, Debt } from '../types/debt';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { getChartColor } from '../utils/chartColors';

interface Props {
  timeline: DebtMonthSnapshot[];
  debts: Debt[];
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

interface DebtTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number | string;
}

function DebtTooltip({ active, payload, label }: DebtTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div
      style={{
        background: 'var(--bg-elevated, #1A1D26)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '0.6rem 0.85rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: 180,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
        Month {label}
      </p>
      {sorted.map((entry, i) => (
        <p
          key={i}
          style={{
            margin: '0.2rem 0',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-secondary)' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: entry.color,
              }}
            />
            {entry.name}
          </span>
          <span style={{ fontWeight: 600, color: entry.color }}>
            {formatDisplayCurrency(Number(entry.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

export function DebtRepaymentChart({ timeline, debts }: Props) {
  const data = useMemo(() => {
    if (timeline.length === 0) return [];
    const seed: Record<string, number | string> = { month: 0 };
    for (const d of debts) seed[d.id] = d.balance;
    seed.total = debts.reduce((s, d) => s + d.balance, 0);
    const points = timeline.map((snap) => {
      const row: Record<string, number | string> = {
        month: snap.month,
        total: snap.totalBalance,
      };
      for (const d of debts) row[d.id] = snap.balancesByDebt[d.id] ?? 0;
      return row;
    });
    return [seed, ...points];
  }, [timeline, debts]);

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="month"
            padding={{ left: 10, right: 10 }}
            stroke="var(--text-secondary)"
            label={{ value: 'Month', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)' }}
          />
          <YAxis
            stroke="var(--text-secondary)"
            tickFormatter={(v) => formatDisplayCurrency(Number(v))}
          />
          <Tooltip content={<DebtTooltip />} />
          <Legend wrapperStyle={{ color: 'var(--text-secondary)' }} />
          <Line
            type="monotone"
            dataKey="total"
            name="Total balance"
            stroke="var(--text-primary)"
            strokeWidth={2}
            dot={false}
          />
          {debts.map((d, i) => (
            <Line
              key={d.id}
              type="monotone"
              dataKey={d.id}
              name={d.name || `Debt ${i + 1}`}
              stroke={getChartColor(i)}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
