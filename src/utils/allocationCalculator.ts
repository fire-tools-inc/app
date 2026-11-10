import {
  Asset,
  AssetClass,
  AssetClassSummary,
  AllocationDelta,
  PortfolioAllocation,
  AllocationAction,
  AllocationMode,
  ChartData,
} from '../types/assetAllocation';
import { formatDisplayCurrency, formatDisplayPercent } from './numberFormatter';
import { loadSettings, type UserSettings } from './cookieSettings';
import { ASSET_CLASS_CHART_COLORS, getChartColor } from './chartColors';

export interface FIREPortfolioData {
  totalValue: number;
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
}

/**
 * Calculate portfolio data for FIRE calculations, respecting asset class inclusion settings
 * and primary residence inclusion setting.
 */
export function calculateFIREPortfolioData(
  assets: Asset[],
  settings: Pick<UserSettings, 'fireAssetClassInclusion' | 'includePrimaryResidenceInFIRE'> = loadSettings(),
): FIREPortfolioData | undefined {
  const inclusion = settings.fireAssetClassInclusion;
  const includePrimaryResidence = settings.includePrimaryResidenceInFIRE;

  // Filter: active assets, included asset class, and optionally exclude primary residence
  const fireAssets = assets.filter(a =>
    a.targetMode !== 'OFF' &&
    inclusion[a.assetClass] &&
    (includePrimaryResidence || !a.isPrimaryResidence)
  );

  const totalValue = fireAssets.reduce((sum, a) => sum + a.currentValue, 0);
  if (totalValue === 0) return undefined;

  const stocksValue = fireAssets
    .filter(a => a.assetClass === 'STOCKS')
    .reduce((sum, a) => sum + a.currentValue, 0);
  const bondsValue = fireAssets
    .filter(a => a.assetClass === 'BONDS')
    .reduce((sum, a) => sum + a.currentValue, 0);
  const cashValue = fireAssets
    .filter(a => a.assetClass === 'CASH')
    .reduce((sum, a) => sum + a.currentValue, 0);

  return {
    totalValue,
    stocksPercent: (stocksValue / totalValue) * 100,
    bondsPercent: (bondsValue / totalValue) * 100,
    cashPercent: (cashValue / totalValue) * 100,
  };
}

/**
 * Calculate the total portfolio value
 */
export function calculateTotalValue(assets: Asset[]): number {
  return assets.reduce((total, asset) => {
    if (asset.targetMode === 'OFF') return total;
    return total + asset.currentValue;
  }, 0);
}

/**
 * Group assets by asset class
 */
export function groupAssetsByClass(assets: Asset[]): Map<AssetClass, Asset[]> {
  const grouped = new Map<AssetClass, Asset[]>();
  
  assets.forEach(asset => {
    const existing = grouped.get(asset.assetClass) || [];
    existing.push(asset);
    grouped.set(asset.assetClass, existing);
  });
  
  return grouped;
}

/**
 * Calculate asset class summaries
 */
export function calculateAssetClassSummaries(
  assets: Asset[],
  totalValue: number,
  totalHoldings?: number,
  assetClassTargets?: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>
): AssetClassSummary[] {
  const grouped = groupAssetsByClass(assets);
  const summaries: AssetClassSummary[] = [];
  
  // Use totalHoldings for current percentage display if provided, otherwise fall back to totalValue
  // totalHoldings represents all assets including cash (for display)
  // totalValue represents portfolio value excluding cash (for target calculations)
  const percentageBase = totalHoldings ?? totalValue;
  
  grouped.forEach((classAssets, assetClass) => {
    const currentTotal = classAssets.reduce((sum, asset) => {
      return sum + (asset.targetMode === 'OFF' ? 0 : asset.currentValue);
    }, 0);
    
    // currentPercent should be based on total holdings (all assets) for accurate display
    // This fixes the bug where percentages could exceed 100% when cash was excluded from denominator
    const currentPercent = percentageBase > 0 ? (currentTotal / percentageBase) * 100 : 0;
    
    // Determine class-level target
    let targetMode: AllocationMode = 'PERCENTAGE';
    let targetPercent: number | undefined;
    let targetTotal: number | undefined;
    
    // If all assets in class are OFF, class is OFF
    if (classAssets.every(a => a.targetMode === 'OFF')) {
      targetMode = 'OFF';
    } else if (classAssets.some(a => a.targetMode === 'SET')) {
      // If any asset is SET, calculate fixed total
      targetMode = 'SET';
      targetTotal = classAssets.reduce((sum, asset) => {
        if (asset.targetMode === 'SET') {
          return sum + (asset.targetValue || 0);
        }
        return sum;
      }, 0);
    } else if (assetClassTargets && assetClassTargets[assetClass]) {
      // Use class-level target from assetClassTargets if provided (preferred path)
      const classTarget = assetClassTargets[assetClass];
      targetMode = classTarget.targetMode;
      targetPercent = classTarget.targetPercent;
      if (targetMode === 'PERCENTAGE' && targetPercent !== undefined) {
        targetTotal = totalValue > 0 ? (targetPercent / 100) * totalValue : 0;
      }
    } else {
      // Fallback: Calculate percentage target from individual assets
      // This path is for backward compatibility when assetClassTargets is not provided
      // Note: Individual asset percentages sum to 100% within the class, not the portfolio
      targetPercent = classAssets.reduce((sum, asset) => {
        if (asset.targetMode === 'PERCENTAGE') {
          return sum + (asset.targetPercent || 0);
        }
        return sum;
      }, 0);
      targetTotal = totalValue > 0 ? (targetPercent / 100) * totalValue : 0;
    }
    
    const delta = (targetTotal || 0) - currentTotal;
    const action = determineAction(assetClass, delta, targetMode);
    
    summaries.push({
      assetClass,
      assets: classAssets,
      currentTotal,
      currentPercent,
      targetMode,
      targetPercent,
      targetTotal,
      delta,
      action,
    });
  });
  
  return summaries;
}

