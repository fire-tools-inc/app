/**
 * Data Export/Import Utilities
 * Handles exporting and importing all application data as JSON or ZIP
 */

import { CalculatorInputs } from '../types/calculator';
import { Asset, AssetClass, AllocationMode } from '../types/assetAllocation';
import { ExpenseTrackerData } from '../types/expenseTracker';
import { NetWorthTrackerData } from '../types/netWorthTracker';
import { SupportedCurrency, ExchangeRates, DEFAULT_FALLBACK_RATES } from '../types/currency';
import {
  convertFireCalculatorInputsToNewCurrency,
  convertAssetsToNewCurrency,
  convertExpenseDataToNewCurrency,
  convertNetWorthDataToNewCurrency,
} from './currencyConverter';
import { validateExpenseTrackerPlanning } from './expensePlanning';

/**
 * Interface for the complete data export
 */
export interface AllDataExport {
  exportVersion: string;
  exportType: 'FireToolsAllData';
  exportDate: string;
  originalCurrency: SupportedCurrency;
  fireCalculator: CalculatorInputs | null;
  assetAllocation: {
    assets: Asset[] | null;
    assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> | null;
  };
  expenseTracker: ExpenseTrackerData | null;
  netWorthTracker: NetWorthTrackerData | null;
}

/**
 * Interface for imported data
 */
export interface ImportedData {
  fireCalculator: CalculatorInputs | null;
  assetAllocation: {
    assets: Asset[] | null;
    assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> | null;
  };
  expenseTracker: ExpenseTrackerData | null;
  netWorthTracker: NetWorthTrackerData | null;
}

/**
 * Export all application data as a JSON object
 * @param fireCalculator - FIRE calculator inputs
 * @param assets - Asset allocation assets
 * @param assetClassTargets - Asset class targets
 * @param expenseTracker - Expense tracker data
 * @param netWorthTracker - Net worth tracker data
 * @param currency - The currency the data is stored in (defaults to EUR)
 * @returns AllDataExport object ready for JSON serialization
 */
export function exportAllDataAsJSON(
  fireCalculator: CalculatorInputs | null,
  assets: Asset[] | null,
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> | null,
  expenseTracker: ExpenseTrackerData | null,
  netWorthTracker: NetWorthTrackerData | null,
  currency: SupportedCurrency = 'EUR'
): AllDataExport {
  return {
    exportVersion: '1.0',
    exportType: 'FireToolsAllData',
    exportDate: new Date().toISOString(),
    originalCurrency: currency,
    fireCalculator: fireCalculator || null,
    assetAllocation: {
      assets: assets || null,
      assetClassTargets: assetClassTargets || null,
    },
    expenseTracker: expenseTracker || null,
    netWorthTracker: netWorthTracker || null,
  };
}

/**
 * Validate that the parsed JSON is a valid AllDataExport
 */
function isValidAllDataExport(obj: unknown): obj is AllDataExport {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const data = obj as Record<string, unknown>;
  return (
    data.exportType === 'FireToolsAllData' &&
    typeof data.exportVersion === 'string' &&
    typeof data.exportDate === 'string' &&
    typeof data.originalCurrency === 'string'
  );
}

/**
 * Import all application data from a JSON string
 * @param jsonString - The JSON string to parse
 * @param targetCurrency - The currency to convert values to
 * @param rates - Exchange rates for currency conversion
 * @returns ImportedData object with all data converted to target currency
 * @throws Error if JSON is invalid or doesn't match expected format
 */
export function importAllDataFromJSON(
  jsonString: string,
  targetCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): ImportedData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (!isValidAllDataExport(parsed)) {
    throw new Error('Invalid export format: missing required fields or invalid exportType');
  }

  const exportData = parsed as AllDataExport;
  const sourceCurrency = exportData.originalCurrency;

  // Convert all data to target currency
  let fireCalculator = exportData.fireCalculator;
  if (fireCalculator && sourceCurrency !== targetCurrency) {
    fireCalculator = convertFireCalculatorInputsToNewCurrency(
      fireCalculator,
      sourceCurrency,
      targetCurrency,
      rates
    );
  }

  let assets = exportData.assetAllocation.assets;
  if (assets && sourceCurrency !== targetCurrency) {
    assets = convertAssetsToNewCurrency(assets, sourceCurrency, targetCurrency, rates);
  }

  let expenseTracker = exportData.expenseTracker;
  if (expenseTracker) validateExpenseTrackerPlanning(expenseTracker);
  if (expenseTracker && sourceCurrency !== targetCurrency) {
    expenseTracker = convertExpenseDataToNewCurrency(
      expenseTracker,
      sourceCurrency,
      targetCurrency,
      rates
    );
  }
  if (expenseTracker) validateExpenseTrackerPlanning(expenseTracker);

  let netWorthTracker = exportData.netWorthTracker;
  if (netWorthTracker && sourceCurrency !== targetCurrency) {
    netWorthTracker = convertNetWorthDataToNewCurrency(
      netWorthTracker,
      sourceCurrency,
      targetCurrency,
      rates
    );
  }

  return {
    fireCalculator,
    assetAllocation: {
      assets,
      assetClassTargets: exportData.assetAllocation.assetClassTargets,
    },
    expenseTracker,
    netWorthTracker,
  };
}

/**
 * Serialize all data export to JSON string
 * @param exportData - The AllDataExport object
 * @returns JSON string
 */
export function serializeAllDataExport(exportData: AllDataExport): string {
  return JSON.stringify(exportData, null, 2);
}

/**
 * Create a downloadable blob from the export data
 * @param exportData - The AllDataExport object
 * @returns Blob ready for download
 */
export function createJSONExportBlob(exportData: AllDataExport): Blob {
  const jsonString = serializeAllDataExport(exportData);
  return new Blob([jsonString], { type: 'application/json' });
}

/**
 * Trigger download of a file
 * @param content - The file content
 * @param filename - The filename for the download
 * @param mimeType - The MIME type of the file
 */
export function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get a date string for use in filenames
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateString(): string {
  return new Date().toISOString().split('T')[0];
}
