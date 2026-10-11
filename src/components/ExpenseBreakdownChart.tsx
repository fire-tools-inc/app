import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CategoryBreakdown, getCategoryInfo, CustomCategory, CategoryOverride } from '../types/expenseTracker';
import { getExpenseCategoryColor } from '../utils/expenseChartColors';
import { MaterialIcon } from './MaterialIcon';
import { ChartLegend } from './ChartLegend';

interface ExpenseBreakdownChartProps {
  data: CategoryBreakdown[];
  title: string;
  currency: string;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategoryBreakdown }>;
  currency: string;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
}

function CustomTooltip({ active, payload, currency, customCategories, categoryOverrides }: CustomTooltipProps) {
  const { t } = useTranslation();
  const data = payload?.[0]?.payload;
  if (!active || !data) return null;
  const info = getCategoryInfo(data.category, customCategories, categoryOverrides);

  return (
    <div className="custom-tooltip">
      <p className="label"><strong><MaterialIcon name={info.icon} size="small" /> {info.name}</strong></p>
      <p className="value">{formatCurrency(data.totalAmount, currency)} ({data.percentage.toFixed(1)}%)</p>
      <p>{t('charts.transactionCount', { count: data.transactionCount })}</p>
    </div>
  );
}

export function ExpenseBreakdownChart({ data, title, currency, customCategories, categoryOverrides }: ExpenseBreakdownChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return <div className="empty-chart">{t('charts.noExpenseData')}</div>;
  }

  const chartData = data.map(item => {
    const info = getCategoryInfo(item.category, customCategories, categoryOverrides);
    return {
      ...item,
      name: info.name,
      icon: info.icon,
      color: getExpenseCategoryColor(item.category, customCategories, categoryOverrides),
    };
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <PieChart aria-label={title}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius="85%"
            dataKey="totalAmount"
            nameKey="name"
            stroke="var(--bg-secondary)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {chartData.map(entry => <Cell key={entry.category} fill={entry.color} />)}
          </Pie>
          <Tooltip content={<CustomTooltip currency={currency} customCategories={customCategories} categoryOverrides={categoryOverrides} />} />
        </PieChart>
      </ResponsiveContainer>
      <ChartLegend ariaLabel={title} items={chartData.map(entry => ({
        label: entry.name, icon: entry.icon, color: entry.color, value: `${entry.percentage.toFixed(1)}%`,
      }))} />
    </div>
  );
}