// Threshold for determining when to take action (in currency units)
const ACTION_THRESHOLD = 100;

/**
 * Determine the recommended action based on delta
 */
export function determineAction(
  assetClass: AssetClass,
  delta: number,
  targetMode: AllocationMode
): AllocationAction {
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
}

/**
 * Calculate allocation deltas for each asset
 * Note: targetPercent in assets is relative to the class (should sum to 100% within each class)
 * The delta calculation uses the class target value to determine each asset's target value
 * 
 * @param assets - Array of assets
 * @param totalValue - Portfolio value (typically excluding cash)
 * @param assetClassTargets - Class-level target configurations
 * @param cashDeltaAmount - Cash delta (positive = SAVE/subtract from other classes, negative = INVEST/add to other classes)
 * @param totalHoldings - Total holdings including cash (for currentPercent display)
 */
export function calculateAllocationDeltas(
  assets: Asset[],
  totalValue: number,
  assetClassTargets?: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>,
  cashDeltaAmount?: number,
  totalHoldings?: number
): AllocationDelta[] {
  const deltas: AllocationDelta[] = [];
  const grouped = groupAssetsByClass(assets);
  
  // Use totalHoldings for current percentage display if provided, otherwise fall back to totalValue
  const percentageBase = totalHoldings ?? totalValue;
  
  // Calculate total non-cash percentage for proportional cash distribution
  let nonCashPercentageTotal = 0;
  if (assetClassTargets && cashDeltaAmount && cashDeltaAmount !== 0) {
    nonCashPercentageTotal = Object.entries(assetClassTargets)
      .filter(([cls, target]) => 
        cls !== 'CASH' && 
        target.targetMode === 'PERCENTAGE' && 
        (target.targetPercent || 0) > 0
      )
      .reduce((sum, [, target]) => sum + (target.targetPercent || 0), 0);
  }
  
  grouped.forEach((classAssets, assetClass) => {
    const classTotal = classAssets.reduce((sum, asset) => {
      return sum + (asset.targetMode === 'OFF' ? 0 : asset.currentValue);
    }, 0);
    
    // Get the class target value from assetClassTargets if provided
    let classTargetValue = 0;
    if (assetClassTargets && assetClassTargets[assetClass]) {
      const classTarget = assetClassTargets[assetClass];
      if (classTarget.targetMode === 'PERCENTAGE' && classTarget.targetPercent !== undefined) {
        classTargetValue = (classTarget.targetPercent / 100) * totalValue;
      } else if (classTarget.targetMode === 'SET') {
        // For SET mode, use the sum of SET target values from assets
        classTargetValue = classAssets.reduce((sum, asset) => {
          if (asset.targetMode === 'SET') {
            return sum + (asset.targetValue || 0);
          }
          return sum;
        }, 0);
      }
    } else {
      // Fallback: calculate from assets
      classTargetValue = classAssets.reduce((sum, asset) => {
        if (asset.targetMode === 'SET') {
          return sum + (asset.targetValue || 0);
        } else if (asset.targetMode === 'PERCENTAGE') {
          return sum + ((asset.targetPercent || 0) / 100) * totalValue;
        }
        return sum;
      }, 0);
    }
    
    // Add cash adjustment for non-cash classes
    // Cash delta: positive = SAVE (subtract from other classes), negative = INVEST (add to other classes)
    if (assetClass !== 'CASH' && cashDeltaAmount && cashDeltaAmount !== 0 && nonCashPercentageTotal > 0 && assetClassTargets) {
      const classTarget = assetClassTargets[assetClass];
      if (classTarget?.targetMode === 'PERCENTAGE' && classTarget.targetPercent && classTarget.targetPercent > 0) {
        const proportion = classTarget.targetPercent / nonCashPercentageTotal;
        // Negative cash delta = INVEST = add to this class
        // Positive cash delta = SAVE = subtract from this class
        const cashAdjustment = -cashDeltaAmount * proportion;
        classTargetValue += cashAdjustment;
      }
    }
    
    classAssets.forEach(asset => {
      if (asset.targetMode === 'OFF') {
        deltas.push({
          assetId: asset.id,
          currentValue: asset.currentValue,
          currentPercent: 0,
          currentPercentInClass: 0,
          targetValue: 0,
          targetPercent: 0,
          delta: 0,
          deltaPercent: 0,
          action: 'EXCLUDED',
        });
        return;
      }
      
      // currentPercent should be based on totalHoldings (all assets) for accurate display
      const currentPercent = percentageBase > 0 ? (asset.currentValue / percentageBase) * 100 : 0;
      const currentPercentInClass = classTotal > 0 ? (asset.currentValue / classTotal) * 100 : 0;
      
      let targetValue = 0;
      let targetPercent = 0;
      
      if (asset.targetMode === 'SET') {
        targetValue = asset.targetValue || 0;
        targetPercent = totalValue > 0 ? (targetValue / totalValue) * 100 : 0;
      } else if (asset.targetMode === 'PERCENTAGE' && asset.targetPercent !== undefined) {
        // targetPercent is the percentage within the class (should sum to 100% in class)
        // Calculate target value based on class target value
        targetValue = (asset.targetPercent / 100) * classTargetValue;
        targetPercent = totalValue > 0 ? (targetValue / totalValue) * 100 : 0;
      }
      
      const delta = targetValue - asset.currentValue;
      const deltaPercent = targetPercent - currentPercent;
      const action = determineAction(assetClass, delta, asset.targetMode);
      
      deltas.push({
        assetId: asset.id,
        currentValue: asset.currentValue,
        currentPercent,
        currentPercentInClass,
        targetValue,
        targetPercent,
        delta,
        deltaPercent,
        action,
      });
    });
  });
  
  return deltas;
}

