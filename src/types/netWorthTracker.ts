/**
 * Net Worth Tracker Types
 * Data model for tracking historical net worth on a monthly basis
 */

import { SupportedCurrency } from './currency';

// Depreciation method for vehicles
export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'MANUAL';

// Vehicle depreciation schedule
export interface VehicleDepreciation {
  method: DepreciationMethod;
  purchasePrice: number; // Original purchase price
  purchaseDate: string; // ISO date string (YYYY-MM-DD)
  salvageValue: number; // Expected value at end of useful life
  usefulLifeYears: number; // Expected useful life in years (e.g., 10)
  currentDepreciation?: number; // Current accumulated depreciation
  annualDepreciationRate?: number; // For declining balance method (e.g., 20 for 20%)
}

// Mortgage data for real estate
export interface MortgageInfo {
  principalAmount: number; // Original loan amount
  currentBalance: number; // Current outstanding balance
  interestRate: number; // Annual interest rate (e.g., 3.5 for 3.5%)
  termYears: number; // Original term in years (e.g., 30)
  remainingYears: number; // Remaining years on mortgage
  monthlyPayment: number; // Monthly payment amount
  startDate: string; // ISO date string (YYYY-MM-DD)
  lender?: string; // Name of the lending institution
}

// Debt entry (negative net worth impact)
export interface DebtEntry {
  id: string;
  name: string;
  debtType: 'CREDIT_CARD' | 'PERSONAL_LOAN' | 'STUDENT_LOAN' | 'CAR_LOAN' | 'MORTGAGE' | 'OTHER';
  currentBalance: number; // Positive number representing amount owed
  interestRate?: number; // Annual interest rate
  monthlyPayment?: number; // Monthly payment amount
  currency: SupportedCurrency;
  note?: string;
  creditor?: string; // Lender/creditor name
}

// Tax liability entry (negative net worth impact)
export interface TaxEntry {
  id: string;
  name: string;
  taxType: 'INCOME_TAX' | 'PROPERTY_TAX' | 'CAPITAL_GAINS_TAX' | 'OTHER';
  amount: number; // Positive number representing tax liability
  dueDate?: string; // ISO date string (YYYY-MM-DD)
  currency: SupportedCurrency;
  note?: string;
  isPaid: boolean;
}

// Asset entry with share count
export interface AssetHolding {
  id: string;
  ticker: string;
  name: string;
  shares: number; // Number of shares owned
  pricePerShare: number; // Current market price per share (closing price for the month)
  acquisitionPrice?: number; // Price per share at which the asset was acquired (editable)
  currency: SupportedCurrency;
  assetClass: 'STOCKS' | 'BONDS' | 'ETF' | 'CRYPTO' | 'REAL_ESTATE' | 'PRIVATE_EQUITY' | 'VEHICLE' | 'COLLECTIBLE' | 'ART' | 'COMMODITIES' | 'OTHER';
  note?: string;
  // Vehicle-specific data
  vehicleDepreciation?: VehicleDepreciation;
  // Real estate-specific data
  mortgageInfo?: MortgageInfo;
  // Sync metadata (hidden from UI, preserved during sync)
  targetMode?: 'PERCENTAGE' | 'OFF' | 'SET';
  targetPercent?: number;
  targetValue?: number;
  syncAssetClass?: 'STOCKS' | 'BONDS' | 'CASH' | 'CRYPTO' | 'REAL_ESTATE' | 'COMMODITIES' | 'VEHICLE' | 'COLLECTIBLE' | 'ART';
  syncSubAssetType?: string;
  isin?: string;
  isPrimaryResidence?: boolean; // If true, real estate property is excluded from FIRE calculation
}

// Cash/liquidity entry
export interface CashEntry {
  id: string;
  accountName: string;
  accountType: 'SAVINGS' | 'CHECKING' | 'BROKERAGE' | 'CREDIT_CARD' | 'OTHER';
  balance: number;
  currency: SupportedCurrency;
  note?: string;
  // Bank/Institution info (same as Asset Allocation)
  institutionCode?: string;
  institutionName?: string;
  // Sync metadata (hidden from UI, preserved during sync)
  shares?: number; // For cash treated as "1 share @ balance per share"
  pricePerShare?: number;
  targetMode?: 'PERCENTAGE' | 'OFF' | 'SET';
  targetPercent?: number;
  targetValue?: number;
  syncSubAssetType?: string;
}

// Pension entry
export interface PensionEntry {
  id: string;
  name: string;
  currentValue: number;
  currency: SupportedCurrency;
  pensionType: 'STATE' | 'PRIVATE' | 'EMPLOYER' | 'OTHER';
  note?: string;
}

