import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AssetClassSummary, AllocationMode, AssetClass } from '../types/assetAllocation';
import { formatCurrency, formatPercent, formatAssetName } from '../utils/allocationCalculator';
import { NumberInput } from './NumberInput';
import { PrivacyBlur } from './PrivacyBlur';

interface AssetClassTarget {
  targetMode: AllocationMode;
  targetPercent?: number;
}

interface EditableAssetClassTableProps {
  assetClasses: AssetClassSummary[];
  totalValue: number;
  totalHoldings: number; // Total including cash
  cashDeltaAmount: number; // Cash delta for distribution (negative = INVEST, positive = SAVE)
  currency: string;
  assetClassTargets: Record<AssetClass, AssetClassTarget>;
  onUpdateAssetClass: (assetClass: AssetClass, updates: { targetMode?: AllocationMode; targetPercent?: number }) => void;
  isPrivacyMode?: boolean; // Privacy mode for blurring monetary values
}

export const EditableAssetClassTable: React.FC<EditableAssetClassTableProps> = ({
  assetClasses,
  totalValue,
  totalHoldings,
  cashDeltaAmount,
  currency,
  assetClassTargets,
  onUpdateAssetClass,
  isPrivacyMode = false,
}) => {
  const [editingClass, setEditingClass] = useState<AssetClass | null>(null);
  const [editMode, setEditMode] = useState<AllocationMode>('PERCENTAGE');
  const [editPercent, setEditPercent] = useState<number>(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Click outside to save
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingClass && tableRef.current && !tableRef.current.contains(event.target as Node)) {
        saveEditing();
      }
    };

    if (editingClass) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingClass, editMode, editPercent]);

  const ACTION_THRESHOLD = 100;

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

  const getAction = (assetClass: AssetClass, delta: number, targetMode: AllocationMode): string => {
    if (targetMode === 'OFF') {
      return 'EXCLUDED';
    }
    
    if (Math.abs(delta) < ACTION_THRESHOLD) {
      return 'HOLD';
    }
    
    if (assetClass === 'CASH') {
      return delta > 0 ? 'SAVE' : 'INVEST';
    }
    
    return delta > 0 ? 'BUY' : 'SELL';
  };

  const startEditing = (ac: AssetClassSummary) => {
    // Use assetClassTargets for editing values, not computed values from assets
    const classTarget = assetClassTargets[ac.assetClass];
    setEditingClass(ac.assetClass);
    setEditMode(classTarget?.targetMode || ac.targetMode);
    setEditPercent(classTarget?.targetPercent ?? ac.targetPercent ?? 0);
  };

  const saveEditing = () => {
    if (editingClass) {
      onUpdateAssetClass(editingClass, {
        targetMode: editMode,
        targetPercent: editMode === 'PERCENTAGE' ? editPercent : undefined,
      });
    }
    setEditingClass(null);
  };

  const cancelEditing = () => {
    setEditingClass(null);
  };

  return (
    <div className="asset-class-table-container" ref={tableRef}>
      <table className="asset-class-table">
        <thead>
          <tr>
            <th>{t('tables.assetClass')}</th>
            <th>{t('tables.targetMode')}</th>
            <th>{t('tables.percentTargetClass')}</th>
            <th>{t('tables.percentCurrent')}</th>
            <th>{t('tables.absoluteCurrent')}</th>
            <th>{t('tables.absoluteTarget')}</th>
            <th>{t('tables.delta')}</th>
            <th>{t('tables.action')}</th>
            <th>{t('tables.editColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {/* Pre-calculate nonCashPercentageTotal outside the loop for efficiency */}
          {(() => {
            const nonCashPercentageTotal = Object.entries(assetClassTargets)
              .filter(([cls, target]) => 
                cls !== 'CASH' && 
                target.targetMode === 'PERCENTAGE' && 
                (target.targetPercent || 0) > 0
              )
              .reduce((sum, [, target]) => sum + (target.targetPercent || 0), 0);
            
            return assetClasses.map(ac => {
            const isEditing = editingClass === ac.assetClass;
            // Use assetClassTargets for display, fall back to computed values
            const classTarget = assetClassTargets[ac.assetClass];
            const displayTargetMode = classTarget?.targetMode ?? ac.targetMode;
            const displayTargetPercent = classTarget?.targetPercent ?? ac.targetPercent;
            
            // Calculate cash distribution for non-cash classes
            let cashAdjustment = 0;
            if (ac.assetClass !== 'CASH' && cashDeltaAmount !== 0) {
              if (nonCashPercentageTotal > 0 && displayTargetMode === 'PERCENTAGE' && (displayTargetPercent || 0) > 0) {
                const proportion = (displayTargetPercent || 0) / nonCashPercentageTotal;
                // Negative cash delta = INVEST = add to this class
                // Positive cash delta = SAVE = subtract from this class
                cashAdjustment = -cashDeltaAmount * proportion;
              }
            }
            
            // Calculate target total and delta based on assetClassTargets
            let targetTotal = displayTargetMode === 'PERCENTAGE' && displayTargetPercent !== undefined
              ? (displayTargetPercent / 100) * totalValue
              : displayTargetMode === 'SET'
              ? ac.targetTotal
              : undefined;
            
            // Add cash adjustment to target for non-cash classes
            if (targetTotal !== undefined && ac.assetClass !== 'CASH') {
              targetTotal += cashAdjustment;
            }
            
            const delta = (targetTotal ?? 0) - ac.currentTotal;
            
            return (
              <tr 
                key={ac.assetClass} 
                className={`${displayTargetMode === 'OFF' ? 'excluded-row' : ''} ${isEditing ? 'editing-row' : ''}`}
                onClick={() => !isEditing && startEditing(ac)}
              >
                <td>
                  <span className={`asset-class-badge ${ac.assetClass.toLowerCase()}`}>
                    {formatAssetName(ac.assetClass)}
                  </span>
                </td>
                <td>
                  {isEditing ? (
                    <select
                      value={editMode}
                      onChange={(e) => setEditMode(e.target.value as AllocationMode)}
                      onClick={(e) => e.stopPropagation()}
                      className="edit-select-small"
                    >
                      <option value="PERCENTAGE">%</option>
                      <option value="SET">SET</option>
                      <option value="OFF">OFF</option>
                    </select>
                  ) : (
                    displayTargetMode === 'SET' ? (
                      <span className="set-label">SET</span>
                    ) : displayTargetMode === 'OFF' ? (
                      <span className="off-label">OFF</span>
                    ) : (
                      <span>%</span>
                    )
                  )}
                </td>
                <td>
                  {isEditing && editMode === 'PERCENTAGE' ? (
                    <NumberInput
                      value={editPercent}
                      onChange={(value) => setEditPercent(value)}
                      className="edit-input"
                    />
                  ) : (
                    displayTargetMode === 'PERCENTAGE' && displayTargetPercent !== undefined
                      ? formatPercent(displayTargetPercent)
                      : displayTargetMode === 'SET'
                      ? 'SET'
                      : 'OFF'
                  )}
                </td>
                <td>{formatPercent(ac.currentPercent)}</td>
                <td className="currency-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(ac.currentTotal, currency)}</PrivacyBlur></td>
                <td className="currency-value">
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>{targetTotal !== undefined ? formatCurrency(targetTotal, currency) : '-'}</PrivacyBlur>
                </td>
                <td className={`currency-value ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}`}>
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>{delta > 0 ? '+' : delta < 0 ? '-' : ''}{formatCurrency(Math.abs(delta), currency)}</PrivacyBlur>
                </td>
                <td>
                  <span 
                    className="action-badge"
                    style={{ backgroundColor: getActionColor(getAction(ac.assetClass, delta, displayTargetMode)) }}
                  >
                    {getAction(ac.assetClass, delta, displayTargetMode)}
                  </span>
                </td>
                <td>
                  {isEditing ? (
                    <div className="edit-actions">
                      <button onClick={saveEditing} className="btn-save" title={t('common.save')}>✓</button>
                      <button onClick={cancelEditing} className="btn-cancel-edit" title={t('common.cancel')}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => startEditing(ac)} className="btn-edit" title={t('common.edit')}>✎</button>
                  )}
                </td>
              </tr>
            );
          });
          })()}
          <tr className="total-row">
            <td><strong>{t('tables.totalPortfolio')}</strong></td>
            <td colSpan={3}></td>
            <td className="currency-value"><strong><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(totalHoldings, currency)}</PrivacyBlur></strong></td>
            <td colSpan={4}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
