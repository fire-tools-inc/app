import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SupportedCurrency } from '../types/currency';
import { formatAbbreviatedCurrency } from '../utils/allocationCalculator';
import { ASSET_CLASS_CHART_COLORS } from '../utils/chartColors';
import { getCurrencySymbol } from '../utils/currencyConverter';
import { formatDashboardMonth } from '../utils/dashboard';
import type { ExpenseStatisticsPoint } from '../utils/expenseStatistics';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { ChartLegend } from './ChartLegend';

interface ExpenseStatisticsChartProps {
  data: ExpenseStatisticsPoint[];
  average: number;
  currency: SupportedCurrency;
  isPrivacyMode: boolean;
}

export function ExpenseStatisticsChart({ data, average, currency, isPrivacyMode }: ExpenseStatisticsChartProps) {
  const { t, i18n } = useTranslation();
  const title = t('expenseStatistics.title');
  const points = data.map(point => ({
    ...point,
    label: point.period.length === 4 ? point.period : formatDashboardMonth(point.period, i18n.resolvedLanguage ?? 'en'),
  }));
  return (
    <>
      <div className="expense-statistics-plot" role="region" tabIndex={0} aria-label={title}>
        <div style={{ minWidth: Math.max(260, data.length * 48 + 100), height: 280 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={points} margin={{ top: 20, right: 20, bottom: 12, left: 0 }} aria-label={title}>
              <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--text-secondary)" minTickGap={24} />
              <YAxis width={70} stroke="var(--text-secondary)" tickFormatter={value => isPrivacyMode ? '***'
                : formatAbbreviatedCurrency(value, getCurrencySymbol(currency))} />
              <Tooltip formatter={value => typeof value === 'number'
                ? (isPrivacyMode ? '***' : formatDisplayCurrency(value, currency)) : ''}
                contentStyle={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} />
              <ReferenceLine y={average} stroke="var(--warning)" strokeDasharray="5 5" />
              <Bar dataKey="total" name={t('expenseStatistics.total')} fill={ASSET_CLASS_CHART_COLORS.STOCKS}
                maxBarSize={36} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartLegend ariaLabel={title} items={[
        { label: t('expenseStatistics.total'), color: ASSET_CLASS_CHART_COLORS.STOCKS },
        { label: t('expenseStatistics.average'), color: 'var(--warning)' },
      ]} />
    </>
  );
}