// Financial operation types
export type OperationType = 
  | 'PURCHASE' // Stock/bond/ETF purchase
  | 'SALE' // Asset sale
  | 'DIVIDEND' // Dividend received
  | 'EXPENSE_REIMBURSEMENT' // Expenses reimbursed
  | 'GIFT_RECEIVED' // Gift received
  | 'GIFT_GIVEN' // Gift given
  | 'TAX_PAID' // Taxes paid
  | 'CASH_TRANSFER' // Cash transfer between accounts
  | 'PENSION_CONTRIBUTION' // Contribution to pension
  | 'PENSION_ADJUSTMENT' // Pension value adjustment
  | 'PRICE_UPDATE' // Asset price update
  | 'OTHER';

// Financial operation entry
export interface FinancialOperation {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  type: OperationType;
  description: string;
  amount: number;
  currency: SupportedCurrency;
  relatedAssetId?: string; // Link to asset if applicable
  relatedAccountId?: string; // Link to cash account if applicable
  note?: string;
}

// Monthly snapshot of net worth
export interface MonthlySnapshot {
  year: number;
  month: number; // 1-12
  
  // Manual inputs
  assets: AssetHolding[];
  cashEntries: CashEntry[];
  pensions: PensionEntry[];
  operations: FinancialOperation[];
  debts: DebtEntry[];
  taxes: TaxEntry[];
  
  // Calculated values (computed at display time)
  totalAssetValue?: number; // Sum of (shares * pricePerShare) for all assets
  totalCash?: number; // Sum of all cash balances
  totalPension?: number; // Sum of all pension values
  totalTaxesPaid?: number; // Sum of TAX_PAID operations
  totalDebt?: number; // Sum of all debt balances
  totalTaxLiability?: number; // Sum of unpaid taxes
  netWorth?: number; // totalAssetValue + totalCash + totalPension - totalDebt - totalTaxLiability
  
  // Status
  isFrozen: boolean; // True if month has ended and values are finalized
  frozenDate?: string; // ISO date when month was frozen
  
  // Notes
  monthNote?: string;
}

// Year data container
export interface NetWorthYearData {
  year: number;
  months: MonthlySnapshot[];
  isArchived?: boolean;
}

// YTD summary
export interface YTDSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  savingsRate: number;
  averageMonthlyNetWorth: number;
  netWorthChange: number;
  netWorthChangePercent: number;
}

// Month-over-month variation
export interface MonthlyVariation {
  month: string;
  netWorth: number;
  changeFromPrevMonth: number;
  changePercent: number;
  assetValueChange: number;
  cashChange: number;
  pensionChange: number;
  debtChange: number;
  taxLiabilityChange: number;
}

// Forecast data
export interface NetWorthForecast {
  month: string;
  projectedNetWorth: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  basedOnMonths: number; // Number of months used for projection
}

// Chart data for multi-currency display
export interface NetWorthChartData {
  month: string;
  netWorth: number;
  currency: SupportedCurrency;
}

// FIRE progress calculation
export interface FIREProgress {
  currentNetWorth: number;
  fireTarget: number;
  percentToFire: number;
  projectedFireDate: string | null;
  yearsToFire: number | null;
}

// Main net worth tracker state
export interface NetWorthTrackerData {
  years: NetWorthYearData[];
  currentYear: number;
  currentMonth: number;
  defaultCurrency: SupportedCurrency;
  // Settings
  settings: {
    showPensionInNetWorth: boolean;
    includeUnrealizedGains: boolean;
    syncWithAssetAllocation?: boolean; // When true, sync current month with Asset Allocation Manager
  };
}

// Helper functions

/**
 * Generate unique ID for entries
 */
