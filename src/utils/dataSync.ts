/**
 * Data Sync Utilities
 * Handles bidirectional data synchronization between Asset Allocation Manager 
 * and Net Worth Tracker for the current month
 */

import { Asset, AssetClass, SubAssetType, AllocationMode } from '../types/assetAllocation';
import { 
  NetWorthTrackerData, 
  AssetHolding, 
  CashEntry, 
  generateNetWorthId,
  createEmptyMonthlySnapshot,
  createEmptyNetWorthYearData,
} from '../types/netWorthTracker';
import { SupportedCurrency } from '../types/currency';

/**
 * Default asset class targets for Asset Allocation Manager
 * Used when no existing targets are found
 */
export const DEFAULT_ASSET_CLASS_TARGETS: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
  STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 70 },
  BONDS: { targetMode: 'PERCENTAGE', targetPercent: 20 },
  CASH: { targetMode: 'PERCENTAGE', targetPercent: 10 },
  CRYPTO: { targetMode: 'OFF' },
  REAL_ESTATE: { targetMode: 'OFF' },
  COMMODITIES: { targetMode: 'OFF' },
  VEHICLE: { targetMode: 'OFF' },
  COLLECTIBLE: { targetMode: 'OFF' },
  ART: { targetMode: 'OFF' },
};

/**
 * Maps Asset Allocation asset class to Net Worth asset class
 */
function mapAssetClassToNetWorth(assetClass: AssetClass): AssetHolding['assetClass'] {
  switch (assetClass) {
    case 'STOCKS':
      return 'STOCKS';
    case 'BONDS':
      return 'BONDS';
    case 'CRYPTO':
      return 'CRYPTO';
    case 'REAL_ESTATE':
      return 'REAL_ESTATE';
    case 'COMMODITIES':
      return 'COMMODITIES';
    case 'VEHICLE':
      return 'VEHICLE';
    case 'COLLECTIBLE':
      return 'COLLECTIBLE';
    case 'ART':
      return 'ART';
    case 'CASH':
      return 'OTHER'; // Cash handled separately
    default:
      return 'OTHER';
  }
}

/**
 * Maps SubAssetType to determine if asset should be treated as cash
 */
function isCashAsset(subAssetType: SubAssetType): boolean {
  return [
    'SAVINGS_ACCOUNT',
    'CHECKING_ACCOUNT',
    'BROKERAGE_ACCOUNT',
    'MONEY_ETF',
  ].includes(subAssetType);
}

/**
 * Maps Asset Allocation SubAssetType to Net Worth CashEntry account type
 */
function mapSubAssetTypeToCashAccountType(subAssetType: SubAssetType): CashEntry['accountType'] {
  switch (subAssetType) {
    case 'SAVINGS_ACCOUNT':
      return 'SAVINGS';
    case 'CHECKING_ACCOUNT':
      return 'CHECKING';
    case 'BROKERAGE_ACCOUNT':
      return 'BROKERAGE';
    case 'MONEY_ETF':
      return 'BROKERAGE';
    default:
      return 'OTHER';
  }
}

/**
 * Maps Net Worth AssetHolding asset class to Asset Allocation AssetClass
 */
function mapNetWorthAssetClassToAllocation(assetClass: AssetHolding['assetClass']): AssetClass {
  switch (assetClass) {
    case 'STOCKS':
      return 'STOCKS';
    case 'BONDS':
      return 'BONDS';
    case 'ETF':
      return 'STOCKS'; // ETFs are treated as stocks in Asset Allocation
    case 'CRYPTO':
      return 'CRYPTO';
    case 'REAL_ESTATE':
      return 'REAL_ESTATE';
    case 'COMMODITIES':
      return 'COMMODITIES';
    case 'VEHICLE':
      return 'VEHICLE';
    case 'COLLECTIBLE':
      return 'COLLECTIBLE';
    case 'ART':
      return 'ART';
    case 'PRIVATE_EQUITY':
    case 'OTHER':
    default:
      return 'STOCKS'; // Default to STOCKS as closest match for financial assets
  }
}

