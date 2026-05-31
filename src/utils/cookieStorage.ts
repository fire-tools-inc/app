/**
 * Cookie Storage utilities for persisting application data
 * Handles Asset Allocation and FIRE Calculator data with encryption
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { Asset, AssetClass, AllocationMode } from '../types/assetAllocation';
import { CalculatorInputs } from '../types/calculator';
import { ExpenseTrackerData, YearData, MonthData, IncomeEntry, ExpenseEntry } from '../types/expenseTracker';
import { NetWorthTrackerData, NetWorthYearData, MonthlySnapshot, AssetHolding, CashEntry, PensionEntry, FinancialOperation } from '../types/netWorthTracker';
import { DEFAULT_INPUTS } from './defaults';
import { encryptData, decryptData } from './cookieEncryption';
import {
  IS_DEMO_MODE,
  getDemoAssetAllocation,
  getDemoCalculatorInputs,
  getDemoExpenseTracker,
  getDemoNetWorthTracker,
} from './demoMode';
import { logger } from './logger';

// Cookie keys
const ASSET_ALLOCATION_KEY = 'fire-calculator-asset-allocation';
const ASSET_CLASS_TARGETS_KEY = 'fire-calculator-asset-class-targets';
const FIRE_CALCULATOR_INPUTS_KEY = 'fire-calculator-inputs';
const EXPENSE_TRACKER_KEY = 'fire-tools-expense-tracker';
const NET_WORTH_TRACKER_KEY = 'fire-tools-net-worth-tracker';

// Cookie options - secure settings for production
const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: window.location.protocol === 'https:', // Only secure in HTTPS
  path: '/',
};

// Data validation helpers
function isValidAsset(obj: any): obj is Asset {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.ticker === 'string' &&
    typeof obj.assetClass === 'string' &&
    typeof obj.subAssetType === 'string' &&
    typeof obj.currentValue === 'number' &&
    typeof obj.targetMode === 'string'
  );
}

function isValidCalculatorInputs(obj: any): obj is CalculatorInputs {
  return (
    typeof obj === 'object' &&
    typeof obj.initialSavings === 'number' &&
    typeof obj.stocksPercent === 'number' &&
    typeof obj.bondsPercent === 'number' &&
    typeof obj.cashPercent === 'number' &&
    typeof obj.currentAnnualExpenses === 'number' &&
    typeof obj.fireAnnualExpenses === 'number' &&
    typeof obj.annualLaborIncome === 'number' &&
    typeof obj.laborIncomeGrowthRate === 'number' &&
    typeof obj.savingsRate === 'number' &&
    typeof obj.desiredWithdrawalRate === 'number' &&
    typeof obj.expectedStockReturn === 'number' &&
    typeof obj.expectedBondReturn === 'number' &&
    typeof obj.expectedCashReturn === 'number' &&
    typeof obj.yearOfBirth === 'number' &&
    typeof obj.retirementAge === 'number' &&
    typeof obj.statePensionIncome === 'number' &&
    typeof obj.privatePensionIncome === 'number' &&
    typeof obj.otherIncome === 'number' &&
    typeof obj.stopWorkingAtFIRE === 'boolean'
  );
}

/**
 * Save Asset Allocation data to encrypted cookies
 */
