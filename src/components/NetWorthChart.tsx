import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { YearProjection } from '../types/calculator';
import { formatCurrency } from '../utils/allocationCalculator';
import { calculateXAxisInterval } from '../utils/chartHelper';

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

  const handleCustomZoomSubmit = () => {
    const years = parseInt(customZoomInput);
    if (!isNaN(years) && years > 0) {
      onZoomChange(years);
    }
  };

  const handleCustomZoomKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCustomZoomSubmit();
    }
  };

  const buttonStyle = (isActive: boolean) => ({
    padding: '5px 10px',
    border: '1px solid #3A3D46',
    borderRadius: '4px',
    background: isActive ? '#2DD4BF' : '#1A1D26',
    color: isActive ? 'white' : '#94A3B8',
    cursor: 'pointer',
    fontSize: '12px',
  });

  return (
    <section className="chart-container" aria-labelledby="net-worth-chart-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 id="net-worth-chart-heading">{t('charts.netWorthGrowth')}</h3>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} role="group" aria-label={t('charts.zoomControls')}>
          <button
            onClick={() => onZoomChange(20)}
            className={`zoom-button ${zoomYears === 20 ? 'active' : ''}`}
            style={buttonStyle(zoomYears === 20)}
            aria-pressed={zoomYears === 20}
            aria-label={t('charts.zoomTo20AriaLabel')}
          >
            {t('charts.zoom20Years')}
          </button>
          <button
            onClick={() => onZoomChange(30)}
            className={`zoom-button ${zoomYears === 30 ? 'active' : ''}`}
            style={buttonStyle(zoomYears === 30)}
            aria-pressed={zoomYears === 30}
            aria-label={t('charts.zoomTo30AriaLabel')}
          >
            {t('charts.zoom30Years')}
          </button>
          <button
            onClick={() => onZoomChange(40)}
            className={`zoom-button ${zoomYears === 40 ? 'active' : ''}`}
            style={buttonStyle(zoomYears === 40)}
            aria-pressed={zoomYears === 40}
            aria-label={t('charts.zoomTo40AriaLabel')}
          >
            {t('charts.zoom40Years')}
          </button>
          <button
            onClick={() => onZoomChange('all')}
            className={`zoom-button ${zoomYears === 'all' ? 'active' : ''}`}
            style={buttonStyle(zoomYears === 'all')}
            aria-pressed={zoomYears === 'all'}
            aria-label={t('charts.showAllYearsAriaLabel')}
          >
            {t('charts.zoomAllYears')}
          </button>
          <input
            type="number"
            inputMode="numeric"
            placeholder={t('charts.customZoomPlaceholder')}
            value={customZoomInput}
            onChange={(e) => onCustomZoomInputChange(e.target.value)}
            onKeyPress={handleCustomZoomKeyPress}
            onBlur={handleCustomZoomSubmit}
            style={{
              width: '70px',
              padding: '5px',
              border: '1px solid #3A3D46',
              borderRadius: '4px',
              fontSize: '12px',
              background: '#1A1D26',
              color: '#F8FAFC',
            }}
            min="1"
            step="1"
            aria-label={t('charts.customZoomAriaLabel')}
          />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} aria-label={t('charts.netWorthChartAriaLabel')}>
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
            labelFormatter={(label) => t('charts.ageTooltip', { age: label })}
            contentStyle={{ background: '#1A1D26', border: '1px solid #2DD4BF', borderRadius: '8px', color: '#F8FAFC' }}
            labelStyle={{ color: '#F8FAFC' }}
            itemStyle={{ color: '#F8FAFC' }}
          />
          <Legend wrapperStyle={{ paddingTop: '12px', color: '#F8FAFC' }} />
          <Line type="monotone" dataKey="Net Worth" name={t('charts.netWorth')} stroke="#22C55E" strokeWidth={2} />
          <Line type="monotone" dataKey="FIRE Target" name={t('charts.fireTarget')} stroke="#2DD4BF" strokeWidth={2} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
};