/**
 * Syncs asset allocation data to net worth tracker for the current month
 * 
 * Rules:
 * - Only syncs to the current month (currentYear/currentMonth)
 * - Assets (non-cash) are converted to AssetHolding with shares and pricePerShare
 * - If shares and pricePerShare are provided, use them; otherwise default to shares=1, pricePerShare=currentValue
 * - Cash assets are converted to CashEntry
 * - Existing data in current month is replaced (overwritten)
 * - Other months remain unchanged
 * 
 * @param assetAllocationData - Array of assets from Asset Allocation Manager
 * @param netWorthData - Current Net Worth Tracker data
 * @returns Updated Net Worth Tracker data with synced current month
 */
export function syncAssetAllocationToNetWorth(
  assetAllocationData: Asset[],
  netWorthData: NetWorthTrackerData
): NetWorthTrackerData {
  const result = JSON.parse(JSON.stringify(netWorthData)) as NetWorthTrackerData;
  
  // Find or create current year
  let yearData = result.years.find(y => y.year === result.currentYear);
  if (!yearData) {
    yearData = createEmptyNetWorthYearData(result.currentYear);
    result.years.push(yearData);
    result.years.sort((a, b) => a.year - b.year);
  }
  
  // Find or create current month
  let monthData = yearData.months.find(m => m.month === result.currentMonth);
  if (!monthData) {
    monthData = createEmptyMonthlySnapshot(result.currentYear, result.currentMonth);
    yearData.months.push(monthData);
    yearData.months.sort((a, b) => a.month - b.month);
  }
  
  // Preserve physical assets (vehicles, collectibles, art) that only exist in net worth
  // These are not part of asset allocation and should not be overwritten during sync
  const physicalAssetClasses = ['VEHICLE', 'COLLECTIBLE', 'ART'];
  const preservedPhysicalAssets = monthData.assets.filter(
    a => physicalAssetClasses.includes(a.assetClass)
  );
  
  // Clear existing financial assets and cash for sync (preserve physical assets)
  const newAssets: AssetHolding[] = [...preservedPhysicalAssets];
  const newCashEntries: CashEntry[] = [];
  
  // Process each asset from Asset Allocation
  for (const asset of assetAllocationData) {
    if (asset.assetClass === 'CASH' || isCashAsset(asset.subAssetType)) {
      // Convert to cash entry with sync metadata preserved
      const cashEntry: CashEntry = {
        id: generateNetWorthId(),
        accountName: asset.name,
        accountType: mapSubAssetTypeToCashAccountType(asset.subAssetType),
        balance: asset.currentValue,
        currency: (asset.originalCurrency || 'EUR') as SupportedCurrency,
        // Preserve institution info (same as Asset Allocation)
        institutionCode: asset.institutionCode,
        institutionName: asset.institutionName,
        // Preserve sync metadata (hidden from UI)
        shares: asset.shares,
        pricePerShare: asset.pricePerShare,
        targetMode: asset.targetMode,
        targetPercent: asset.targetPercent,
        targetValue: asset.targetValue,
        syncSubAssetType: asset.subAssetType,
      };
      newCashEntries.push(cashEntry);
    } else {
      // Convert to asset holding with sync metadata preserved
      // Use provided shares and pricePerShare if available, otherwise default to shares=1, price=currentValue
      const shares = asset.shares !== undefined && asset.shares > 0 ? asset.shares : 1;
      const pricePerShare = asset.pricePerShare !== undefined && asset.pricePerShare > 0 
        ? asset.pricePerShare 
        : asset.currentValue / shares;
      
      const assetHolding: AssetHolding = {
        id: generateNetWorthId(),
        ticker: asset.ticker || asset.name.substring(0, 5).toUpperCase(),
        name: asset.name,
        shares,
        pricePerShare,
        acquisitionPrice: asset.acquisitionPrice ?? pricePerShare,
        currency: (asset.originalCurrency || 'EUR') as SupportedCurrency,
        assetClass: mapAssetClassToNetWorth(asset.assetClass),
        // Preserve sync metadata (hidden from UI)
        targetMode: asset.targetMode,
        targetPercent: asset.targetPercent,
        targetValue: asset.targetValue,
        syncAssetClass: asset.assetClass,
        syncSubAssetType: asset.subAssetType,
        isin: asset.isin,
        isPrimaryResidence: asset.isPrimaryResidence,
      };
      newAssets.push(assetHolding);
    }
  }
  
  // Replace current month data
  monthData.assets = newAssets;
  monthData.cashEntries = newCashEntries;
  // Keep pensions, operations, debts, and taxes unchanged
  
  return result;
}