export function generateNetWorthId(): string {
  return `nw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create empty monthly snapshot
 */
export function createEmptyMonthlySnapshot(year: number, month: number): MonthlySnapshot {
  return {
    year,
    month,
    assets: [],
    cashEntries: [],
    pensions: [],
    operations: [],
    debts: [],
    taxes: [],
    isFrozen: false,
  };
}

/**
 * Create empty year data
 */
export function createEmptyNetWorthYearData(year: number): NetWorthYearData {
  return {
    year,
    months: [],
    isArchived: false,
  };
}

/**
 * Get month key for storage/lookup
 */
export function getNetWorthMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Operation type display info
export interface OperationTypeInfo {
  id: OperationType;
  name: string;
  icon: string;
  isIncome: boolean; // True if operation adds to net worth
}

export const OPERATION_TYPES: OperationTypeInfo[] = [
  { id: 'PURCHASE', name: 'Asset Purchase', icon: 'trending_up', isIncome: false },
  { id: 'SALE', name: 'Asset Sale', icon: 'trending_down', isIncome: true },
  { id: 'DIVIDEND', name: 'Dividend Received', icon: 'payments', isIncome: true },
  { id: 'EXPENSE_REIMBURSEMENT', name: 'Expense Reimbursement', icon: 'credit_card', isIncome: true },
  { id: 'GIFT_RECEIVED', name: 'Gift Received', icon: 'redeem', isIncome: true },
  { id: 'GIFT_GIVEN', name: 'Gift Given', icon: 'card_giftcard', isIncome: false },
  { id: 'TAX_PAID', name: 'Tax Paid', icon: 'account_balance', isIncome: false },
  { id: 'CASH_TRANSFER', name: 'Cash Transfer', icon: 'sync', isIncome: false },
  { id: 'PENSION_CONTRIBUTION', name: 'Pension Contribution', icon: 'elderly', isIncome: false },
  { id: 'PENSION_ADJUSTMENT', name: 'Pension Adjustment', icon: 'bar_chart', isIncome: false },
  { id: 'PRICE_UPDATE', name: 'Price Update', icon: 'currency_exchange', isIncome: false },
  { id: 'OTHER', name: 'Other', icon: 'edit_note', isIncome: false },
];

/**
 * Get operation type info
 */
export function getOperationTypeInfo(type: OperationType): OperationTypeInfo {
  return OPERATION_TYPES.find(t => t.id === type) || OPERATION_TYPES[OPERATION_TYPES.length - 1];
}

// Asset class display info
export interface AssetClassInfo {
  id: AssetHolding['assetClass'];
  name: string;
  icon: string;
}

export const ASSET_CLASSES: AssetClassInfo[] = [
  { id: 'STOCKS', name: 'Stocks', icon: 'bar_chart' },
  { id: 'BONDS', name: 'Bonds', icon: 'description' },
  { id: 'ETF', name: 'ETF', icon: 'trending_up' },
  { id: 'CRYPTO', name: 'Crypto', icon: 'currency_bitcoin' },
  { id: 'REAL_ESTATE', name: 'Real Estate', icon: 'home' },
  { id: 'PRIVATE_EQUITY', name: 'Private Equity', icon: 'business_center' },
  { id: 'VEHICLE', name: 'Vehicle', icon: 'directions_car' },
  { id: 'COLLECTIBLE', name: 'Collectible', icon: 'collections' },
  { id: 'ART', name: 'Art', icon: 'palette' },
  { id: 'COMMODITIES', name: 'Commodities', icon: 'grain' },
  { id: 'OTHER', name: 'Other', icon: 'inventory_2' },
];

// Account type display info
export interface AccountTypeInfo {
  id: CashEntry['accountType'];
  name: string;
  icon: string;
}

export const ACCOUNT_TYPES: AccountTypeInfo[] = [
  { id: 'SAVINGS', name: 'Savings Account', icon: 'savings' },
  { id: 'CHECKING', name: 'Checking Account', icon: 'credit_card' },
  { id: 'BROKERAGE', name: 'Brokerage Account', icon: 'trending_up' },
  { id: 'CREDIT_CARD', name: 'Credit Card', icon: 'credit_card' },
  { id: 'OTHER', name: 'Other', icon: 'attach_money' },
];

// Pension type display info
export interface PensionTypeInfo {
  id: PensionEntry['pensionType'];
  name: string;
  icon: string;
}

export const PENSION_TYPES: PensionTypeInfo[] = [
  { id: 'STATE', name: 'State Pension', icon: 'account_balance' },
  { id: 'PRIVATE', name: 'Private Pension', icon: 'savings' },
  { id: 'EMPLOYER', name: 'Employer Pension', icon: 'business' },
  { id: 'OTHER', name: 'Other Pension', icon: 'elderly' },
];

// Debt type display info
export interface DebtTypeInfo {
  id: DebtEntry['debtType'];
  name: string;
  icon: string;
}

export const DEBT_TYPES: DebtTypeInfo[] = [
  { id: 'CREDIT_CARD', name: 'Credit Card', icon: 'credit_card' },
  { id: 'PERSONAL_LOAN', name: 'Personal Loan', icon: 'account_balance_wallet' },
  { id: 'STUDENT_LOAN', name: 'Student Loan', icon: 'school' },
  { id: 'CAR_LOAN', name: 'Car Loan', icon: 'directions_car' },
  { id: 'MORTGAGE', name: 'Mortgage', icon: 'home' },
  { id: 'OTHER', name: 'Other Debt', icon: 'money_off' },
];

// Tax type display info
export interface TaxTypeInfo {
  id: TaxEntry['taxType'];
  name: string;
  icon: string;
}

export const TAX_TYPES: TaxTypeInfo[] = [
  { id: 'INCOME_TAX', name: 'Income Tax', icon: 'attach_money' },
  { id: 'PROPERTY_TAX', name: 'Property Tax', icon: 'home' },
  { id: 'CAPITAL_GAINS_TAX', name: 'Capital Gains Tax', icon: 'trending_up' },
  { id: 'OTHER', name: 'Other Tax', icon: 'account_balance' },
];
