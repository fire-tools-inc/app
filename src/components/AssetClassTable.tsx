import { useTranslation } from 'react-i18next';
import { AssetClassSummary } from '../types/assetAllocation';
import { formatCurrency, formatPercent } from '../utils/allocationCalculator';
import { useTableSort } from '../utils/useTableSort';

interface AssetClassTableProps {
  assetClasses: AssetClassSummary[];
  totalValue: number;
  currency: string;
}

export const AssetClassTable: React.FC<AssetClassTableProps> = ({
  assetClasses,
  totalValue,
  currency,
}) => {
  const { t } = useTranslation();
  const { sortedData, requestSort, getSortIndicator } = useTableSort(assetClasses);

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'BUY':
      case 'SAVE':
        return 'var(--color-action-buy)';
      case 'SELL':
      case 'INVEST':
        return 'var(--color-action-sell)';
      case 'HOLD':
        return 'var(--color-action-hold)';
      case 'EXCLUDED':
        return 'var(--color-action-excluded)';
      default:
        return '#666';
    }
  };

  return (
    <div className="asset-class-table-container">
      <table className="asset-class-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => requestSort('assetClass')}>
              {t('tables.assetClass')} <span className="sort-indicator">{getSortIndicator('assetClass')}</span>
            </th>
            <th>{t('tables.targetMode')}</th>
            <th className="sortable" onClick={() => requestSort('targetPercent')}>
              {t('tables.percentTarget')} <span className="sort-indicator">{getSortIndicator('targetPercent')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('currentPercent')}>
              {t('tables.percentCurrent')} <span className="sort-indicator">{getSortIndicator('currentPercent')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('currentTotal')}>
              {t('tables.absoluteCurrent')} <span className="sort-indicator">{getSortIndicator('currentTotal')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('targetTotal')}>
              {t('tables.absoluteTarget')} <span className="sort-indicator">{getSortIndicator('targetTotal')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta')}>
              {t('tables.delta')} <span className="sort-indicator">{getSortIndicator('delta')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('action')}>
              {t('tables.action')} <span className="sort-indicator">{getSortIndicator('action')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map(ac => (
            <tr key={ac.assetClass} className={ac.targetMode === 'OFF' ? 'excluded-row' : ''}>
              <td>
                <span className={`asset-class-badge ${ac.assetClass.toLowerCase()}`}>
                  {ac.assetClass}
                </span>
              </td>
              <td>
                {ac.targetMode === 'SET' ? (
                  <span className="set-label">SET</span>
                ) : ac.targetMode === 'OFF' ? (
                  <span className="off-label">OFF</span>
                ) : (
                  <span>%</span>
                )}
              </td>
              <td>
                {ac.targetMode === 'PERCENTAGE' && ac.targetPercent !== undefined
                  ? formatPercent(ac.targetPercent)
                  : ac.targetMode === 'SET'
                  ? 'SET'
                  : 'OFF'}
              </td>
              <td>{formatPercent(ac.currentPercent)}</td>
              <td className="currency-value">{formatCurrency(ac.currentTotal, currency)}</td>
              <td className="currency-value">
                {ac.targetTotal !== undefined ? formatCurrency(ac.targetTotal, currency) : '-'}
              </td>
              <td className={`currency-value ${ac.delta > 0 ? 'positive' : ac.delta < 0 ? 'negative' : ''}`}>
                {ac.delta > 0 ? '+' : ''}{formatCurrency(ac.delta, currency)}
              </td>
              <td>
                <span 
                  className="action-badge"
                  style={{ backgroundColor: getActionColor(ac.action) }}
                >
                  {ac.action}
                </span>
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td><strong>{t('tables.totalPortfolio')}</strong></td>
            <td colSpan={2}></td>
            <td><strong>100%</strong></td>
            <td className="currency-value"><strong>{formatCurrency(totalValue, currency)}</strong></td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
