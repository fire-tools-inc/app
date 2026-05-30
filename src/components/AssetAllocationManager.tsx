import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, PortfolioAllocation } from '../types/assetAllocation';
import { calculatePortfolioAllocation, prepareAssetClassChartData, prepareAssetChartData, exportToCSV, importFromCSV } from '../utils/allocationCalculator';
import { DEFAULT_ASSETS } from '../utils/defaultAssets';
import { AllocationTable } from './AllocationTable';
import { AssetClassTable } from './AssetClassTable';
import { AllocationChart } from './AllocationChart';
import { MaterialIcon } from './MaterialIcon';

export const AssetAllocationManager: React.FC = () => {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>(DEFAULT_ASSETS);
  const [currency] = useState<string>('EUR');
  const [allocation, setAllocation] = useState<PortfolioAllocation>(() =>
    calculatePortfolioAllocation(DEFAULT_ASSETS)
  );
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const updateAllocation = (newAssets: Asset[]) => {
    setAssets(newAssets);
    const newAllocation = calculatePortfolioAllocation(newAssets);
    setAllocation(newAllocation);
  };

  const handleUpdateAsset = (assetId: string, updates: Partial<Asset>) => {
    const newAssets = assets.map(asset =>
      asset.id === assetId ? { ...asset, ...updates } : asset
    );
    updateAllocation(newAssets);
  };

  const handleAddAsset = () => {
    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      name: t('assetAllocation.defaultNewAssetName'),
      ticker: 'NEW',
      assetClass: 'STOCKS',
      subAssetType: 'ETF',
      currentValue: 0,
      targetMode: 'PERCENTAGE',
      targetPercent: 0,
    };
    updateAllocation([...assets, newAsset]);
  };

  const handleExport = () => {
    const csv = exportToCSV(allocation);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-allocation-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const importedAssets = importFromCSV(csv);
        updateAllocation(importedAssets);
      } catch (error) {
        alert(t('assetAllocation.messages.importCsvError', { message: error instanceof Error ? error.message : t('common.unknownError') }));
      }
    };
    reader.readAsText(file);
  };

  const assetClassChartData = prepareAssetClassChartData(allocation.assetClasses);
  const selectedAssetClass = selectedClass
    ? allocation.assetClasses.find(ac => ac.assetClass === selectedClass)
    : null;
  const assetChartData = selectedAssetClass
    ? prepareAssetChartData(selectedAssetClass.assets, selectedAssetClass.currentTotal)
    : [];

  return (
    <div className="asset-allocation-manager">
      <div className="manager-header">
        <h2><MaterialIcon name="pie_chart" /> {t('assetAllocation.title')}</h2>
        <p className="section-description">
          {t('assetAllocation.description')}
        </p>
      </div>

      {!allocation.isValid && (
        <div className="validation-errors">
          <strong><MaterialIcon name="warning" /> {t('assetAllocation.validationErrors')}</strong>
          <ul>
            {allocation.validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="manager-actions">
        <button onClick={handleAddAsset} className="action-btn add-btn">
          <MaterialIcon name="add" /> {t('assetAllocation.addAsset')}
        </button>
        <button onClick={handleExport} className="action-btn export-btn">
          <MaterialIcon name="download" /> {t('assetAllocation.exportCsv')}
        </button>
        <label className="action-btn import-btn">
          <MaterialIcon name="upload" /> {t('assetAllocation.importCsv')}
          <input
            type="file"
            accept=".csv"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      <div className="allocation-section">
        <h3>{t('assetAllocation.assetClassSummary')}</h3>
        <AssetClassTable
          assetClasses={allocation.assetClasses}
          totalValue={allocation.totalValue}
          currency={currency}
        />
      </div>

      <div className="charts-row">
        <AllocationChart
          data={assetClassChartData}
          title={t('assetAllocation.charts.byAssetClass')}
          currency={currency}
        />

        {selectedAssetClass && (
          <AllocationChart
            data={assetChartData}
            title={t('assetAllocation.charts.breakdown', { assetClass: selectedAssetClass.assetClass })}
            currency={currency}
          />
        )}
      </div>

      <div className="class-selector">
        <label>{t('assetAllocation.viewAssetClassDetails')}</label>
        <select
          value={selectedClass || ''}
          onChange={(e) => setSelectedClass(e.target.value || null)}
          className="class-select"
        >
          <option value="">{t('assetAllocation.selectAssetClass')}</option>
          {allocation.assetClasses.map(ac => (
            <option key={ac.assetClass} value={ac.assetClass}>
              {ac.assetClass}
            </option>
          ))}
        </select>
      </div>

      <div className="allocation-section">
        <h3>{t('assetAllocation.detailedAssetAllocation')}</h3>
        <AllocationTable
          assets={assets}
          deltas={allocation.deltas}
          currency={currency}
          onUpdateAsset={handleUpdateAsset}
        />
      </div>

      <div className="allocation-info">
        <h4><MaterialIcon name="lightbulb" /> {t('assetAllocation.howToUse.title')}</h4>
        <ul>
          <li><strong>{t('assetAllocation.howToUse.targetModeLabel')}</strong> {t('assetAllocation.howToUse.targetModeText')}</li>
          <li><strong>{t('assetAllocation.howToUse.percentageTargetsLabel')}</strong> {t('assetAllocation.howToUse.percentageTargetsText')}</li>
          <li><strong>{t('assetAllocation.howToUse.actionsLabel')}</strong>
            <span className="info-badge buy">BUY/SAVE</span> = {t('assetAllocation.howToUse.increasePosition')} |
            <span className="info-badge sell">SELL/INVEST</span> = {t('assetAllocation.howToUse.decreasePosition')} |
            <span className="info-badge hold">HOLD</span> = {t('assetAllocation.howToUse.withinTargetRange')} |
            <span className="info-badge excluded">EXCLUDED</span> = {t('assetAllocation.howToUse.notInAllocation')}
          </li>
          <li><strong>{t('assetAllocation.howToUse.deltaLabel')}</strong> {t('assetAllocation.howToUse.deltaText')}</li>
          <li><strong>{t('assetAllocation.howToUse.cashAssetsLabel')}</strong> {t('assetAllocation.howToUse.cashAssetsText')}</li>
        </ul>
      </div>
    </div>
  );
};
