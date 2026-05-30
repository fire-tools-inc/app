import { useTranslation } from 'react-i18next';
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
import { CategoryTrendData, getCategoryInfo, ExpenseCategory, CustomCategory } from '../types/expenseTracker';
import { MaterialIcon } from './MaterialIcon';

// Color palette for categories
const CATEGORY_COLORS: Record<string, string> = {
  HOUSING: '#667eea',
  UTILITIES: '#764ba2',
  TRANSPORTATION: '#f093fb',
  GROCERIES: '#4facfe',
  DINING_OUT: '#f5576c',
  HEALTHCARE: '#43e97b',
  INSURANCE: '#30cfd0',
  ENTERTAINMENT: '#fa709a',
  SHOPPING: '#fee140',
  PERSONAL_CARE: '#a8eb12',
  EDUCATION: '#8fd3f4',
  DEBT_PAYMENTS: '#330867',
  SAVINGS: '#38f9d7',
  INVESTMENTS: '#00f2fe',
  GIFTS_DONATIONS: '#fccb90',
  SUBSCRIPTIONS: '#d57eeb',
  OTHER: '#e0c3fc',
};

interface SpendingTrendChartProps {
  data: CategoryTrendData[];
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

// Get color for a category (supports custom categories)
function getCategoryColor(categoryId: string, customCategories?: CustomCategory[]): string {
  // Check built-in colors first
  if (CATEGORY_COLORS[categoryId]) {
    return CATEGORY_COLORS[categoryId];
  }
  
  // Check custom categories
  if (customCategories) {
    const customCat = customCategories.find(c => c.id === categoryId);
    if (customCat && customCat.color) {
      return customCat.color;
    }
  }
  
  // Fallback color
  return '#666666';
}

// Custom tooltip
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
  customCategories?: CustomCategory[];
}

function CustomTooltip({ active, payload, label, currency, customCategories }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  // Sort by value descending
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));

  return (
    <div style={{
      background: '#1e293b',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      border: '1px solid #334155',
      maxHeight: '300px',
      overflowY: 'auto',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem' }}>{label}</p>
      {sortedPayload.map((entry: any, index: number) => {
        if (!entry.value) return null;
        const categoryInfo = getCategoryInfo(entry.dataKey as ExpenseCategory | string, customCategories);
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e2e8f0' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: entry.color,
              }} />
              <MaterialIcon name={categoryInfo.icon} size="small" /> {categoryInfo.name}
            </span>
            <span style={{ fontWeight: 500, color: entry.color }}>
              {formatCurrency(entry.value, currency)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function SpendingTrendChart({ data, currency, customCategories }: SpendingTrendChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem', 
        color: '#666',
        background: '#f8f9fa',
        borderRadius: '8px',
      }}>
        <p>{t('charts.noTrendData')}</p>
      </div>
    );
  }

  const activeCategories = getActiveCategories(data);

  if (activeCategories.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem', 
        color: '#666',
        background: '#f8f9fa',
        borderRadius: '8px',
      }}>
        <p>{t('charts.noCategoryData')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12 }}
            tickLine={{ stroke: '#ccc' }}
          />
          <YAxis 
            tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            tick={{ fontSize: 12 }}
            tickLine={{ stroke: '#ccc' }}
          />
          <Tooltip content={<CustomTooltip currency={currency} customCategories={customCategories} />} />
          <Legend 
            formatter={(value) => {
              const categoryInfo = getCategoryInfo(value as ExpenseCategory | string, customCategories);
              return <span style={{ color: '#F8FAFC' }}>{categoryInfo.name}</span>;
            }}
            wrapperStyle={{ fontSize: '0.85rem', paddingTop: '12px' }}
          />
          {activeCategories.map((category) => (
            <Line
              key={category}
              type="monotone"
              dataKey={category}
              name={category}
              stroke={getCategoryColor(category, customCategories)}
              strokeWidth={2}
              dot={{ fill: getCategoryColor(category, customCategories), strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
