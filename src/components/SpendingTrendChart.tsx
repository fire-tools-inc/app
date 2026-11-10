import { useTranslation } from 'react-i18next';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from 'recharts';
import { CategoryTrendData, getCategoryInfo, CustomCategory, CategoryOverride } from '../types/expenseTracker';
import { getExpenseCategoryColor } from '../utils/expenseChartColors';
import { MaterialIcon } from './MaterialIcon';
import { ChartLegend } from './ChartLegend';

interface SpendingTrendChartProps {
  data: CategoryTrendData[];
  currency: string;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
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

// Get all categories that have data
function getActiveCategories(data: CategoryTrendData[]): string[] {
  const categories = new Set<string>();
  
  for (const monthData of data) {
    for (const key of Object.keys(monthData)) {
      if (key !== 'month' && typeof monthData[key] === 'number') {
        categories.add(key);
      }
    }
  }
  
  return Array.from(categories);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string; color?: string }>;
  label?: string;
  currency: string;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
}

function CustomTooltip({ active, payload, label, currency, customCategories, categoryOverrides }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  // Sort by value descending
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      border: '1px solid var(--border-subtle)',
      maxHeight: '300px',
      overflowY: 'auto',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{label}</p>
      {sortedPayload.map((entry, index) => {
        if (!entry.value) return null;
        const categoryInfo = getCategoryInfo(entry.dataKey || 'OTHER', customCategories, categoryOverrides);
        return (
          <p 
            key={index}
            style={{ 
              margin: '0.25rem 0', 
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: entry.color,
              }} />
              <MaterialIcon name={categoryInfo.icon} size="small" /> {categoryInfo.name}
            </span>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {formatCurrency(entry.value, currency)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function SpendingTrendChart({ data, currency, customCategories, categoryOverrides }: SpendingTrendChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div className="empty-chart">
        <p>{t('charts.noTrendData')}</p>
      </div>
    );
  }

  const activeCategories = getActiveCategories(data);

  if (activeCategories.length === 0) {
    return (
      <div className="empty-chart">
        <p>{t('charts.noCategoryData')}</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320} minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 12, left: 0, bottom: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            stroke="var(--border-subtle)"
            padding={{ left: 8, right: 8 }}
          />
          <YAxis 
            tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
            stroke="var(--border-subtle)"
          />
          <Tooltip content={<CustomTooltip currency={currency} customCategories={customCategories} categoryOverrides={categoryOverrides} />} />
          {activeCategories.map((category) => (
            <Line
              key={category}
              type="monotone"
              dataKey={category}
              name={category}
              stroke={getExpenseCategoryColor(category, customCategories, categoryOverrides)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend ariaLabel={t('expenseTracker.categorySpendingTrends')} items={activeCategories.map(category => {
        const info = getCategoryInfo(category, customCategories, categoryOverrides);
        return { label: info.name, icon: info.icon, color: getExpenseCategoryColor(category, customCategories, categoryOverrides) };
      })} />
    </div>
  );
}
