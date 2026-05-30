import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CategoryBreakdown, getCategoryInfo, CustomCategory } from '../types/expenseTracker';
import { MaterialIcon } from './MaterialIcon';

// Color palette for categories
const COLORS = [
  '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe',
  '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140',
  '#30cfd0', '#330867', '#a8eb12', '#fccb90', '#d57eeb',
  '#e0c3fc', '#8fd3f4',
];

interface ExpenseBreakdownChartProps {
  data: CategoryBreakdown[];
  currency: string;
  customCategories?: CustomCategory[];
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
  currency: string;
  customCategories?: CustomCategory[];
}

function CustomTooltip({ active, payload, currency, customCategories }: CustomTooltipProps) {
  const { t } = useTranslation();
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const categoryInfo = getCategoryInfo(data.category, customCategories);

  return (
    <div style={{
      background: '#1A1D26',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      border: '1px solid rgba(20, 120, 150, 0.4)',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: '#F8FAFC' }}>
        <MaterialIcon name={categoryInfo.icon} size="small" /> {categoryInfo.name}
      </p>
      <p style={{ margin: '0.25rem 0 0', color: '#94A3B8' }}>
        {formatCurrency(data.totalAmount, currency)} ({data.percentage.toFixed(1)}%)
      </p>
      <p style={{ margin: '0.25rem 0 0', color: '#64748B', fontSize: '0.85rem' }}>
        {t('charts.transactionCount', { count: data.transactionCount })}
      </p>
    </div>
  );
}

// Custom label
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null; // Don't show labels for very small slices

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#0A0B0E"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '0.8rem', fontWeight: 700 }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function ExpenseBreakdownChart({ data, currency, customCategories }: ExpenseBreakdownChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem', 
        color: '#94A3B8',
        background: '#1A1D26',
        borderRadius: '8px',
      }}>
        <p>{t('charts.noExpenseData')}</p>
      </div>
    );
  }

  // Prepare chart data with category info - use custom category color if available
  const chartData = data.map((item, index) => {
    const categoryInfo = getCategoryInfo(item.category, customCategories);
    return {
      ...item,
      name: categoryInfo.name,
      // Use custom category color if available, otherwise fall back to default colors
      color: categoryInfo.color || COLORS[index % COLORS.length],
    };
  });

  // Create a custom legend renderer with access to customCategories
  const renderLegendWithCategories = (props: any) => {
    const { payload } = props;
    
    return (
      <ul style={{ 
        listStyle: 'none', 
        padding: 0, 
        margin: '1.5rem 0 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.5rem',
      }}>
        {payload.map((entry: any, index: number) => {
          const categoryInfo = getCategoryInfo(entry.payload.category, customCategories);
          return (
            <li 
              key={`legend-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                background: entry.color,
                flexShrink: 0,
              }} />
              <span style={{ color: '#F8FAFC' }}>
                <MaterialIcon name={categoryInfo.icon} size="small" /> {categoryInfo.name}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div style={{ width: '100%', height: 450, paddingTop: '1rem' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={120}
            dataKey="totalAmount"
            nameKey="name"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip currency={currency} customCategories={customCategories} />} />
          <Legend content={(props) => renderLegendWithCategories(props)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
