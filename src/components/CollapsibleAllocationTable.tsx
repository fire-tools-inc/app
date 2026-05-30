import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset, AllocationDelta, AssetClass, AllocationMode } from '../types/assetAllocation';
import { formatCurrency, formatPercent, formatAssetName } from '../utils/allocationCalculator';
import { NumberInput } from './NumberInput';
import { MaterialIcon } from './MaterialIcon';
import { PrivacyBlur } from './PrivacyBlur';

interface CollapsibleAllocationTableProps {
  assets: Asset[];
  deltas: AllocationDelta[];
  currency: string;
  cashDeltaAmount?: number; // Cash delta (positive = SAVE/subtract from other classes, negative = INVEST/add to other classes)
  assetClassTargets?: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
  portfolioValue?: number;
  onUpdateAsset: (assetId: string, updates: Partial<Asset>) => void;
  onBatchUpdateAssets?: (updates: Record<string, Partial<Asset>>) => void; // Batch update for redistribution
  onDeleteAsset: (assetId: string) => void;
  onMassEdit?: (assetClass: AssetClass) => void; // Handler for opening mass edit dialog
  isPrivacyMode?: boolean; // Privacy mode toggle
}

// Sub-types that require ISIN code (clicking ticker should copy ISIN)
const ISIN_TYPES = ['ETF', 'SINGLE_STOCK', 'SINGLE_BOND', 'REIT', 'MONEY_ETF'];

interface AssetWithDelta {
  asset: Asset;
  delta: AllocationDelta;
}

