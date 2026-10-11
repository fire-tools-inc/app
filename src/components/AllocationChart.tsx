import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartData } from '../types/assetAllocation';
import { formatCurrency, formatPercent } from '../utils/allocationCalculator';
import { getChartColor } from '../utils/chartColors';
import { ChartLegend } from './ChartLegend';
import './AllocationChart.css';

interface AllocationChartProps {
  data: ChartData[];
  title: string;
  currency: string;
  isPrivacyMode?: boolean;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartData }>;
}

export const AllocationChart: React.FC<AllocationChartProps> = ({ data, title, currency, isPrivacyMode = false }) => {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <section className="chart-container allocation-chart">
        <h3>{title}</h3>
        <div className="empty-chart">{t('charts.noDataToDisplay')}</div>
      </section>
    );
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    const entry = payload?.[0]?.payload;
    if (!active || !entry) return null;
    return (
      <div className="custom-tooltip">
        <p className="label"><strong>{entry.name}</strong></p>
        <p className="value">{isPrivacyMode ? '***' : formatCurrency(entry.value, currency)}</p>
        <p className="percentage">{isPrivacyMode ? '***' : formatPercent(entry.percentage)}</p>
      </div>
    );
  };

  return (
    <section className="chart-container allocation-chart">
      <h3>{title}</h3>
      <div className="allocation-chart-body">
        <ResponsiveContainer width="100%" height={240} minWidth={0}>
          <PieChart aria-label={title}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius="78%"
              innerRadius="54%"
              paddingAngle={2}
              stroke="var(--bg-secondary)"
              strokeWidth={2}
              dataKey="value"
              nameKey="name"
              isAnimationActive={false}
            >
              {data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color || getChartColor(index)} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <ChartLegend ariaLabel={title} items={data.map((entry, index) => ({
          label: entry.name,
          color: entry.color || getChartColor(index),
          value: isPrivacyMode ? '***' : formatPercent(entry.percentage),
        }))} />
      </div>
    </section>
  );
};
