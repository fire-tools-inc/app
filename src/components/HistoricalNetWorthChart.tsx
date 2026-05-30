import { useState, useMemo } from 'react';
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
  ReferenceLine,
} from 'recharts';
import { MonthlyVariation, NetWorthForecast } from '../types/netWorthTracker';
import { MaterialIcon } from './MaterialIcon';
import { SupportedCurrency, SUPPORTED_CURRENCIES, DEFAULT_FALLBACK_RATES } from '../types/currency';
import { 
  convertMonthlyVariationsToDisplayCurrency, 
  convertNetWorthForecastToDisplayCurrency,
} from '../utils/currencyConverter';

export type ChartViewMode = 'ytd' | 'all';

interface HistoricalNetWorthChartProps {
  variations: MonthlyVariation[];
  forecast: NetWorthForecast[];
  currency: SupportedCurrency;
  previousYearEnd: number | null;
  viewMode: ChartViewMode;
  onViewModeChange: (mode: ChartViewMode) => void;
  isPrivacyMode?: boolean; // Privacy mode for blurring values
}

// Privacy placeholder for blurred values
const PRIVACY_PLACEHOLDER = '***';

// Helper to format currency for chart
function formatChartCurrency(amount: number, isPrivacyMode: boolean = false): string {
  if (isPrivacyMode) return PRIVACY_PLACEHOLDER;
  
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (absAmount >= 1000000) {
    return `${sign}${(absAmount / 1000000).toFixed(1)}M`;
  }
  if (absAmount >= 1000) {
    return `${sign}${(absAmount / 1000).toFixed(0)}k`;
  }
  return `${sign}${absAmount.toFixed(0)}`;
}

// Get currency symbol
function getCurrencySymbol(currency: SupportedCurrency): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency);
  return currencyInfo?.symbol || currency;
}

// Colors for additional currency lines
const ADDITIONAL_CURRENCY_COLORS: Record<SupportedCurrency, string> = {
  EUR: '#4CAF50',
  USD: '#2196F3',
  GBP: '#9C27B0',
  CHF: '#FF5722',
  JPY: '#E91E63',
  AUD: '#00BCD4',
  CAD: '#795548',
};