export const CollapsibleAllocationTable: React.FC<CollapsibleAllocationTableProps> = ({
  assets,
  deltas,
  currency,
  cashDeltaAmount = 0,
  assetClassTargets,
  portfolioValue,
  onUpdateAsset,
  onBatchUpdateAssets,
  onDeleteAsset,
  onMassEdit,
  isPrivacyMode = false,
}) => {
  // Initialize with all classes collapsed
  const allClasses = new Set(assets.map(a => a.assetClass));
  const [copiedIsin, setCopiedIsin] = useState<string | null>(null);
  const [collapsedClasses, setCollapsedClasses] = useState<Set<AssetClass>>(allClasses);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const { t } = useTranslation();
  const [editValues, setEditValues] = useState<{ 
    name: string; 
    currentValue: number; 
    shares?: number;
    pricePerShare?: number;
    targetPercent: number;
  }>({
    name: '',
    currentValue: 0,
    shares: undefined,
    pricePerShare: undefined,
    targetPercent: 0,
  });
  const tableRef = useRef<HTMLDivElement>(null);
  const editValuesRef = useRef(editValues);
  
  // Sorting state per asset class
  const [sortStates, setSortStates] = useState<Record<string, { key: string | null; direction: 'asc' | 'desc' | null }>>({});
  
  // Keep ref updated with latest edit values
  useEffect(() => {
    editValuesRef.current = editValues;
  }, [editValues]);

  // Redistribute percentages helper function
  // Uses TARGET PERCENTAGES for proportional distribution (not current values)
  // When rounding adjustments are needed, the asset with the least current value gets the extra
  // Returns a Record of assetId -> { targetPercent } updates for batch processing
  const calculateRedistributedPercentages = (assetId: string, newTargetPercent: number, assetClass: AssetClass): Record<string, Partial<Asset>> => {
    // Get all percentage-based assets in the same class
    const classAssets = assets.filter(a => 
      a.assetClass === assetClass && 
      a.targetMode === 'PERCENTAGE' &&
      a.id !== assetId
    );
    
    const updates: Record<string, Partial<Asset>> = {};
    
    if (classAssets.length === 0) return updates;
    
    // Calculate remaining percentage to distribute
    const remainingPercent = 100 - newTargetPercent;
    
    // Get total of other assets' TARGET PERCENTAGES for proportional distribution
    const otherAssetsTargetTotal = classAssets.reduce((sum, a) => sum + (a.targetPercent || 0), 0);
    
    // Calculate new percentages for all other assets
    const newPercentages: { id: string; percent: number; currentValue: number }[] = [];
    
    if (otherAssetsTargetTotal === 0) {
      // Distribute equally if all others have 0 target percent
      const equalPercent = remainingPercent / classAssets.length;
      classAssets.forEach(asset => {
        newPercentages.push({ id: asset.id, percent: equalPercent, currentValue: asset.currentValue });
      });
    } else {
      // Distribute proportionally based on TARGET PERCENTAGES
      classAssets.forEach(asset => {
        const proportion = (asset.targetPercent || 0) / otherAssetsTargetTotal;
        const newPercent = proportion * remainingPercent;
        newPercentages.push({ id: asset.id, percent: newPercent, currentValue: asset.currentValue });
      });
    }
    
    // Calculate total and adjust for rounding to ensure exactly 100%
    // Total should be: newTargetPercent + sum of newPercentages
    const calculatedTotal = newTargetPercent + newPercentages.reduce((sum, p) => sum + p.percent, 0);
    
    if (Math.abs(calculatedTotal - 100) > 0.001 && newPercentages.length > 0) {
      // Sort by current value ascending - asset with least value gets adjustment
      newPercentages.sort((a, b) => a.currentValue - b.currentValue);
      // Adjust the asset with the smallest current value to make total exactly 100%
      const adjustment = 100 - calculatedTotal;
      newPercentages[0].percent += adjustment;
    }
    
    // Ensure no individual percentage goes below 0% (edge case protection)
    newPercentages.forEach(p => {
      if (p.percent < 0) p.percent = 0;
      updates[p.id] = { targetPercent: p.percent };
    });
    
    return updates;
  };

  // Click outside to save (same behavior as Asset Classes table)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingAsset && tableRef.current && !tableRef.current.contains(event.target as Node)) {
        // Use ref to get latest edit values without causing re-renders
        const asset = assets.find(a => a.id === editingAsset);
        if (asset) {
          // Calculate all updates including redistribution
          const mainUpdate: Record<string, Partial<Asset>> = {
            [editingAsset]: {
              name: editValuesRef.current.name,
              currentValue: editValuesRef.current.currentValue,
              shares: editValuesRef.current.shares,
              pricePerShare: editValuesRef.current.pricePerShare,
              targetPercent: editValuesRef.current.targetPercent,
            }
          };
          
          let redistributionUpdates: Record<string, Partial<Asset>> = {};
          if (asset.targetMode === 'PERCENTAGE') {
            redistributionUpdates = calculateRedistributedPercentages(editingAsset, editValuesRef.current.targetPercent, asset.assetClass);
          }
          
          // Combine all updates and apply as batch if available
          const allUpdates = { ...mainUpdate, ...redistributionUpdates };
          if (onBatchUpdateAssets) {
            onBatchUpdateAssets(allUpdates);
          } else {
            // Fallback to individual updates
            Object.entries(allUpdates).forEach(([id, updates]) => {
              onUpdateAsset(id, updates);
            });
          }
        }
        setEditingAsset(null);
      }
    };

    if (editingAsset) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingAsset, assets, onUpdateAsset, onBatchUpdateAssets]);

  const toggleCollapse = (assetClass: AssetClass) => {
    const newCollapsed = new Set(collapsedClasses);
    if (newCollapsed.has(assetClass)) {
      newCollapsed.delete(assetClass);
    } else {
      newCollapsed.add(assetClass);
    }
    setCollapsedClasses(newCollapsed);
  };

  const groupedAssets = assets.reduce((acc, asset) => {
    if (!acc[asset.assetClass]) {
      acc[asset.assetClass] = [];
    }
    acc[asset.assetClass].push(asset);
    return acc;
  }, {} as Record<AssetClass, Asset[]>);

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

  const startEditing = (asset: Asset) => {
    setEditingAsset(asset.id);
    setEditValues({
      name: asset.name,
      currentValue: asset.currentValue,
      shares: asset.shares,
      pricePerShare: asset.pricePerShare,
      targetPercent: asset.targetPercent || 0,
    });
  };

  // Handle shares change and update currentValue
  const handleEditSharesChange = (value: number) => {
    const priceNum = editValues.pricePerShare || 0;
    const newCurrentValue = value > 0 && priceNum > 0 ? value * priceNum : editValues.currentValue;
    setEditValues({
      ...editValues,
      shares: value,
      currentValue: newCurrentValue,
    });
  };

  // Handle currentValue change and update pricePerShare if shares exists
  const handleEditCurrentValueChange = (value: number) => {
    const sharesNum = editValues.shares || 0;
    const newPrice = sharesNum > 0 && value > 0 ? value / sharesNum : editValues.pricePerShare;
    setEditValues({
      ...editValues,
      currentValue: value,
      pricePerShare: newPrice,
    });
  };

  const saveEditing = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    
    // Calculate all updates including redistribution
    const mainUpdate: Record<string, Partial<Asset>> = {
      [assetId]: {
        name: editValues.name,
        currentValue: editValues.currentValue,
        shares: editValues.shares,
        pricePerShare: editValues.pricePerShare,
        targetPercent: editValues.targetPercent,
      }
    };
    
    let redistributionUpdates: Record<string, Partial<Asset>> = {};
    if (asset.targetMode === 'PERCENTAGE') {
      redistributionUpdates = calculateRedistributedPercentages(assetId, editValues.targetPercent, asset.assetClass);
    }
    
    // Combine all updates and apply as batch if available
    const allUpdates = { ...mainUpdate, ...redistributionUpdates };
    if (onBatchUpdateAssets) {
      onBatchUpdateAssets(allUpdates);
    } else {
      // Fallback to individual updates
      Object.entries(allUpdates).forEach(([id, updates]) => {
        onUpdateAsset(id, updates);
      });
    }
    
    setEditingAsset(null);
  };

  const cancelEditing = () => {
    setEditingAsset(null);
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

  const handleTargetValueChange = (assetId: string, value: number) => {
    onUpdateAsset(assetId, { targetValue: value });
  };

  const copyIsinToClipboard = (asset: Asset) => {
    if (asset.isin) {
      navigator.clipboard.writeText(asset.isin).then(() => {
        setCopiedIsin(asset.id);
        setTimeout(() => setCopiedIsin(null), 2000);
      });
    }
  };

  // Sorting helper functions
  const getSortedAssets = (classAssets: Asset[], assetClass: string): AssetWithDelta[] => {
    const assetsWithDeltas: AssetWithDelta[] = classAssets.map(asset => ({
      asset,
      delta: deltas.find(d => d.assetId === asset.id)
    })).filter((item): item is AssetWithDelta => item.delta !== undefined);

    const sortState = sortStates[assetClass];
    if (!sortState || !sortState.key || !sortState.direction) {
      return assetsWithDeltas;
    }

    return [...assetsWithDeltas].sort((a, b) => {
      const getNestedValue = (obj: any, path: string): any => {
        return path.split('.').reduce((current: any, prop) => current?.[prop], obj);
      };

      const aValue = getNestedValue(a, sortState.key!);
      const bValue = getNestedValue(b, sortState.key!);

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (aValue < bValue) {
        return sortState.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortState.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const requestSort = (assetClass: string, key: string) => {
    setSortStates(prev => {
      const currentState = prev[assetClass];
      let direction: 'asc' | 'desc' | null = 'asc';

      if (currentState?.key === key) {
        if (currentState.direction === 'asc') {
          direction = 'desc';
        } else if (currentState.direction === 'desc') {
          direction = null;
        }
      }

      return {
        ...prev,
        [assetClass]: { key: direction ? key : null, direction }
      };
    });
  };

  const getSortIndicator = (assetClass: string, key: string): string => {
    const sortState = sortStates[assetClass];
    if (sortState?.key !== key) return '⇅';
    if (sortState.direction === 'asc') return '↑';
    if (sortState.direction === 'desc') return '↓';
    return '⇅';
  };

  return (
    <div className="collapsible-allocation-table" ref={tableRef}>
      {Object.entries(groupedAssets).map(([assetClass, classAssets]) => {
        const isCollapsed = collapsedClasses.has(assetClass as AssetClass);
        const classTotal = classAssets.reduce((sum, asset) => 
          sum + (asset.targetMode === 'OFF' ? 0 : asset.currentValue), 0
        );
        
        // Calculate class target value based on assetClassTargets and portfolioValue
        const classTarget = assetClassTargets?.[assetClass as AssetClass];
        let classTargetValue = 0;
        if (classTarget?.targetMode === 'PERCENTAGE' && classTarget.targetPercent !== undefined && portfolioValue) {
          classTargetValue = (classTarget.targetPercent / 100) * portfolioValue;
        } else if (classTarget?.targetMode === 'SET') {
          // For SET mode, sum up the target values of assets in this class
          classTargetValue = classAssets.reduce((sum, asset) => 
            sum + (asset.targetMode === 'SET' ? (asset.targetValue || 0) : 0), 0
          );
        }
        
        // Calculate cash adjustment distributed proportionally to non-cash classes
        // Cash delta: positive = SAVE (subtract from other classes), negative = INVEST (add to other classes)
        // The cash amount should be distributed based on each non-cash class's target percentage
        let cashAdjustment = 0;
        if (assetClass !== 'CASH' && cashDeltaAmount !== 0 && assetClassTargets) {
          // Get total percentage of all non-cash percentage-based classes with positive targets
          const nonCashPercentageTotal = Object.entries(assetClassTargets)
            .filter(([cls, target]) => 
              cls !== 'CASH' && 
              target.targetMode === 'PERCENTAGE' && 
              (target.targetPercent || 0) > 0
            )
            .reduce((sum, [, target]) => sum + (target.targetPercent || 0), 0);
          
          // Only distribute if there are non-cash classes with positive percentage targets
          // and this class has a positive target percentage
          if (nonCashPercentageTotal > 0 && 
              classTarget?.targetMode === 'PERCENTAGE' && 
              classTarget.targetPercent && 
              classTarget.targetPercent > 0) {
            // Distribute cash proportionally based on this class's share of total non-cash targets
            const proportion = classTarget.targetPercent / nonCashPercentageTotal;
            // Negative cash delta = INVEST = add to this class
            // Positive cash delta = SAVE = subtract from this class
            cashAdjustment = -cashDeltaAmount * proportion;
          }
        }
        const classDelta = classTargetValue - classTotal + cashAdjustment;

        return (
          <div key={assetClass} className="asset-class-group">
            <div 
              className="asset-class-header"
              onClick={() => toggleCollapse(assetClass as AssetClass)}
            >
              <div className="class-header-left">
                <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                <span className={`asset-class-badge ${assetClass.toLowerCase()}`}>
                  {formatAssetName(assetClass)}
                </span>
                <span className="asset-count">{t('tables.assetCount', { count: classAssets.length })}</span>
                {onMassEdit && (
                  <button
                    className="btn-mass-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMassEdit(assetClass as AssetClass);
                    }}
                    title={t('tables.editAllTitle')}
                  >
                    <MaterialIcon name="edit" size="small" /> {t('tables.editAll')}
                  </button>
                )}
              </div>
              <div className="class-header-right">
                <span className="class-total"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(classTotal, currency)}</PrivacyBlur></span>
                <span className={`class-delta ${classDelta > 0 ? 'positive' : classDelta < 0 ? 'negative' : ''}`}>
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>{classDelta > 0 ? '+' : classDelta < 0 ? '-' : ''}{formatCurrency(Math.abs(classDelta), currency)}</PrivacyBlur>
                </span>
              </div>
            </div>

            {!isCollapsed && (
              <table className="assets-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.name')}>
                      {t('tables.assetName')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.name')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.type')}>
                      {t('tables.type')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.type')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.ticker')}>
                      {t('tables.ticker')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.ticker')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.targetMode')}>
                      {t('tables.targetMode')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.targetMode')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.targetPercent')}>
                      {t('tables.percentTarget')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.targetPercent')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'delta.currentPercent')}>
                      {t('tables.percentCurrentTotal')} <span className="sort-indicator">{getSortIndicator(assetClass, 'delta.currentPercent')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'delta.currentPercentInClass')}>
                      {t('tables.percentCurrentClass')} <span className="sort-indicator">{getSortIndicator(assetClass, 'delta.currentPercentInClass')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.shares')}>
                      {t('tables.shares')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.shares')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'asset.pricePerShare')}>
                      {t('tables.pricePerShare')} <span className="sort-indicator">{getSortIndicator(assetClass, 'asset.pricePerShare')}</span>
                    </th>
                    <th>{t('tables.acquisitionPrice')}</th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'delta.currentValue')}>
                      {t('tables.currentValue')} <span className="sort-indicator">{getSortIndicator(assetClass, 'delta.currentValue')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'delta.targetValue')}>
                      {t('tables.targetValue')} <span className="sort-indicator">{getSortIndicator(assetClass, 'delta.targetValue')}</span>
                    </th>
                    <th className="sortable" onClick={() => requestSort(assetClass, 'delta.delta')}>
                      {t('tables.delta')} <span className="sort-indicator">{getSortIndicator(assetClass, 'delta.delta')}</span>
                    </th>
                    <th>{t('tables.action')}</th>
                    <th>{t('tables.editColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedAssets(classAssets, assetClass).map(({ asset, delta }) => {

                    const isEditing = editingAsset === asset.id;
                    const isCashAsset = asset.assetClass === 'CASH';
                    const isValueOnlyAsset = ['PROPERTY', 'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE', 'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE', 'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'PHYSICAL_GOLD'].includes(asset.subAssetType);

                    return (
                      <tr 
                        key={asset.id} 
                        className={`${asset.targetMode === 'OFF' ? 'excluded-row' : ''} ${isEditing ? 'editing-row' : ''}`}
                        onClick={() => !isEditing && startEditing(asset)}
                      >
                        <td className="asset-name">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValues.name}
                              onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              className="edit-input edit-name-input"
                            />
                          ) : (
                            <span title={asset.institutionName ? t('tables.bankBrokerTitle', { name: asset.institutionName }) : undefined}>
                              {asset.name}
                              {asset.institutionName && (
                                <span className="institution-badge" title={t('tables.bankBrokerTitle', { name: asset.institutionName })}>
                                  🏦
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="sub-type-badge">
                            {formatAssetName(asset.subAssetType)}
                          </span>
                        </td>
                        <td className="ticker-cell">
                          {ISIN_TYPES.includes(asset.subAssetType) && asset.isin ? (
                            <span 
                              className={`ticker-with-isin ${copiedIsin === asset.id ? 'copied' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIsinToClipboard(asset);
                              }}
                              title={t('tables.copyIsinTooltip', { isin: asset.isin })}
                            >
                              {asset.ticker}
                              <span className="copy-icon">📋</span>
                              {copiedIsin === asset.id && <span className="copied-tooltip">{t('tables.copied')}</span>}
                            </span>
                          ) : (
                            asset.ticker
                          )}
                        </td>
                        <td>
                          <select
                            value={asset.targetMode}
                            onChange={(e) => handleTargetModeChange(asset.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="target-mode-select"
                          >
                            <option value="PERCENTAGE">%</option>
                            <option value="SET">SET</option>
                            <option value="OFF">OFF</option>
                          </select>
                        </td>
                        <td>
                          {isEditing && asset.targetMode === 'PERCENTAGE' ? (
                            <NumberInput
                              value={editValues.targetPercent}
                              onChange={(value) => setEditValues({ ...editValues, targetPercent: value })}
                              className="edit-input"
                            />
                          ) : asset.targetMode === 'PERCENTAGE' ? (
                            formatPercent(asset.targetPercent || 0)
                          ) : asset.targetMode === 'SET' ? (
                            <span className="set-label">SET</span>
                          ) : (
                            <span className="off-label">OFF</span>
                          )}
                        </td>
                        <td>{formatPercent(delta.currentPercent)}</td>
                        <td>{formatPercent(delta.currentPercentInClass)}</td>
                        <td>
                          {isCashAsset || isValueOnlyAsset ? (
                            '-'
                          ) : isEditing ? (
                            <NumberInput
                              value={editValues.shares || 0}
                              onChange={handleEditSharesChange}
                              className="edit-input"
                            />
                          ) : asset.shares ? (
                            <PrivacyBlur isPrivacyMode={isPrivacyMode}>{asset.shares.toFixed(2)}</PrivacyBlur>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="currency-value">
                          {isCashAsset || isValueOnlyAsset ? (
                            '-'
                          ) : asset.pricePerShare ? (
                            <div className="price-cell">
                              <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(asset.pricePerShare, currency)}</PrivacyBlur>
                              {asset.marketPrice && asset.marketPrice !== asset.pricePerShare && (
                                <div className={`market-price-delta ${asset.marketPrice > asset.pricePerShare ? 'gain' : 'loss'}`}>
                                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                                    <span className="market-price">{formatCurrency(asset.marketPrice, currency)}</span>
                                  </PrivacyBlur>
                                  <span className="delta-pct">
                                    {((asset.marketPrice - asset.pricePerShare) / asset.pricePerShare * 100) > 0 ? '+' : ''}
                                    {((asset.marketPrice - asset.pricePerShare) / asset.pricePerShare * 100).toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="currency-value">
                          {isCashAsset || isValueOnlyAsset || !asset.acquisitionPrice ? (
                            '-'
                          ) : (
                            <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(asset.acquisitionPrice, currency)}</PrivacyBlur>
                          )}
                        </td>
                        <td className="currency-value">
                          {isEditing ? (
                            isCashAsset || isValueOnlyAsset ? (
                              <NumberInput
                                value={editValues.currentValue}
                                onChange={handleEditCurrentValueChange}
                                className="edit-input"
                              />
                            ) : (
                              <div className="calculated-value-container">
                                <NumberInput
                                  value={editValues.currentValue}
                                  onChange={handleEditCurrentValueChange}
                                  className="edit-input"
                                  disabled={true}
                                  title={t('tables.calculatedValueTitle')}
                                />
                                <span className="calculated-label">{t('tables.calculatedLabel')}</span>
                              </div>
                            )
                          ) : (
                            <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(delta.currentValue, currency)}</PrivacyBlur>
                          )}
                        </td>
                        <td className="currency-value">
                          {asset.targetMode === 'SET' ? (
                            <NumberInput
                              value={asset.targetValue || 0}
                              onChange={(value) => handleTargetValueChange(asset.id, value)}
                              className="target-input"
                            />
                          ) : (
                            <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(delta.targetValue, currency)}</PrivacyBlur>
                          )}
                        </td>
                        <td className={`currency-value ${delta.delta > 0 ? 'positive' : delta.delta < 0 ? 'negative' : ''}`}>
                          <PrivacyBlur isPrivacyMode={isPrivacyMode}>{delta.delta > 0 ? '+' : delta.delta < 0 ? '-' : ''}{formatCurrency(Math.abs(delta.delta), currency)}</PrivacyBlur>
                        </td>
                        <td>
                          <span 
                            className="action-badge"
                            style={{ backgroundColor: getActionColor(delta.action) }}
                          >
                            {delta.action}
                          </span>
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="edit-actions">
                              <button onClick={() => saveEditing(asset.id)} className="btn-save" title={t('common.save')}><MaterialIcon name="check" size="small" /></button>
                              <button onClick={cancelEditing} className="btn-cancel-edit" title={t('common.cancel')}><MaterialIcon name="close" size="small" /></button>
                              <button onClick={() => {
                                if (confirm(t('tables.deleteAssetConfirm', { name: asset.name }))) {
                                  onDeleteAsset(asset.id);
                                  setEditingAsset(null);
                                }
                              }} className="btn-delete" title={t('common.delete')}><MaterialIcon name="delete" size="small" /></button>
                            </div>
                          ) : (
                            <button onClick={() => startEditing(asset)} className="btn-edit" title={t('common.edit')}><MaterialIcon name="edit" size="small" /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
};
