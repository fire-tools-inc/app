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

interface Props {
  timeline: DebtMonthSnapshot[];
  debts: Debt[];
}

const COLORS = [
  '#ff7e00',
  '#0080ff',
  '#1abc9c',
  '#9b59b6',
  '#e74c3c',
  '#f1c40f',
  '#34495e',
  '#2ecc71',
];

export function DebtRepaymentChart({ timeline, debts }: Props) {
  const data = useMemo(() => {
    if (timeline.length === 0) return [];
    // Always seed with month 0 so users see their starting position.
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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            label={{ value: 'Month', position: 'insideBottom', offset: -4 }}
          />
          <YAxis tickFormatter={(v) => formatDisplayCurrency(Number(v))} />
          <Tooltip
            formatter={(value) => formatDisplayCurrency(Number(value))}
            labelFormatter={(label) => `Month ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="total"
            name="Total balance"
            stroke="#000"
            strokeWidth={2}
            dot={false}
          />
          {debts.map((d, i) => (
            <Line
              key={d.id}
              type="monotone"
              dataKey={d.id}
              name={d.name || `Debt ${i + 1}`}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
