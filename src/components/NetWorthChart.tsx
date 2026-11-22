import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { YearProjection } from '../types/calculator';
import { formatCurrency } from '../utils/allocationCalculator';
import { calculateXAxisInterval } from '../utils/chartHelper';
import { ChartZoomControls } from './ChartZoomControls';
import { CHART_THEME } from '../utils/chartColors';

// Privacy placeholder for blurred values
const PRIVACY_PLACEHOLDER = '***';

interface NetWorthChartProps {
  projections: YearProjection[];
  fireTarget: number;
  currentAge: number;
  zoomYears: number | 'all';
  onZoomChange: (years: number | 'all') => void;
  customZoomInput: string;
  onCustomZoomInputChange: (value: string) => void;
  isPrivacyMode?: boolean;
}

export const NetWorthChart: React.FC<NetWorthChartProps> = ({ 
  projections, 
  fireTarget, 
  currentAge,
  zoomYears,
  onZoomChange,
  customZoomInput,
  onCustomZoomInputChange,
  isPrivacyMode = false
}) => {
  const { t } = useTranslation();
  // Filter data based on zoom level
  const getFilteredData = () => {
    let filtered = projections;
    
    if (zoomYears !== 'all') {
      filtered = projections.filter(p => p.age <= currentAge + zoomYears);
    }
    
    return filtered.map(p => ({
      year: p.year,
      age: p.age,
      'Net Worth': p.portfolioValue,
      'FIRE Target': fireTarget,
    }));
  };

  const data = getFilteredData();

  // Format large numbers for Y axis (e.g., 1M, 5M, 10M)
  const formatYAxis = (value: number) => {
    if (isPrivacyMode) return PRIVACY_PLACEHOLDER;
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  return (
    <section className="chart-container" aria-labelledby="net-worth-chart-heading">
      <div className="chart-header">
        <h3 id="net-worth-chart-heading">{t('charts.netWorthGrowth')}</h3>
        <ChartZoomControls zoomYears={zoomYears} onZoomChange={onZoomChange} customZoomInput={customZoomInput} onCustomZoomInputChange={onCustomZoomInputChange} />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} aria-label={t('charts.netWorthChartAriaLabel')}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
          <XAxis 
            dataKey="age" 
            label={{ value: t('charts.ageLabel'), position: 'insideBottom', offset: -5, fill: CHART_THEME.text }}
            interval={calculateXAxisInterval(data.length)}
            padding={{ left: 10, right: 10 }}
            tick={{ fill: CHART_THEME.text }}
            stroke={CHART_THEME.axis}
          />
          <YAxis 
            tickFormatter={formatYAxis}
            domain={[0, 'auto']}
            allowDataOverflow={false}
            tick={{ fill: CHART_THEME.text }}
            stroke={CHART_THEME.axis}
          />
          <Tooltip 
            formatter={(value) => isPrivacyMode ? PRIVACY_PLACEHOLDER : formatCurrency(Number(value))} 
            labelFormatter={(label) => t('charts.ageTooltipLabel', { age: label })}
            contentStyle={{ background: CHART_THEME.tooltipBackground, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: '8px', color: CHART_THEME.textStrong }}
            labelStyle={{ color: CHART_THEME.textStrong }}
            itemStyle={{ color: CHART_THEME.textStrong }}
          />
          <Legend wrapperStyle={{ paddingTop: '12px', color: CHART_THEME.textStrong }} />
          <Line type="monotone" dataKey="Net Worth" name={t('charts.netWorth')} stroke="var(--accent-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="FIRE Target" name={t('charts.fireTarget')} stroke="var(--success)" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
};
