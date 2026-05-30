import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { ChartData } from '../types/assetAllocation';
import { formatCurrency, formatPercent } from '../utils/allocationCalculator';

interface AllocationChartProps {
  data: ChartData[];
  title: string;
  currency: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartData;
  }>;
}

export const AllocationChart: React.FC<AllocationChartProps> = ({ data, title, currency }) => {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <div className="chart-container">
        <h3>{title}</h3>
        <div className="empty-chart">{t('charts.noDataToDisplay')}</div>
      </div>
    );
  }

  // Custom label renderer that handles line wrapping for long names
  // Uses ticker if name is too long
  const renderCustomLabel = (props: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    name?: string;
    percentage?: number;
    ticker?: string;
  }) => {
    const { cx, cy, midAngle, outerRadius, name, percentage, ticker } = props;
    if (!name || percentage === undefined || !cx || !cy || !midAngle || !outerRadius) return null;
    
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    // Use ticker if name is too long (> 10 chars), otherwise use truncated name
    let displayName: string;
    if (name.length > 10 && ticker) {
      displayName = ticker;
    } else if (name.length > 15) {
      displayName = name.substring(0, 12) + '...';
    } else {
      displayName = name;
    }
    const labelText = `${displayName}: ${formatPercent(percentage)}`;
    
    return (
      <text
        x={x}
        y={y}
        fill="#F8FAFC"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '12px', fontWeight: 500 }}
      >
        {labelText}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="label"><strong>{data.name}</strong></p>
          <p className="value">{formatCurrency(data.value, currency)}</p>
          <p className="percentage">{formatPercent(data.percentage)}</p>
        </div>
      );
    }
    return null;
  };

  // Custom legend formatter that wraps long names - uses ticker if available
  const renderLegend = (value: string) => {
    // Try to find the data entry to get ticker
    const entry = data.find(d => d.name === value);
    const ticker = entry?.ticker as string | undefined;
    if (value.length > 15 && ticker) {
      return ticker;
    }
    if (value.length > 20) {
      return value.substring(0, 17) + '...';
    }
    return value;
  };

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={120}
            innerRadius={60}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || '#5568d4'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={renderLegend} wrapperStyle={{ paddingTop: '12px', color: '#F8FAFC' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