export function saveAssetAllocation(
  assets: Asset[],
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>
): void {
  if (IS_DEMO_MODE) return;
  try {
    const assetsJson = JSON.stringify(assets);
    const targetsJson = JSON.stringify(assetClassTargets);
    
    const encryptedAssets = encryptData(assetsJson);
    const encryptedTargets = encryptData(targetsJson);
    
    SafeCookies.set(ASSET_ALLOCATION_KEY, encryptedAssets, COOKIE_OPTIONS);
    SafeCookies.set(ASSET_CLASS_TARGETS_KEY, encryptedTargets, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('cookie-storage', 'save-failed', 'failed to save asset allocation to cookies', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save data to cookies. Cookies may be disabled.');
  }
}

/**
 * Load Asset Allocation data from encrypted cookies
 */
export function loadAssetAllocation(): {
  assets: Asset[] | null;
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> | null;
} {
  if (IS_DEMO_MODE) {
    return getDemoAssetAllocation();
  }
  try {
    const encryptedAssets = SafeCookies.get(ASSET_ALLOCATION_KEY);
    const encryptedTargets = SafeCookies.get(ASSET_CLASS_TARGETS_KEY);

    let assets: Asset[] | null = null;
    let assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> | null = null;

    if (encryptedAssets) {
      const decryptedAssets = decryptData(encryptedAssets);
      if (decryptedAssets) {
        const parsedAssets = JSON.parse(decryptedAssets);
        if (Array.isArray(parsedAssets) && parsedAssets.every(isValidAsset)) {
          assets = parsedAssets;
          // Migration: backfill acquisitionPrice for assets that don't have it
          for (const asset of assets) {
            if (asset.acquisitionPrice === undefined && asset.pricePerShare !== undefined) {
              asset.acquisitionPrice = asset.pricePerShare;
            }
          }
        }
      }
    }

    if (encryptedTargets) {
      const decryptedTargets = decryptData(encryptedTargets);
      if (decryptedTargets) {
        const parsedTargets = JSON.parse(decryptedTargets);
        if (typeof parsedTargets === 'object') {
          assetClassTargets = parsedTargets;
        }
      }
    }

    return { assets, assetClassTargets };
  } catch (error) {
    logger.error('cookie-storage', 'load-failed', 'failed to load asset allocation from cookies', { pii: { error: (error as Error)?.message } });
    return { assets: null, assetClassTargets: null };
  }
}

/**
 * Clear Asset Allocation data from cookies
 */
export function clearAssetAllocation(): void {
  try {
    SafeCookies.remove(ASSET_ALLOCATION_KEY, { path: '/' });
    SafeCookies.remove(ASSET_CLASS_TARGETS_KEY, { path: '/' });
  } catch (error) {
    logger.error('cookie-storage', 'clear-failed', 'failed to clear asset allocation from cookies', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Save FIRE Calculator inputs to encrypted cookies
 */
export function saveFireCalculatorInputs(inputs: CalculatorInputs): void {
  if (IS_DEMO_MODE) return;
  try {
    const inputsJson = JSON.stringify(inputs);
    const encryptedInputs = encryptData(inputsJson);
    
    SafeCookies.set(FIRE_CALCULATOR_INPUTS_KEY, encryptedInputs, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('cookie-storage', 'save-failed', 'failed to save FIRE calculator inputs to cookies', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save data to cookies. Cookies may be disabled.');
  }
}

/**
 * Load FIRE Calculator inputs from encrypted cookies
 */
export function loadFireCalculatorInputs(): CalculatorInputs | null {
  if (IS_DEMO_MODE) {
    return getDemoCalculatorInputs();
  }
  try {
    const encryptedInputs = SafeCookies.get(FIRE_CALCULATOR_INPUTS_KEY);
    if (encryptedInputs) {
      const decryptedInputs = decryptData(encryptedInputs);
      if (decryptedInputs) {
        const parsed = JSON.parse(decryptedInputs);
        if (isValidCalculatorInputs(parsed)) {
          // Merge with defaults to ensure all fields exist
          return { ...DEFAULT_INPUTS, ...parsed };
        }
      }
    }
    return null;
  } catch (error) {
    logger.error('cookie-storage', 'load-failed', 'failed to load FIRE calculator inputs from cookies', { pii: { error: (error as Error)?.message } });
    return null;
  }
}

/**
 * Clear FIRE Calculator inputs from cookies
 */
export function clearFireCalculatorInputs(): void {
  try {
    SafeCookies.remove(FIRE_CALCULATOR_INPUTS_KEY, { path: '/' });
  } catch (error) {
    logger.error('cookie-storage', 'clear-failed', 'failed to clear FIRE calculator inputs from cookies', { pii: { error: (error as Error)?.message } });
  }
}

// Data validation helpers for expense tracker
function isValidIncomeEntry(obj: any): obj is IncomeEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.type === 'income' &&
    typeof obj.date === 'string' &&
    typeof obj.amount === 'number' &&
    typeof obj.description === 'string' &&
    typeof obj.source === 'string'
  );
}

function isValidExpenseEntry(obj: any): obj is ExpenseEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.type === 'expense' &&
    typeof obj.date === 'string' &&
    typeof obj.amount === 'number' &&
    typeof obj.description === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.expenseType === 'string'
  );
}

function isValidMonthData(obj: any): obj is MonthData {
  return (
    typeof obj === 'object' &&
    typeof obj.year === 'number' &&
    typeof obj.month === 'number' &&
    Array.isArray(obj.incomes) &&
    Array.isArray(obj.expenses) &&
    Array.isArray(obj.budgets) &&
    obj.incomes.every(isValidIncomeEntry) &&
    obj.expenses.every(isValidExpenseEntry)
  );
}

function isValidYearData(obj: any): obj is YearData {
  return (
    typeof obj === 'object' &&
    typeof obj.year === 'number' &&
    Array.isArray(obj.months) &&
    obj.months.every(isValidMonthData)
  );
}

function isValidExpenseTrackerData(obj: any): obj is ExpenseTrackerData {
  return (
    typeof obj === 'object' &&
    Array.isArray(obj.years) &&
    typeof obj.currentYear === 'number' &&
    typeof obj.currentMonth === 'number' &&
    typeof obj.currency === 'string' &&
    obj.years.every(isValidYearData)
  );
}

/**
 * Save Expense Tracker data to encrypted localStorage
 * Note: Uses localStorage instead of cookies due to 4KB cookie size limit.
 * Expense tracker data can easily exceed this limit with realistic transaction history.
 */
export function saveExpenseTrackerData(data: ExpenseTrackerData): void {
  if (IS_DEMO_MODE) return;
  try {
    const dataJson = JSON.stringify(data);
    const encryptedData = encryptData(dataJson);
    
    localStorage.setItem(EXPENSE_TRACKER_KEY, encryptedData);
  } catch (error) {
    logger.error('cookie-storage', 'save-failed', 'failed to save expense tracker data to localStorage', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save data to localStorage. Storage may be full or disabled.');
  }
}

/**
 * Load Expense Tracker data from encrypted localStorage
 */
export function loadExpenseTrackerData(): ExpenseTrackerData | null {
  if (IS_DEMO_MODE) {
    return getDemoExpenseTracker();
  }
  try {
    // Try localStorage first
    let encryptedData = localStorage.getItem(EXPENSE_TRACKER_KEY);
    
    // Migration: If not in localStorage, try to load from cookie and migrate
    if (!encryptedData) {
      const cookieData = SafeCookies.get(EXPENSE_TRACKER_KEY);
      if (cookieData) {
        logger.systemEvent('cookie-storage', 'migrate', 'migrating expense tracker data from cookies to localStorage');
        // Save to localStorage
        localStorage.setItem(EXPENSE_TRACKER_KEY, cookieData);
        // Remove from cookie
        SafeCookies.remove(EXPENSE_TRACKER_KEY, { path: '/' });
        encryptedData = cookieData;
      }
    }
    
    if (encryptedData) {
      const decryptedData = decryptData(encryptedData);
      if (decryptedData) {
        const parsed = JSON.parse(decryptedData);
        if (isValidExpenseTrackerData(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  } catch (error) {
    logger.error('cookie-storage', 'load-failed', 'failed to load expense tracker data from localStorage', { pii: { error: (error as Error)?.message } });
    return null;
  }
}

/**
 * Clear Expense Tracker data from localStorage
 */
export function clearExpenseTrackerData(): void {
  try {
    localStorage.removeItem(EXPENSE_TRACKER_KEY);
  } catch (error) {
    logger.error('cookie-storage', 'clear-failed', 'failed to clear expense tracker data from localStorage', { pii: { error: (error as Error)?.message } });
  }
}

// Data validation helpers for net worth tracker
function isValidAssetHolding(obj: unknown): obj is AssetHolding {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.ticker === 'string' &&
    typeof o.name === 'string' &&
    typeof o.shares === 'number' &&
    typeof o.pricePerShare === 'number' &&
    typeof o.currency === 'string' &&
    typeof o.assetClass === 'string'
  );
}

function isValidCashEntry(obj: unknown): obj is CashEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.accountName === 'string' &&
    typeof o.accountType === 'string' &&
    typeof o.balance === 'number' &&
    typeof o.currency === 'string'
  );
}

function isValidPensionEntry(obj: unknown): obj is PensionEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.currentValue === 'number' &&
    typeof o.currency === 'string' &&
    typeof o.pensionType === 'string'
  );
}

function isValidFinancialOperation(obj: unknown): obj is FinancialOperation {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.type === 'string' &&
    typeof o.description === 'string' &&
    typeof o.amount === 'number' &&
    typeof o.currency === 'string'
  );
}

function isValidMonthlySnapshot(obj: unknown): obj is MonthlySnapshot {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.year === 'number' &&
    typeof o.month === 'number' &&
    Array.isArray(o.assets) &&
    Array.isArray(o.cashEntries) &&
    Array.isArray(o.pensions) &&
    Array.isArray(o.operations) &&
    typeof o.isFrozen === 'boolean' &&
    (o.assets as unknown[]).every(isValidAssetHolding) &&
    (o.cashEntries as unknown[]).every(isValidCashEntry) &&
    (o.pensions as unknown[]).every(isValidPensionEntry) &&
    (o.operations as unknown[]).every(isValidFinancialOperation)
  );
}

function isValidNetWorthYearData(obj: unknown): obj is NetWorthYearData {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.year === 'number' &&
    Array.isArray(o.months) &&
    (o.months as unknown[]).every(isValidMonthlySnapshot)
  );
}

