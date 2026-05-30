import { useTranslation } from 'react-i18next';
import { Asset, AllocationDelta, AllocationMode } from '../types/assetAllocation';
import { formatCurrency, formatPercent } from '../utils/allocationCalculator';
import { useTableSort } from '../utils/useTableSort';
import { NumberInput } from './NumberInput';

interface AllocationTableProps {
  assets: Asset[];
  deltas: AllocationDelta[];
  currency: string;
  onUpdateAsset: (assetId: string, updates: Partial<Asset>) => void;
}

interface TableRow {
  asset: Asset;
  delta: AllocationDelta;
}

export const AllocationTable: React.FC<AllocationTableProps> = ({
  assets,
  deltas,
  currency,
  onUpdateAsset,
}) => {
  const { t } = useTranslation();
  // Create combined data for sorting
  const tableData: TableRow[] = assets.map(asset => ({
    asset,
    delta: deltas.find(d => d.assetId === asset.id)!,
  })).filter(row => row.delta !== undefined);

  const { sortedData, requestSort, getSortIndicator } = useTableSort<TableRow>(tableData);

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

  const handleTargetModeChange = (assetId: string, mode: string) => {
    const targetMode = mode as AllocationMode;
    const updates: Partial<Asset> = { targetMode };
    
    if (targetMode === 'OFF') {
      updates.targetPercent = undefined;
      updates.targetValue = undefined;
    }
    
    onUpdateAsset(assetId, updates);
  };

  const handleTargetPercentChange = (assetId: string, value: number) => {
    onUpdateAsset(assetId, { targetPercent: value });
  };

  const handleTargetValueChange = (assetId: string, value: number) => {
    onUpdateAsset(assetId, { targetValue: value });
  };

  return (
    <div className="allocation-table-container">
      <table className="allocation-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => requestSort('asset.name')}>
              {t('tables.assetIndex')} <span className="sort-indicator">{getSortIndicator('asset.name')}</span>
            </th>
            <th>{t('tables.ticker')}</th>
            <th className="sortable" onClick={() => requestSort('asset.assetClass')}>
              {t('tables.assetClass')} <span className="sort-indicator">{getSortIndicator('asset.assetClass')}</span>
            </th>
            <th>{t('tables.targetMode')}</th>
            <th className="sortable" onClick={() => requestSort('asset.targetPercent')}>
              {t('tables.percentTarget')} <span className="sort-indicator">{getSortIndicator('asset.targetPercent')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.currentPercent')}>
              {t('tables.percentCurrentTotal')} <span className="sort-indicator">{getSortIndicator('delta.currentPercent')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.currentPercentInClass')}>
              {t('tables.percentCurrentClass')} <span className="sort-indicator">{getSortIndicator('delta.currentPercentInClass')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.currentValue')}>
              {t('tables.absoluteCurrent')} <span className="sort-indicator">{getSortIndicator('delta.currentValue')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.targetValue')}>
              {t('tables.absoluteTarget')} <span className="sort-indicator">{getSortIndicator('delta.targetValue')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.delta')}>
              {t('tables.delta')} <span className="sort-indicator">{getSortIndicator('delta.delta')}</span>
            </th>
            <th className="sortable" onClick={() => requestSort('delta.action')}>
              {t('tables.action')} <span className="sort-indicator">{getSortIndicator('delta.action')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map(({ asset, delta }) => {
            return (
              <tr key={asset.id} className={asset.targetMode === 'OFF' ? 'excluded-row' : ''}>
                <td className="asset-name">{asset.name}</td>
                <td>{asset.ticker}</td>
                <td>
                  <span className={`asset-class-badge ${asset.assetClass.toLowerCase()}`}>
                    {asset.assetClass}
                  </span>
                </td>
                <td>
                  <select
                    value={asset.targetMode}
                    onChange={(e) => handleTargetModeChange(asset.id, e.target.value)}
                    className="target-mode-select"
                  >
                    <option value="PERCENTAGE">%</option>
                    <option value="SET">SET</option>
                    <option value="OFF">OFF</option>
                  </select>
                </td>
                <td>
                  {asset.targetMode === 'PERCENTAGE' ? (
                    <NumberInput
                      value={asset.targetPercent || 0}
                      onChange={(value) => handleTargetPercentChange(asset.id, value)}
                      className="target-input"
                    />
                  ) : asset.targetMode === 'SET' ? (
                    <span className="set-label">SET</span>
                  ) : (
                    <span className="off-label">OFF</span>
                  )}
                </td>
                <td>{formatPercent(delta.currentPercent)}</td>
                <td>{formatPercent(delta.currentPercentInClass)}</td>
                <td className="currency-value">{formatCurrency(delta.currentValue, currency)}</td>
                <td className="currency-value">
                  {asset.targetMode === 'SET' ? (
                    <NumberInput
                      value={asset.targetValue || 0}
                      onChange={(value) => handleTargetValueChange(asset.id, value)}
                      className="target-input"
                    />
                  ) : (
                    formatCurrency(delta.targetValue, currency)
                  )}
                </td>
                <td className={`currency-value ${delta.delta > 0 ? 'positive' : delta.delta < 0 ? 'negative' : ''}`}>
                  {delta.delta > 0 ? '+' : ''}{formatCurrency(delta.delta, currency)}
                </td>
                <td>
                  <span 
                    className="action-badge"
                    style={{ backgroundColor: getActionColor(delta.action) }}
                  >
                    {delta.action}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
