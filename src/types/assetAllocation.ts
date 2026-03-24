/**
 * Asset Allocation Manager Types
 */

import { SupportedCurrency } from './currency';

export type AllocationMode = 'PERCENTAGE' | 'OFF' | 'SET';

export type AssetClass = 'STOCKS' | 'BONDS' | 'CASH' | 'CRYPTO' | 'REAL_ESTATE' | 'COMMODITIES' | 'VEHICLE' | 'COLLECTIBLE' | 'ART';

export type SubAssetType = 
  | 'ETF' 
  | 'SINGLE_STOCK' 
  | 'SINGLE_BOND' 
  | 'SAVINGS_ACCOUNT'
  | 'CHECKING_ACCOUNT'
  | 'BROKERAGE_ACCOUNT'
  | 'MONEY_ETF'
  | 'COIN'
  | 'PROPERTY'
  | 'REIT'
  | 'PRIVATE_EQUITY'
  | 'PHYSICAL_GOLD'
  | 'GOLD_ETC'
  | 'SILVER_ETC'
  | 'OIL_ETC'
  | 'NATURAL_GAS_ETC'
  | 'COPPER_ETC'
  | 'PLATINUM_ETC'
  | 'PALLADIUM_ETC'
  | 'AGRICULTURAL_ETC'
  | 'COMMODITY_ETF'
  | 'CAR'
  | 'MOTORCYCLE'
  | 'BOAT'
  | 'OTHER_VEHICLE'
  | 'WATCH'
  | 'WINE'
  | 'JEWELRY'
  | 'SPORTS_MEMORABILIA'
  | 'OTHER_COLLECTIBLE'
  | 'PAINTING'
  | 'SCULPTURE'
  | 'DIGITAL_ART'
  | 'OTHER_ART'
  | 'NONE';

export interface Asset {
  id: string;
  name: string;
  ticker: string;
  isin?: string; // ISIN code (required for ETF, SINGLE_STOCK, SINGLE_BOND, REIT, MONEY_ETF)
  assetClass: AssetClass;
  subAssetType: SubAssetType;
  currentValue: number; // Value in EUR (converted if entered in another currency)
  shares?: number; // Number of shares owned (optional, for stocks/ETFs/bonds)
  pricePerShare?: number; // Price per share (optional, for stocks/ETFs/bonds)
  acquisitionPrice?: number; // Price per share at which the asset was acquired (editable)
  originalCurrency?: SupportedCurrency; // The currency the value was originally entered in (defaults to EUR)
  originalValue?: number; // The original value before conversion to EUR
  targetMode: AllocationMode;
  targetValue?: number; // For SET mode (fixed amount in EUR)
  targetPercent?: number; // For PERCENTAGE mode
  institutionCode?: string; // Bank/broker code (for SAVINGS_ACCOUNT, CHECKING_ACCOUNT, BROKERAGE_ACCOUNT)
  institutionName?: string; // Custom bank/broker name (when code is 'OTHER' or not using predefined list)
  mortgageData?: MortgageData; // Mortgage information for real estate properties
  isPrimaryResidence?: boolean; // If true, real estate property is excluded from FIRE calculation
  marketPrice?: number; // Current market price per share (fetched from API)
}

export interface AssetClassSummary {
  assetClass: AssetClass;
  assets: Asset[];
  currentTotal: number;
  currentPercent: number;
  targetMode: AllocationMode;
  targetPercent?: number;
  targetTotal?: number;
  delta: number;
  action: AllocationAction;
}

export type AllocationAction = 'BUY' | 'SELL' | 'SAVE' | 'INVEST' | 'HOLD' | 'EXCLUDED';

export interface AllocationDelta {
  assetId: string;
  currentValue: number;
  currentPercent: number;
  currentPercentInClass: number;
  targetValue: number;
  targetPercent: number;
  delta: number;
  deltaPercent: number;
  action: AllocationAction;
}

export interface PortfolioAllocation {
  assets: Asset[];
  assetClasses: AssetClassSummary[];
  totalValue: number; // Portfolio value excluding cash (used for calculations)
  totalHoldings: number; // Total holdings including cash (for display)
  deltas: AllocationDelta[];
  isValid: boolean;
  validationErrors: string[];
}

export interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color?: string;
  ticker?: string; // Used as fallback label for long asset names in charts
  [key: string]: string | number | undefined;
}

export interface MortgageData {
  principalAmount: number; // Original loan amount
  currentBalance: number; // Current outstanding balance
  interestRate: number; // Annual interest rate (e.g., 3.5 for 3.5%)
  termYears: number; // Original term in years (e.g., 30)
  remainingYears: number; // Remaining years on mortgage
  monthlyPayment: number; // Monthly payment amount
  startDate: string; // ISO date string (YYYY-MM-DD)
  propertyValue: number; // Current property value
  lender?: string; // Name of the lending institution
}

export interface AssetAllocationConfig {
  currency: string; // Default EUR
  allowNegativeCash: boolean;
  targetAllocationTolerance: number; // e.g., 2% tolerance
}
