import { AllocationMode, Asset, AssetClass } from '../types/assetAllocation';

/** Asset class targets the Asset Allocation page starts with. */
export const DEFAULT_ALLOCATION_PAGE_TARGETS: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
  STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 60 },
  BONDS: { targetMode: 'PERCENTAGE', targetPercent: 40 },
  CASH: { targetMode: 'SET', targetPercent: 0 },
  CRYPTO: { targetMode: 'OFF', targetPercent: 0 },
  REAL_ESTATE: { targetMode: 'OFF', targetPercent: 0 },
  COMMODITIES: { targetMode: 'OFF', targetPercent: 0 },
  VEHICLE: { targetMode: 'OFF', targetPercent: 0 },
  COLLECTIBLE: { targetMode: 'OFF', targetPercent: 0 },
  ART: { targetMode: 'OFF', targetPercent: 0 },
};

// Default portfolio value is calculated from non-cash assets (65k)
// Total holdings including cash = 70k
export const DEFAULT_PORTFOLIO_VALUE = 65000;

export const DEFAULT_ASSETS: Asset[] = [
  // Stocks - 50% current of total holdings (35k out of 70k)
  // Target: 60% of 65k (non-cash portfolio) = 39k
  {
    id: 'stock-1',
    name: 'S&P 500 Index ETF',
    ticker: 'SPY',
    isin: 'US78462F1030',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 14000, // 40% of 35k
    targetMode: 'PERCENTAGE',
    targetPercent: 40, // 40% of stocks
  },
  {
    id: 'stock-2',
    name: 'Vanguard Total Stock Market',
    ticker: 'VTI',
    isin: 'US9229087690',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 9450, // 27% of 35k
    targetMode: 'PERCENTAGE',
    targetPercent: 27, // 27% of stocks
  },
  {
    id: 'stock-3',
    name: 'International Developed Markets',
    ticker: 'VXUS',
    isin: 'US9219097683',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 5950, // 17% of 35k
    targetMode: 'PERCENTAGE',
    targetPercent: 17, // 17% of stocks
  },
  {
    id: 'stock-4',
    name: 'Emerging Markets ETF',
    ticker: 'VWO',
    isin: 'US9220428588',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 3500, // 10% of 35k
    targetMode: 'PERCENTAGE',
    targetPercent: 10, // 10% of stocks
  },
  {
    id: 'stock-5',
    name: 'Small Cap Value',
    ticker: 'VBR',
    isin: 'US9219097766',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 2100, // 6% of 35k
    targetMode: 'PERCENTAGE',
    targetPercent: 6, // 6% of stocks = 100% total
  },
  
  // Bonds - ~43% current of total holdings (30k out of 70k)
  // Target: 40% of 65k (non-cash portfolio) = 26k
  {
    id: 'bond-1',
    name: 'Total Bond Market',
    ticker: 'BND',
    isin: 'US9219378356',
    assetClass: 'BONDS',
    subAssetType: 'ETF',
    currentValue: 15000, // 50% of 30k
    targetMode: 'PERCENTAGE',
    targetPercent: 50, // 50% of bonds
  },
  {
    id: 'bond-2',
    name: 'Treasury Inflation-Protected',
    ticker: 'TIP',
    isin: 'US4642874659',
    assetClass: 'BONDS',
    subAssetType: 'ETF',
    currentValue: 9000, // 30% of 30k
    targetMode: 'PERCENTAGE',
    targetPercent: 30, // 30% of bonds
  },
  {
    id: 'bond-3',
    name: 'International Bond',
    ticker: 'BNDX',
    isin: 'US9219378273',
    assetClass: 'BONDS',
    subAssetType: 'ETF',
    currentValue: 6000, // 20% of 30k
    targetMode: 'PERCENTAGE',
    targetPercent: 20, // 20% of bonds = 100% total
  },
  
  // Cash - ~7% current of total holdings (5k out of 70k)
  // SET to 5k target
  {
    id: 'cash-1',
    name: 'Primary bank cash',
    ticker: 'CASH',
    assetClass: 'CASH',
    subAssetType: 'SAVINGS_ACCOUNT',
    currentValue: 5000,
    targetMode: 'SET',
    targetValue: 5000,
    institutionCode: 'DE_ING',
    institutionName: 'ING Germany',
  },
];