/**
 * Validate portfolio allocation
 * Note: Asset percentages should sum to 100% within each asset class (not total portfolio)
 */
export function validateAllocation(assets: Asset[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Group assets by class and validate each class's percentages sum to 100%
  const grouped = groupAssetsByClass(assets);
  
  grouped.forEach((classAssets, assetClass) => {
    const percentageAssets = classAssets.filter(a => a.targetMode === 'PERCENTAGE');
    
    if (percentageAssets.length > 0) {
      const totalPercent = percentageAssets.reduce((sum, asset) => {
        return sum + (asset.targetPercent || 0);
      }, 0);
      
      // Allow small floating point tolerance
      if (Math.abs(totalPercent - 100) > 0.1) {
        errors.push(`${assetClass} target percentages must sum to 100% within the class (current: ${totalPercent.toFixed(2)}%)`);
      }
    }
  });
  
  // Check for negative values
  assets.forEach(asset => {
    if (asset.currentValue < 0) {
      errors.push(`Asset ${asset.name} has negative value: ${asset.currentValue}`);
    }
    
    if (asset.targetMode === 'PERCENTAGE' && (asset.targetPercent || 0) < 0) {
      errors.push(`Asset ${asset.name} has negative target percentage: ${asset.targetPercent}`);
    }
    
    if (asset.targetMode === 'SET' && (asset.targetValue || 0) < 0) {
      errors.push(`Asset ${asset.name} has negative target value: ${asset.targetValue}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate portfolio allocation with all details
 * 
 * @param assets - Array of assets
 * @param assetClassTargets - Class-level target configurations
 * @param portfolioValue - Portfolio value (typically excluding cash)
 * @param cashDeltaAmount - Cash delta (positive = SAVE, negative = INVEST)
 */
export function calculatePortfolioAllocation(
  assets: Asset[],
  assetClassTargets?: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>,
  portfolioValue?: number,
  cashDeltaAmount?: number
): PortfolioAllocation {
  const validation = validateAllocation(assets);
  const totalValue = portfolioValue ?? calculateTotalValue(assets);
  // Calculate total holdings including all assets (for display purposes and currentPercent calculation)
  const totalHoldings = assets.reduce((sum, a) => sum + a.currentValue, 0);
  // Pass totalHoldings and assetClassTargets so calculations are correct
  const assetClasses = calculateAssetClassSummaries(assets, totalValue, totalHoldings, assetClassTargets);
  const deltas = calculateAllocationDeltas(assets, totalValue, assetClassTargets, cashDeltaAmount, totalHoldings);
  
  return {
    assets,
    assetClasses,
    totalValue,
    totalHoldings,
    deltas,
    isValid: validation.isValid,
    validationErrors: validation.errors,
  };
}

/**
 * Prepare data for pie/donut chart by asset class
 */
export function prepareAssetClassChartData(assetClasses: AssetClassSummary[]): ChartData[] {
  return assetClasses
    .filter(ac => ac.targetMode !== 'OFF' && ac.currentTotal > 0)
    .map(ac => ({
      name: ac.assetClass,
      value: ac.currentTotal,
      percentage: ac.currentPercent,
      color: ASSET_CLASS_CHART_COLORS[ac.assetClass],
    }));
}

/**
 * Prepare data for pie/donut chart by individual asset within a class
 */
export function prepareAssetChartData(
  assets: Asset[],
  classTotal: number
): ChartData[] {
  return assets
    .filter(a => a.targetMode !== 'OFF' && a.currentValue > 0)
    .map((asset, index) => {
      const percentage = classTotal > 0 ? (asset.currentValue / classTotal) * 100 : 0;
      return {
        name: asset.name,
        value: asset.currentValue,
        percentage,
        color: getChartColor(index),
        // Ticker is used as fallback label when asset name is too long (>10 chars) in chart display
        ticker: asset.ticker,
      };
    });
}

/**
 * Format currency value
 * @param value - The numeric value to format
 * @param currency - Optional currency code. If not provided, uses the default currency from settings.
 */
export function formatCurrency(value: number, currency?: string): string {
  return formatDisplayCurrency(value, currency);
}

/**
 * Format currency with abbreviations for large numbers (e.g., 2.1M, 850K)
 */
export function formatAbbreviatedCurrency(value: number, currency: string = '\u20AC'): string {
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000) {
    return `${currency}${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${currency}${(value / 1000).toFixed(0)}K`;
  } else {
    return `${currency}${value.toFixed(0)}`;
  }
}

/**
 * Format percentage value
 */
export function formatPercent(value: number): string {
  return formatDisplayPercent(value);
}

/**
 * Export portfolio to CSV
 */
export function exportToCSV(allocation: PortfolioAllocation): string {
  const headers = [
    'Asset / Index',
    'Ticker(s)',
    'Asset Class',
    '% Target',
    '% Current',
    'Absolute Current',
    'Absolute Target',
    'Delta',
    'Action',
    'Notes'
  ];
  
  const rows = allocation.assets.map(asset => {
    const delta = allocation.deltas.find(d => d.assetId === asset.id);
    return [
      asset.name,
      asset.ticker,
      asset.assetClass,
      asset.targetMode === 'SET' ? 'SET' : 
        asset.targetMode === 'OFF' ? 'OFF' : 
        `${(asset.targetPercent || 0).toFixed(2)}%`,
      delta ? `${delta.currentPercent.toFixed(2)}%` : '0%',
      asset.currentValue.toFixed(2),
      delta ? delta.targetValue.toFixed(2) : '0',
      delta ? delta.delta.toFixed(2) : '0',
      delta?.action || 'HOLD',
      ''
    ];
  });
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  return csv;
}

/**
 * Parse CSV to create assets
 */
export function importFromCSV(csv: string): Asset[] {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Skip header
  const dataLines = lines.slice(1);
  
  return dataLines.map((line, index) => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 6) {
      throw new Error(`Invalid CSV format at line ${index + 2}`);
    }
    
    const [name, ticker, assetClass, targetStr, , currentValue] = parts;
    
    let targetMode: AllocationMode = 'PERCENTAGE';
    let targetPercent: number | undefined;
    let targetValue: number | undefined;
    
    if (targetStr === 'OFF') {
      targetMode = 'OFF';
    } else if (targetStr === 'SET') {
      targetMode = 'SET';
      targetValue = parseFloat(currentValue);
    } else {
      targetPercent = parseFloat(targetStr.replace('%', ''));
    }
    
    return {
      id: `asset-${index}`,
      name,
      ticker,
      assetClass: assetClass as AssetClass,
      subAssetType: 'NONE',
      currentValue: parseFloat(currentValue),
      targetMode,
      targetPercent,
      targetValue,
    };
  });
}

/**
 * Format asset class or sub-type name for display
 */
export function formatAssetName(name: string): string {
  // Special case for ETF - keep it all caps
  if (name === 'ETF') return 'ETF';
  
  return name
    .split('_')
    .map(word => {
      // Keep ETF in all caps
      if (word === 'ETF') return 'ETF';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
