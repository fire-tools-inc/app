import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { InvestmentGrowthYear } from '../types/investmentGrowth';
import { formatDisplayCurrency } from '../utils/numberFormatter';

interface InvestmentGrowthChartProps {
  yearly: InvestmentGrowthYear[];
  currency?: string;
}

const formatYAxis = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
};

export const InvestmentGrowthChart: React.FC<InvestmentGrowthChartProps> = ({
  yearly,
  currency,
}) => {
  const data = yearly.map((y) => ({
    year: y.year,
    Nominal: Math.round(y.nominalValue),
    Real: Math.round(y.realValue),
    Contributions: Math.round(y.cumulativeContributions),
  }));

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis
          dataKey="year"
          stroke="var(--text-secondary)"
          tick={{ fill: 'var(--text-secondary)' }}
          label={{ value: 'Years', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)' }}
        />
        <YAxis
          stroke="var(--text-secondary)"
          tick={{ fill: 'var(--text-secondary)' }}
          tickFormatter={formatYAxis}
        />
        <Tooltip
          formatter={(value) => formatDisplayCurrency(Number(value), currency)}
          labelFormatter={(label) => `Year ${label}`}
          contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ paddingTop: 12 }} />
        <ReferenceLine y={0} stroke="var(--border-subtle)" />
        <Line
          type="monotone"
          dataKey="Nominal"
          name="Nominal value"
          stroke="var(--accent-primary)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Real"
          name="Real value (today's currency)"
          stroke="var(--accent-gold)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Contributions"
          name="Cumulative contributions"
          stroke="var(--text-muted)"
          strokeDasharray="5 4"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
