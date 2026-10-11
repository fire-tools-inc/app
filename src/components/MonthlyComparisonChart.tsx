import { useTranslation } from 'react-i18next';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { MonthlyComparisonData } from '../types/expenseTracker';

interface MonthlyComparisonChartProps {
  data: MonthlyComparisonData[];
  currency: string;
}

// Helper to format currency
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Custom tooltip
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  const { t } = useTranslation();
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      border: '1px solid var(--border-subtle)',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: '#f1f5f9' }}>{label}</p>
      {payload.map((entry: any, index: number) => (
        <p 
          key={index}
          style={{ 
            margin: '0.25rem 0 0', 
            color: entry.color,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <span style={{ color: '#e2e8f0' }}>{entry.name}:</span>
          <span style={{ fontWeight: 500 }}>{formatCurrency(entry.value, currency)}</span>
        </p>
      ))}
      {payload[0]?.payload?.average && (
        <p style={{ 
          margin: '0.5rem 0 0', 
          color: '#94a3b8', 
          borderTop: '1px solid #334155',
          paddingTop: '0.5rem',
          fontSize: '0.85rem',
        }}>
          {t('charts.avgExpenses')} {formatCurrency(payload[0].payload.average, currency)}
        </p>
      )}
    </div>
  );
}

export function MonthlyComparisonChart({ data, currency }: MonthlyComparisonChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div className="empty-chart">
        <p>{t('charts.noMonthlyData')}</p>
      </div>
    );
  }

  // Calculate average for reference line
  const average = data.length > 0 
    ? data.reduce((sum, d) => sum + d.expenses, 0) / data.length 
    : 0;

  return (
    <div style={{ width: '100%', height: 350 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 20, right: 12, left: 0, bottom: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            stroke="var(--border-subtle)"
          />
          <YAxis 
            tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            stroke="var(--border-subtle)"
          />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Legend formatter={value => <span style={{ color: 'var(--text-primary)' }}>{value}</span>} />
          <ReferenceLine 
            y={average} 
            stroke="var(--warning)"
            strokeDasharray="5 5" 
            label={{ 
              value: t('charts.avg'), 
              position: 'insideTopRight',
              fill: 'var(--warning)',
              fontSize: 12,
            }} 
          />
          <Bar 
            dataKey="income" 
            name={t('charts.income')} 
            fill="var(--success)"
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="expenses" 
            name={t('charts.expenses')} 
            fill="var(--error)"
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