/**
 * Syncs net worth tracker data to asset allocation for the current month
 * 
 * Rules:
 * - Only syncs from the current month (currentYear/currentMonth)
 * - AssetHolding are converted to Assets with currentValue = shares * pricePerShare
 * - Shares and pricePerShare are preserved in the Asset
 * - CashEntry are converted to Cash assets
 * - Existing asset allocation data is replaced (overwritten)
 * 
 * @param netWorthData - Current Net Worth Tracker data
 * @returns Array of assets for Asset Allocation Manager
 */
export function syncNetWorthToAssetAllocation(
  netWorthData: NetWorthTrackerData
): Asset[] {
  // Find current month data
  const yearData = netWorthData.years.find(y => y.year === netWorthData.currentYear);
  if (!yearData) {
    return [];
  }
  
  const monthData = yearData.months.find(m => m.month === netWorthData.currentMonth);
  if (!monthData) {
    return [];
  }
  
  const assets: Asset[] = [];
  
  // Convert asset holdings to assets (restore sync metadata)
  // Skip physical assets (vehicles, collectibles, art) as they don't belong in asset allocation
  for (const holding of monthData.assets) {
    // Skip physical assets that shouldn't be in asset allocation
    if (['VEHICLE', 'COLLECTIBLE', 'ART'].includes(holding.assetClass)) {
      continue;
    }
    
    const asset: Asset = {
      id: holding.id,
      name: holding.name,
      ticker: holding.ticker,
      assetClass: holding.syncAssetClass || mapNetWorthAssetClassToAllocation(holding.assetClass),
      subAssetType: (holding.syncSubAssetType as SubAssetType) || 'ETF' as SubAssetType,
      currentValue: holding.shares * holding.pricePerShare,
      shares: holding.shares,
      pricePerShare: holding.pricePerShare,
      acquisitionPrice: holding.acquisitionPrice,
      originalCurrency: holding.currency as SupportedCurrency,
      originalValue: holding.shares * holding.pricePerShare,
      isin: holding.isin,
      // Restore target metadata from sync metadata
      targetMode: holding.targetMode || 'OFF',
      targetPercent: holding.targetPercent,
      targetValue: holding.targetValue,
      isPrimaryResidence: holding.isPrimaryResidence,
    };
    assets.push(asset);
  }
  
  // Convert cash entries to assets (restore sync metadata)
  for (const cashEntry of monthData.cashEntries) {
    const subAssetType: SubAssetType = cashEntry.syncSubAssetType as SubAssetType ||
      (cashEntry.accountType === 'SAVINGS' ? 'SAVINGS_ACCOUNT' :
      cashEntry.accountType === 'CHECKING' ? 'CHECKING_ACCOUNT' :
      cashEntry.accountType === 'BROKERAGE' ? 'BROKERAGE_ACCOUNT' :
      'SAVINGS_ACCOUNT');
    
    const asset: Asset = {
      id: cashEntry.id,
      name: cashEntry.accountName,
      ticker: '',
      assetClass: 'CASH',
      subAssetType,
      currentValue: cashEntry.balance,
      shares: cashEntry.shares,
      pricePerShare: cashEntry.pricePerShare,
      originalCurrency: cashEntry.currency as SupportedCurrency,
      originalValue: cashEntry.balance,
      // Restore institution info from cash entry
      institutionCode: cashEntry.institutionCode,
      institutionName: cashEntry.institutionName,
      // Restore target metadata from sync metadata
      targetMode: cashEntry.targetMode || 'OFF',
      targetPercent: cashEntry.targetPercent,
      targetValue: cashEntry.targetValue,
    };
    assets.push(asset);
  }
  
  return assets;
}
