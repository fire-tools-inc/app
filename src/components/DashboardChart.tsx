import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ChartData } from '../types/assetAllocation';
import type { SupportedCurrency } from '../types/currency';
import { formatAbbreviatedCurrency, formatAssetName } from '../utils/allocationCalculator';
import { ASSET_CLASS_CHART_COLORS } from '../utils/chartColors';
import { getCurrencySymbol } from '../utils/currencyConverter';
import { formatDashboardMonth, type DashboardCashflowPoint, type DashboardNetWorthPoint } from '../utils/dashboard';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { AllocationChart } from './AllocationChart';
import { ChartLegend } from './ChartLegend';

interface ChartOptions {
  currency: SupportedCurrency;
  isPrivacyMode: boolean;
}

type DashboardChartProps = ChartOptions & (
  | { kind: 'net-worth'; data: DashboardNetWorthPoint[] }
  | { kind: 'cashflow'; data: DashboardCashflowPoint[] }
  | { kind: 'allocation'; data: ChartData[] }
);

interface DashboardTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string }>;
  formatValue: (value: number) => string;
}

function DashboardTooltip({ active, payload, label, formatValue }: DashboardTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dashboard-tooltip">
      <strong>{label}</strong>
      {payload.map((entry, index) => typeof entry.value === 'number'
        ? <p key={index}>{entry.name}: {formatValue(entry.value)}</p> : null)}
    </div>
  );
}

export function DashboardChart(props: DashboardChartProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const formatValue = (value: number) => props.isPrivacyMode ? '***' : formatDisplayCurrency(value, props.currency);
  const formatAxis = (value: number) => props.isPrivacyMode
    ? '***' : formatAbbreviatedCurrency(value, getCurrencySymbol(props.currency));
  const label = (period: string) => formatDashboardMonth(period, language);
  const colors = { income: ASSET_CLASS_CHART_COLORS.STOCKS, expenses: 'var(--warning)' };

  if (props.kind === 'allocation') {
    return <AllocationChart data={props.data.map(entry => ({
      ...entry,
      name: t(`dialogs.shared.assetClassNames.${entry.name}`, { defaultValue: formatAssetName(entry.name) }),
    }))}
      title={t('dashboard.assetAllocation')} currency={props.currency} isPrivacyMode={props.isPrivacyMode} />;
  }

  const title = t(props.kind === 'net-worth' ? 'dashboard.netWorthHistory' : 'dashboard.monthlyCashflow');
  return (
    <div className="dashboard-chart">
      <ResponsiveContainer width="100%" height={260} minWidth={0}>
        {props.kind === 'net-worth' ? (
          <LineChart data={props.data.map(point => ({ ...point, label: label(point.period) }))}
            margin={{ top: 20, right: 16, bottom: 8, left: 0 }} aria-label={title}>
            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="var(--text-secondary)" minTickGap={32} />
            <YAxis tickFormatter={formatAxis} stroke="var(--text-secondary)" width={66} domain={['auto', 'auto']} />
            <Tooltip content={<DashboardTooltip formatValue={formatValue} />} />
            <Line dataKey="netWorth" name={t('dashboard.netWorth')} type="linear"
              stroke={ASSET_CLASS_CHART_COLORS.STOCKS} strokeWidth={2}
              dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        ) : (
          <BarChart data={props.data.map(point => ({ ...point, label: label(point.period) }))}
            margin={{ top: 20, right: 16, bottom: 8, left: 0 }} barGap={4} aria-label={title}>
            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="var(--text-secondary)" minTickGap={32} />
            <YAxis tickFormatter={formatAxis} stroke="var(--text-secondary)" width={66} />
            <Tooltip content={<DashboardTooltip formatValue={formatValue} />} />
            <Bar dataKey="totalIncome" name={t('charts.income')} fill={colors.income}
              maxBarSize={32} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="totalExpenses" name={t('charts.expenses')} fill={colors.expenses}
              maxBarSize={32} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        )}
      </ResponsiveContainer>
      {props.kind === 'cashflow' && <ChartLegend ariaLabel={title} items={[
        { label: t('charts.income'), color: colors.income },
        { label: t('charts.expenses'), color: colors.expenses },
      ]} />}
      <details className="dashboard-chart-data">
        <summary>{t('dashboard.viewData')}</summary>
        <div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label={`${t('dashboard.viewData')}: ${title}`}>
          <table>
            <caption>{title}</caption>
            <thead><tr>
              <th scope="col">{t('dashboard.month')}</th>
              {props.kind === 'net-worth' ? <th scope="col">{t('dashboard.netWorth')}</th> : <>
                <th scope="col">{t('charts.income')}</th><th scope="col">{t('charts.expenses')}</th><th scope="col">{t('dashboard.monthlyBalance')}</th>
              </>}
            </tr></thead>
            <tbody>{props.kind === 'net-worth'
              ? props.data.map(point => <tr key={point.period}><th scope="row">{label(point.period)}</th><td>{formatValue(point.netWorth)}</td></tr>)
              : props.data.map(point => <tr key={point.period}><th scope="row">{label(point.period)}</th>
                <td>{formatValue(point.totalIncome)}</td><td>{formatValue(point.totalExpenses)}</td><td>{formatValue(point.netBalance)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
