import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { CashflowForecast } from '../utils/cashflowSchedules';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { ASSET_CLASS_CHART_COLORS } from '../utils/chartColors';
import { ChartLegend } from './ChartLegend';

export function CashflowForecastChart({ forecast }: { forecast: CashflowForecast }) {
  const { t } = useTranslation();
  const color = ASSET_CLASS_CHART_COLORS.CASH;
  return <>
    <div className="planning-scroll" role="region" tabIndex={0} aria-label={t('planning.forecast')}>
      <div className="planning-chart"><ResponsiveContainer width="100%" height={280}>
        <LineChart data={forecast.points} margin={{ top: 12, right: 30, left: 15, bottom: 20 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
          <XAxis dataKey="date" minTickGap={48} stroke="var(--text-secondary)" />
          <YAxis width={100} stroke="var(--text-secondary)" tickFormatter={value => formatDisplayCurrency(Number(value), forecast.inputs.currency)} />
          <Tooltip contentStyle={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            formatter={value => [formatDisplayCurrency(Number(value), forecast.inputs.currency), t('planning.balance')]} />
          <Line dataKey="balance" name={t('planning.balance')} stroke={color} strokeWidth={2} type="stepAfter" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer></div>
    </div>
    <ChartLegend items={[{ label: t('planning.balance'), color }]} ariaLabel={t('planning.forecast')} />
  </>;
}
