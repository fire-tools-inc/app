import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { YearProjection } from '../types/calculator';
import { formatCurrency } from '../utils/allocationCalculator';
import { calculateXAxisInterval, calculateBarSize } from '../utils/chartHelper';
import { ChartZoomControls } from './ChartZoomControls';

// Privacy placeholder for blurred values
const PRIVACY_PLACEHOLDER = '***';

interface IncomeExpensesChartProps {
  projections: YearProjection[];
  currentAge: number;
  zoomYears: number | 'all';
  onZoomChange: (years: number | 'all') => void;
  customZoomInput: string;
  onCustomZoomInputChange: (value: string) => void;
  isPrivacyMode?: boolean;
}

export const IncomeExpensesChart: React.FC<IncomeExpensesChartProps> = ({ 
  projections, 
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
      'Labor Income': p.laborIncome,
      'Investment Yield': p.investmentYield,
      'State Pension': p.statePensionIncome,
      'Private Pension': p.privatePensionIncome,
      'Other Income': p.otherIncome,
      'Expenses': p.expenses,
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
    <section className="chart-container" aria-labelledby="income-expenses-chart-heading">
      <div className="chart-header">
        <h3 id="income-expenses-chart-heading">{t('charts.incomeVsExpenses')}</h3>
        <ChartZoomControls zoomYears={zoomYears} onZoomChange={onZoomChange} customZoomInput={customZoomInput} onCustomZoomInputChange={onCustomZoomInputChange} />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} aria-label={t('charts.incomeExpensesChartAriaLabel')} barSize={calculateBarSize(data.length)}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" />
          <XAxis 
            dataKey="age" 
            label={{ value: t('charts.ageLabel'), position: 'insideBottom', offset: -5, fill: '#94A3B8' }}
            interval={calculateXAxisInterval(data.length)}
            tick={{ fill: '#94A3B8' }}
            stroke="#3A3D46"
          />
          <YAxis 
            tickFormatter={formatYAxis}
            domain={[0, 'auto']}
            allowDataOverflow={false}
            tick={{ fill: '#94A3B8' }}
            stroke="#3A3D46"
          />
          <Tooltip 
            formatter={(value) => isPrivacyMode ? PRIVACY_PLACEHOLDER : formatCurrency(Number(value))} 
            labelFormatter={(label) => t('charts.ageTooltipLabel', { age: label })}
            contentStyle={{ background: '#1A1D26', border: '1px solid #2DD4BF', borderRadius: '8px', color: '#F8FAFC' }}
            labelStyle={{ color: '#F8FAFC' }}
            itemStyle={{ color: '#F8FAFC' }}
          />
          <Legend wrapperStyle={{ paddingTop: '12px', color: '#F8FAFC' }} />
          <Bar dataKey="Labor Income" name={t('charts.laborIncome')} fill="var(--success)" isAnimationActive={false} />
          <Bar dataKey="Investment Yield" name={t('charts.investmentYield')} fill="var(--accent-primary)" isAnimationActive={false} />
          <Bar dataKey="State Pension" name={t('charts.statePension')} fill="var(--accent-gold)" isAnimationActive={false} />
          <Bar dataKey="Private Pension" name={t('charts.privatePension')} fill="var(--warning)" isAnimationActive={false} />
          <Bar dataKey="Other Income" name={t('charts.otherIncome')} fill="#88CDD5" isAnimationActive={false} />
          <Bar dataKey="Expenses" name={t('charts.expenses')} fill="var(--error)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
};
