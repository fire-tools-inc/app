/**
 * BreakdownChart
 *
 * Donut chart + accessible table for a single breakdown dimension.
 * Reuses the look-and-feel of `AllocationChart` while accepting the richer
 * `BreakdownResult` shape from the Portfolio Breakdown page.
 */

import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { BreakdownResult } from '../types/portfolioBreakdown';
import { formatCurrency, formatPercent } from '../utils/allocationCalculator';
import { PrivacyBlur } from './PrivacyBlur';

interface BreakdownChartProps {
  title: string;
  description?: string;
  result: BreakdownResult;
  currency: string;
  isPrivacyMode: boolean;
  /** Maximum number of slices to show in chart/table; remainder bucketed as "Other". */
  maxEntries?: number;
}

interface TooltipPayloadEntry {
  payload: {
    label: string;
    value: number;
    percentage: number;
  };
}

const DEFAULT_MAX_ENTRIES = 12;

function truncate(label: string, max = 18): string {
  return label.length > max ? label.substring(0, max - 1) + '…' : label;
}

function condense(
  entries: BreakdownResult['entries'],
  maxEntries: number,
): BreakdownResult['entries'] {
  if (entries.length <= maxEntries) return entries;
  const head = entries.slice(0, maxEntries - 1);
  const tail = entries.slice(maxEntries - 1);
  const otherValue = tail.reduce((s, e) => s + e.value, 0);
  const otherPercent = tail.reduce((s, e) => s + e.percentage, 0);
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      value: otherValue,
      percentage: otherPercent,
      color: '#9ca3af',
    },
  ];
}

export const BreakdownChart: React.FC<BreakdownChartProps> = ({
  title,
  description,
  result,
  currency,
  isPrivacyMode,
  maxEntries = DEFAULT_MAX_ENTRIES,
}) => {
  const { t } = useTranslation();
  if (!result.entries || result.entries.length === 0) {
    return (
      <div className="chart-container breakdown-chart">
        <h3>{title}</h3>
        {description && <p className="breakdown-chart-description">{description}</p>}
        <div className="empty-chart">{t('charts.noDataToDisplay')}</div>
      </div>
    );
  }

  const entries = condense(result.entries, maxEntries);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="label">
            <strong>{data.label}</strong>
          </p>
          <p className="value">
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              {formatCurrency(data.value, currency)}
            </PrivacyBlur>
          </p>
          <p className="percentage">{formatPercent(data.percentage)}</p>
        </div>
      );
    }
    return null;
  };

  const renderLegend = (value: string) => truncate(value, 22);

  return (
    <div className="chart-container breakdown-chart">
      <h3>{title}</h3>
      {description && <p className="breakdown-chart-description">{description}</p>}

      <ResponsiveContainer width="100%" height={340}>
        <PieChart>
          <Pie
            data={entries}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={110}
            innerRadius={55}
            paddingAngle={1}
          >
            {entries.map((entry, i) => (
              <Cell key={`cell-${i}`} fill={entry.color || '#5568d4'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={renderLegend}
            wrapperStyle={{ paddingTop: '8px', color: '#F8FAFC', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>

      <table className="breakdown-table" aria-label={`${title} breakdown table`}>
        <thead>
          <tr>
            <th scope="col">{t('tables.bucket')}</th>
            <th scope="col" className="numeric">
              {t('tables.value')}
            </th>
            <th scope="col" className="numeric">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.label}>
              <td>
                <span
                  className="breakdown-color-dot"
                  aria-hidden="true"
                  style={{ background: e.color || '#5568d4' }}
                />
                {e.label}
              </td>
              <td className="numeric">
                <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                  {formatCurrency(e.value, currency)}
                </PrivacyBlur>
              </td>
              <td className="numeric">{formatPercent(e.percentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