function isValidNetWorthTrackerData(obj: unknown): obj is NetWorthTrackerData {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    Array.isArray(o.years) &&
    typeof o.currentYear === 'number' &&
    typeof o.currentMonth === 'number' &&
    typeof o.defaultCurrency === 'string' &&
    (o.years as unknown[]).every(isValidNetWorthYearData)
  );
}

/**
 * Save Net Worth Tracker data to encrypted localStorage
 * Note: Uses localStorage instead of cookies due to 4KB cookie size limit.
 * Net worth tracker data can easily exceed this limit with realistic asset history.
 */
export function saveNetWorthTrackerData(data: NetWorthTrackerData): void {
  if (IS_DEMO_MODE) return;
  try {
    const dataJson = JSON.stringify(data);
    const encryptedData = encryptData(dataJson);
    
    localStorage.setItem(NET_WORTH_TRACKER_KEY, encryptedData);
  } catch (error) {
    logger.error('cookie-storage', 'save-failed', 'failed to save net worth tracker data to localStorage', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save data to localStorage. Storage may be full or disabled.');
  }
}

/**
 * Migration: backfill acquisitionPrice for assets that don't have it.
 * Sets acquisitionPrice = pricePerShare for existing data where acquisitionPrice is missing.
 */
function migrateAcquisitionPrice(data: NetWorthTrackerData): void {
  for (const yearData of data.years) {
    for (const monthData of yearData.months) {
      for (const asset of monthData.assets) {
        if (asset.acquisitionPrice === undefined) {
          asset.acquisitionPrice = asset.pricePerShare;
        }
      }
    }
  }
}

/**
 * Load Net Worth Tracker data from encrypted localStorage
 */
export function loadNetWorthTrackerData(): NetWorthTrackerData | null {
  if (IS_DEMO_MODE) {
    return getDemoNetWorthTracker();
  }
  try {
    // Try localStorage first
    let encryptedData = localStorage.getItem(NET_WORTH_TRACKER_KEY);
    
    // Migration: If not in localStorage, try to load from cookie and migrate
    if (!encryptedData) {
      const cookieData = SafeCookies.get(NET_WORTH_TRACKER_KEY);
      if (cookieData) {
        logger.systemEvent('cookie-storage', 'migrate', 'migrating net worth tracker data from cookies to localStorage');
        // Save to localStorage
        localStorage.setItem(NET_WORTH_TRACKER_KEY, cookieData);
        // Remove from cookie
        SafeCookies.remove(NET_WORTH_TRACKER_KEY, { path: '/' });
        encryptedData = cookieData;
      }
    }
    
    if (encryptedData) {
      const decryptedData = decryptData(encryptedData);
      if (decryptedData) {
        const parsed = JSON.parse(decryptedData);
        if (isValidNetWorthTrackerData(parsed)) {
          // Migration: backfill acquisitionPrice for assets that don't have it
          migrateAcquisitionPrice(parsed);
          return parsed;
        }
      }
    }
    return null;
  } catch (error) {
    logger.error('cookie-storage', 'load-failed', 'failed to load net worth tracker data from localStorage', { pii: { error: (error as Error)?.message } });
    return null;
  }
}

/**
 * Clear Net Worth Tracker data from localStorage
 */
export function clearNetWorthTrackerData(): void {
  try {
    localStorage.removeItem(NET_WORTH_TRACKER_KEY);
    // Also remove from cookies in case there's legacy data
    SafeCookies.remove(NET_WORTH_TRACKER_KEY, { path: '/' });
  } catch (error) {
    logger.error('cookie-storage', 'clear-failed', 'failed to clear net worth tracker data from localStorage', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Clear all FIRE Calculator data from cookies and localStorage
 * This includes Asset Allocation, FIRE Calculator inputs, and Expense Tracker data
 */
export function clearAllData(): void {
  clearAssetAllocation();
  clearFireCalculatorInputs();
  clearExpenseTrackerData();
  clearNetWorthTrackerData();
}

/**
 * Check if cookie storage is available and working
 * Note: Expense Tracker uses localStorage instead due to size limits.
 * localStorage availability is checked implicitly via try-catch in save/load functions.
 */
export function isCookieStorageAvailable(): boolean {
  try {
    const testKey = '__test__';
    const testValue = 'test';
    SafeCookies.set(testKey, testValue);
    const retrieved = SafeCookies.get(testKey);
    SafeCookies.remove(testKey);
    return retrieved === testValue;
  } catch {
    return false;
  }
}