export function HistoricalNetWorthChart({
  variations,
  forecast,
  currency,
  previousYearEnd,
  viewMode,
  onViewModeChange,
  isPrivacyMode = false,
}: HistoricalNetWorthChartProps) {
  const { t } = useTranslation();
  const [showForecast, setShowForecast] = useState(true);
  const [additionalCurrencies, setAdditionalCurrencies] = useState<SupportedCurrency[]>([]);

  // Toggle additional currency for display
  const toggleCurrency = (curr: SupportedCurrency) => {
    if (curr === currency) return; // Can't toggle primary currency
    setAdditionalCurrencies(prev => 
      prev.includes(curr) 
        ? prev.filter(c => c !== curr)
        : [...prev, curr]
    );
  };

  // Available currencies for selection (excluding primary)
  const availableCurrencies = useMemo(() => 
    SUPPORTED_CURRENCIES.filter(c => c.code !== currency),
    [currency]
  );

  // Convert variations for each additional currency
  const convertedVariationsMap = useMemo(() => {
    const map = new Map<SupportedCurrency, MonthlyVariation[]>();
    for (const curr of additionalCurrencies) {
      map.set(curr, convertMonthlyVariationsToDisplayCurrency(
        variations, 
        currency, 
        curr, 
        DEFAULT_FALLBACK_RATES
      ));
    }
    return map;
  }, [variations, currency, additionalCurrencies]);

  // Convert forecast for each additional currency
  const convertedForecastMap = useMemo(() => {
    const map = new Map<SupportedCurrency, NetWorthForecast[]>();
    for (const curr of additionalCurrencies) {
      map.set(curr, convertNetWorthForecastToDisplayCurrency(
        forecast, 
        currency, 
        curr, 
        DEFAULT_FALLBACK_RATES
      ));
    }
    return map;
  }, [forecast, currency, additionalCurrencies]);

  // Define chart data point type
  type ChartDataPoint = {
    month: string;
    type: 'actual' | 'forecast';
    netWorth?: number;
    forecast?: number;
    [key: string]: string | number | undefined;
  };

  // Combine actual and forecast data with additional currencies
  const chartData = useMemo((): ChartDataPoint[] => {
    // Create base data structure with primary currency
    const dataPoints: Record<string, ChartDataPoint> = {};
    
    // Add primary currency actual data
    for (const v of variations) {
      dataPoints[v.month] = {
        month: v.month,
        netWorth: v.netWorth,
        type: 'actual',
      };
    }
    
    // Add primary currency forecast data
    if (showForecast) {
      for (const f of forecast) {
        if (!dataPoints[f.month]) {
          dataPoints[f.month] = { month: f.month, type: 'forecast' };
        }
        dataPoints[f.month].forecast = f.projectedNetWorth;
      }
    }
    
    // Add additional currency data
    for (const curr of additionalCurrencies) {
      const convertedVariations = convertedVariationsMap.get(curr) || [];
      const convertedForecast = convertedForecastMap.get(curr) || [];
      
      // Add converted actual data
      for (const v of convertedVariations) {
        if (dataPoints[v.month]) {
          dataPoints[v.month][`netWorth_${curr}`] = v.netWorth;
        }
      }
      
      // Add converted forecast data
      if (showForecast) {
        for (const f of convertedForecast) {
          if (dataPoints[f.month]) {
            dataPoints[f.month][`forecast_${curr}`] = f.projectedNetWorth;
          }
        }
      }
    }
    
    // Convert to array and sort by month
    return Object.values(dataPoints).sort((a, b) => {
      // Extract year and month from "Jan 2024" format
      const parseMonth = (str: string) => {
        const parts = str.split(' ');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIdx = monthNames.indexOf(parts[0]);
        const year = parseInt(parts[1] || '0', 10);
        return year * 12 + monthIdx;
      };
      return parseMonth(a.month) - parseMonth(b.month);
    });
  }, [variations, forecast, showForecast, additionalCurrencies, convertedVariationsMap, convertedForecastMap]);

  // Separate lines for actual and forecast
  const actualData = useMemo(() => 
    chartData.filter(d => d.type === 'actual'), 
    [chartData]
  );

  const forecastData = useMemo(() => 
    chartData.filter(d => d.type === 'forecast'), 
    [chartData]
  );

  // Combined data for continuous line effect
  const combinedData = useMemo(() => {
    if (forecastData.length === 0 || actualData.length === 0) {
      return actualData;
    }
    
    // Add the last actual point with forecast value for continuity
    // But don't duplicate if the forecast starts at the same month
    const lastActual = actualData[actualData.length - 1];
    const firstForecast = forecastData[0];
    
    // If forecast starts at the same month as last actual, skip adding duplicate
    if (firstForecast && firstForecast.month === lastActual.month) {
      return [
        ...actualData,
        ...forecastData.map(f => ({ 
          ...f,
          netWorth: f.month === lastActual.month ? lastActual.netWorth : undefined, 
          forecast: f.forecast,
          type: 'forecast' as const 
        })),
      ];
    }
    
    // Modify the last actual point to also have forecast value for continuity
    // instead of adding a duplicate data point
    const actualWithBridge = actualData.map((d, i) => 
      i === actualData.length - 1 
        ? { ...d, forecast: d.netWorth }
        : d
    );
    
    return [
      ...actualWithBridge,
      ...forecastData.map(f => ({ 
        ...f,
        netWorth: undefined, 
        forecast: f.forecast,
        type: 'forecast' as const 
      })),
    ];
  }, [actualData, forecastData]);

  // Get minimum months needed for high confidence
  const minMonthsForHighConfidence = 24;
  const minMonthsForMediumConfidence = 6;

  // For "All" view mode - get only the indices where year changes
  const yearChangeIndices = useMemo(() => {
    if (viewMode !== 'all') return new Set<number>();
    
    const indices = new Set<number>();
    let lastYear = '';
    
    combinedData.forEach((d, i) => {
      const parts = d.month.split(' ');
      const year = parts[1] || '';
      if (year !== lastYear) {
        indices.add(i);
        lastYear = year;
      }
    });
    
    return indices;
  }, [combinedData, viewMode]);

  // Calculate Y-axis domain with extra padding at the top
  const yAxisDomain = useMemo((): [number, number] => {
    // Find the maximum value across all data points
    let maxValue = 0;
    
    for (const point of combinedData) {
      // Check primary currency values
      if (point.netWorth !== undefined && point.netWorth > maxValue) {
        maxValue = point.netWorth;
      }
      if (point.forecast !== undefined && point.forecast > maxValue) {
        maxValue = point.forecast;
      }
      
      // Check additional currency values
      for (const curr of additionalCurrencies) {
        const netWorthKey = `netWorth_${curr}` as keyof typeof point;
        const forecastKey = `forecast_${curr}` as keyof typeof point;
        const netWorthVal = point[netWorthKey];
        const forecastVal = point[forecastKey];
        
        if (typeof netWorthVal === 'number' && netWorthVal > maxValue) {
          maxValue = netWorthVal;
        }
        if (typeof forecastVal === 'number' && forecastVal > maxValue) {
          maxValue = forecastVal;
        }
      }
    }
    
    // Also check previousYearEnd reference line
    if (previousYearEnd !== null && previousYearEnd > maxValue) {
      maxValue = previousYearEnd;
    }
    
    // Add 15% padding to the top of the chart for better visualization
    const paddedMax = maxValue * 1.15;
    
    // Round up to a nice number for cleaner tick marks
    const magnitude = Math.pow(10, Math.floor(Math.log10(paddedMax)));
    const roundedMax = Math.ceil(paddedMax / magnitude) * magnitude;
    
    return [0, roundedMax];
  }, [combinedData, additionalCurrencies, previousYearEnd]);

  if (variations.length === 0) {
    return (
      <div className="chart-container">
        <div className="empty-state">
          <div className="empty-state-icon"><MaterialIcon name="trending_up" size="large" /></div>
          <h4>{t('charts.noHistoricalData')}</h4>
          <p>{t('charts.startTrackingNetWorth')}</p>
        </div>
      </div>
    );
  }

  const symbol = getCurrencySymbol(currency);

  // Custom tick formatter to split "Jan 2024" into two lines
  const renderCustomAxisTick = ({ x, y, payload }: { x: string | number; y: string | number; payload: { value: string } }) => {
    const parts = payload.value.split(' ');
    const month = parts[0] || '';
    const year = parts[1] || '';
    
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fill="#94A3B8" fontSize={11}>
          {month}
        </text>
        <text x={0} y={0} dy={26} textAnchor="middle" fill="#94A3B8" fontSize={10}>
          {year}
        </text>
      </g>
    );
  };

  // Custom tick formatter for "All" view mode - show only years at year changes
  const renderYearTick = ({ x, y, payload, index }: { x: string | number; y: string | number; payload: { value: string }; index: number }) => {
    // Only render if this is a year change point
    if (!yearChangeIndices.has(index)) {
      return null;
    }
    
    const parts = payload.value.split(' ');
    const year = parts[1] || '';
    
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fill="#94A3B8" fontSize={11}>
          {year}
        </text>
      </g>
    );
  };

  // Determine which tick formatter to use based on view mode
  const tickFormatter = viewMode === 'all' ? renderYearTick : renderCustomAxisTick;

  return (
    <div className="chart-container">
      <div className="chart-controls">
        <div className="chart-view-mode">
          <label htmlFor="chart-view-mode">{t('charts.viewLabel')}</label>
          <select
            id="chart-view-mode"
            value={viewMode}
            onChange={(e) => onViewModeChange(e.target.value as ChartViewMode)}
            className="view-mode-select"
          >
            <option value="ytd">{t('charts.yearToDate')}</option>
            <option value="all">{t('charts.allHistoricalData')}</option>
          </select>
        </div>
        <label className="chart-toggle">
          <input
            type="checkbox"
            checked={showForecast}
            onChange={(e) => setShowForecast(e.target.checked)}
          />
          <span className="toggle-switch"></span>
          {t('charts.showForecast')}
        </label>
      </div>

      {/* Additional Currencies Selector */}
      <div className="chart-currency-selector">
        <span className="currency-selector-label">{t('charts.compareIn')}</span>
        <div className="currency-buttons">
          {availableCurrencies.map(curr => (
            <button
              key={curr.code}
              className={`currency-btn ${additionalCurrencies.includes(curr.code) ? 'active' : ''}`}
              onClick={() => toggleCurrency(curr.code)}
              style={{
                borderColor: additionalCurrencies.includes(curr.code) 
                  ? ADDITIONAL_CURRENCY_COLORS[curr.code] 
                  : undefined,
                backgroundColor: additionalCurrencies.includes(curr.code) 
                  ? ADDITIONAL_CURRENCY_COLORS[curr.code] 
                  : undefined,
              }}
              aria-pressed={additionalCurrencies.includes(curr.code)}
            >
              {curr.symbol} {curr.code}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={combinedData} margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" />
          <XAxis
            dataKey="month"
            tick={tickFormatter}
            tickLine={{ stroke: '#3A3D46' }}
            height={50}
            interval={0}
            stroke="#3A3D46"
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#94A3B8' }}
            tickLine={{ stroke: '#3A3D46' }}
            tickFormatter={(value) => `${symbol}${formatChartCurrency(value, isPrivacyMode)}`}
            width={80}
            domain={yAxisDomain}
            stroke="#3A3D46"
          />
          <Tooltip
            formatter={(value, name) => {
              if (value === undefined || value === null) return ['-', name];
              
              // If privacy mode is on, blur the values
              if (isPrivacyMode) {
                const nameStr = String(name);
                let displayName = 'Net Worth';
                
                if (nameStr === 'netWorth') {
                  displayName = t('charts.netWorthCurrency', { currency });
                } else if (nameStr === 'forecast') {
                  displayName = t('charts.forecastCurrency', { currency });
                } else if (nameStr.startsWith('netWorth_')) {
                  const curr = nameStr.replace('netWorth_', '');
                  displayName = t('charts.netWorthCurrency', { currency: curr });
                } else if (nameStr.startsWith('forecast_')) {
                  const curr = nameStr.replace('forecast_', '');
                  displayName = t('charts.forecastCurrency', { currency: curr });
                }
                
                return [PRIVACY_PLACEHOLDER, displayName];
              }
              
              // Determine which currency this value belongs to
              const nameStr = String(name);
              let currencySymbol = symbol;
              let displayName = t('charts.netWorth');
              
              if (nameStr === 'netWorth') {
                displayName = t('charts.netWorthCurrency', { currency });
              } else if (nameStr === 'forecast') {
                displayName = t('charts.forecastCurrency', { currency });
              } else if (nameStr.startsWith('netWorth_')) {
                const curr = nameStr.replace('netWorth_', '') as SupportedCurrency;
                currencySymbol = getCurrencySymbol(curr);
                displayName = t('charts.netWorthCurrency', { currency: curr });
              } else if (nameStr.startsWith('forecast_')) {
                const curr = nameStr.replace('forecast_', '') as SupportedCurrency;
                currencySymbol = getCurrencySymbol(curr);
                displayName = t('charts.forecastCurrency', { currency: curr });
              }
              
              return [
                `${currencySymbol}${Number(value).toLocaleString()}`,
                displayName,
              ];
            }}
            labelStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
            contentStyle={{
              background: '#1A1D26',
              border: '1px solid #2DD4BF',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              color: '#F8FAFC',
            }}
            itemStyle={{ color: '#F8FAFC' }}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value) => {
              const valueStr = String(value);
              if (valueStr === 'netWorth') return <span style={{ color: '#F8FAFC', fontSize: '12px' }}>{t('charts.netWorthCurrency', { currency })}</span>;
              if (valueStr === 'forecast') return <span style={{ color: '#F8FAFC', fontSize: '12px' }}>{t('charts.forecastCurrency', { currency })}</span>;
              if (valueStr.startsWith('netWorth_')) {
                const curr = valueStr.replace('netWorth_', '');
                return <span style={{ color: '#F8FAFC', fontSize: '12px' }}>{t('charts.netWorthCurrency', { currency: curr })}</span>;
              }
              if (valueStr.startsWith('forecast_')) {
                const curr = valueStr.replace('forecast_', '');
                return <span style={{ color: '#F8FAFC', fontSize: '12px' }}>{t('charts.forecastCurrency', { currency: curr })}</span>;
              }
              return <span style={{ color: '#F8FAFC', fontSize: '12px' }}>{value}</span>;
            }}
          />
          
          {/* Previous year end reference line */}
          {previousYearEnd !== null && (
            <ReferenceLine
              y={previousYearEnd}
              stroke="#A855F7"
              strokeDasharray="5 5"
              label={{
                value: isPrivacyMode ? t('charts.prevYear', { value: PRIVACY_PLACEHOLDER }) : t('charts.prevYear', { value: `${symbol}${formatChartCurrency(previousYearEnd)}` }),
                position: 'right',
                fill: '#A855F7',
                fontSize: 11,
              }}
            />
          )}

          {/* Actual net worth line (primary currency) */}
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="#2DD4BF"
            strokeWidth={3}
            dot={{ fill: '#2DD4BF', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: '#2DD4BF' }}
            name="netWorth"
            connectNulls={false}
          />

          {/* Forecast line (primary currency) */}
          {showForecast && forecastData.length > 0 && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#4B5563"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#4B5563', strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: '#4B5563' }}
              name="forecast"
              connectNulls={true}
            />
          )}

          {/* Additional currency lines */}
          {additionalCurrencies.map(curr => (
            <Line
              key={`netWorth_${curr}`}
              type="monotone"
              dataKey={`netWorth_${curr}`}
              stroke={ADDITIONAL_CURRENCY_COLORS[curr]}
              strokeWidth={2}
              dot={{ fill: ADDITIONAL_CURRENCY_COLORS[curr], strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: ADDITIONAL_CURRENCY_COLORS[curr] }}
              name={`netWorth_${curr}`}
              connectNulls={false}
            />
          ))}

          {/* Additional currency forecast lines */}
          {showForecast && additionalCurrencies.map(curr => (
            <Line
              key={`forecast_${curr}`}
              type="monotone"
              dataKey={`forecast_${curr}`}
              stroke={ADDITIONAL_CURRENCY_COLORS[curr]}
              strokeWidth={1}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              dot={false}
              name={`forecast_${curr}`}
              connectNulls={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Forecast confidence indicator */}
      {showForecast && forecast.length > 0 && (
        <div className={`forecast-confidence-box ${forecast[0]?.confidenceLevel?.toLowerCase() || 'low'}`}>
          <span className="forecast-confidence-icon">ℹ️</span>
          <span className="forecast-confidence-text">
            <strong>Forecast confidence: {forecast[0]?.confidenceLevel}</strong>
            {' '}(based on {forecast[0]?.basedOnMonths} months of data
            {forecast[0]?.basedOnMonths && forecast[0].basedOnMonths < minMonthsForMediumConfidence && 
              `, ${minMonthsForMediumConfidence - forecast[0].basedOnMonths} more needed for medium confidence`}
            {forecast[0]?.basedOnMonths && forecast[0].basedOnMonths >= minMonthsForMediumConfidence && forecast[0].basedOnMonths < minMonthsForHighConfidence && 
              `, ${minMonthsForHighConfidence - forecast[0].basedOnMonths} more needed for high confidence`})
          </span>
        </div>
      )}
    </div>
  );
}
