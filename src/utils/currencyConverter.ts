/**
 * Currency Converter Utilities
 * Handles currency conversion to/from EUR (the default currency)
 */

import {
  SupportedCurrency,
  ExchangeRates,
  DEFAULT_FALLBACK_RATES,
  SUPPORTED_CURRENCIES,
} from '../types/currency';
import { Asset } from '../types/assetAllocation';
import { NetWorthTrackerData, AssetHolding, CashEntry, PensionEntry, FinancialOperation, MonthlyVariation, NetWorthForecast } from '../types/netWorthTracker';
import { ExpenseTrackerData, IncomeEntry, ExpenseEntry } from '../types/expenseTracker';
import { CalculatorInputs } from '../types/calculator';
import { logger } from './logger';

/**
 * Convert an amount from a given currency to EUR
 * @param amount - The amount to convert
 * @param fromCurrency - The source currency
 * @param rates - Optional custom exchange rates (defaults to fallback rates)
 * @returns The converted amount in EUR
 */
export function convertToEUR(
  amount: number,
  fromCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): number {
  if (fromCurrency === 'EUR') {
    return amount;
  }
  
  // First try custom rates, then fallback to defaults
  const rate = rates[fromCurrency] ?? DEFAULT_FALLBACK_RATES[fromCurrency];
  if (rate === undefined || rate <= 0) {
    // This should never happen for SupportedCurrency types, but handle gracefully
    logger.error('currency-converter', 'invalid-rate', 'invalid exchange rate, using 1:1 conversion as fallback', { pii: { currency: fromCurrency } });
    return amount;
  }
  
  return amount * rate;
}

/**
 * Convert an amount from EUR to a given currency
 * @param amount - The amount in EUR to convert
 * @param toCurrency - The target currency
 * @param rates - Optional custom exchange rates (defaults to fallback rates)
 * @returns The converted amount in the target currency
 */
export function convertFromEUR(
  amount: number,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): number {
  if (toCurrency === 'EUR') {
    return amount;
  }
  
  const rate = rates[toCurrency] ?? DEFAULT_FALLBACK_RATES[toCurrency];
  if (rate === undefined || rate === 0) {
    logger.warn('currency-converter', 'missing-rate', 'exchange rate not found, returning original amount', { pii: { currency: toCurrency } });
    return amount;
  }
  
  return amount / rate;
}

/**
 * Get the symbol for a currency
 * @param currency - The currency code
 * @returns The currency symbol
 */
export function getCurrencySymbol(currency: SupportedCurrency): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency);
  return currencyInfo?.symbol ?? currency;
}

/**
 * Format a currency value with proper symbol and formatting
 * @param value - The numeric value to format
 * @param currency - The currency code
 * @param decimalSeparator - The decimal separator to use ('.' or ',')
 * @returns The formatted currency string
 */
export function formatCurrencyValue(
  value: number,
  currency: SupportedCurrency,
  decimalSeparator: '.' | ',' = '.'
): string {
  const symbol = getCurrencySymbol(currency);
  const absValue = Math.abs(value);
  const isNegative = value < 0;
  
  // Round to 2 decimal places
  const rounded = Math.round(absValue * 100) / 100;
  
  let formatted: string;
  if (decimalSeparator === ',') {
    // European format: 1.234,56
    formatted = rounded.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else {
    // US format: 1,234.56
    formatted = rounded.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Check if a string is a valid supported currency code
 * @param currency - The string to check
 * @returns True if the string is a valid currency code
 */
export function isValidCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.some(c => c.code === currency);
}

/**
 * Get exchange rate between two currencies
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param rates - Optional custom exchange rates
 * @returns The exchange rate
 */
export function getExchangeRate(
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): number {
  if (fromCurrency === toCurrency) {
    return 1;
  }
  
  // Convert via EUR
  const fromRate = rates[fromCurrency] ?? DEFAULT_FALLBACK_RATES[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? DEFAULT_FALLBACK_RATES[toCurrency] ?? 1;
  
  // fromCurrency -> EUR -> toCurrency
  // (1 fromCurrency) * fromRate = X EUR
  // X EUR / toRate = Y toCurrency
  return fromRate / toRate;
}

/**
 * Convert an amount from one currency to another
 * @param amount - The amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param rates - Exchange rates (rates are relative to the base currency in the rates object)
 * @returns The converted amount
 */
export function convertAmount(
  amount: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }
  
  const rate = getExchangeRate(fromCurrency, toCurrency, rates);
  return amount * rate;
}

/**
 * Recalculate fallback rates when the default currency changes
 * All rates are recalculated relative to the new default currency
 * @param currentRates - Current exchange rates
 * @param fromDefaultCurrency - The previous default currency
 * @param toDefaultCurrency - The new default currency
 * @returns New exchange rates relative to the new default currency
 */
export function recalculateFallbackRates(
  currentRates: ExchangeRates,
  fromDefaultCurrency: SupportedCurrency,
  toDefaultCurrency: SupportedCurrency
): ExchangeRates {
  if (fromDefaultCurrency === toDefaultCurrency) {
    return { ...currentRates };
  }
  
  const newRates: ExchangeRates = {};
  
  // Get the conversion rate from old default to new default
  // This tells us how much 1 unit of old default is in new default
  const conversionRate = getExchangeRate(fromDefaultCurrency, toDefaultCurrency, currentRates);
  
  // For each currency, recalculate its rate relative to the new default
  SUPPORTED_CURRENCIES.forEach(currency => {
    const code = currency.code;
    if (code === toDefaultCurrency) {
      // The new default currency has a rate of 1
      newRates[code] = 1;
    } else {
      // Get how much 1 unit of this currency is in the old default
      const oldRate = currentRates[code] ?? DEFAULT_FALLBACK_RATES[code] ?? 1;
      // Convert to new default: oldRate * conversionRate
      newRates[code] = oldRate * conversionRate;
    }
  });
  
  return newRates;
}

/**
 * Convert asset values when the default currency changes
 * @param assets - Array of assets to convert
 * @param fromCurrency - The previous default currency
 * @param toCurrency - The new default currency
 * @param rates - Exchange rates (relative to fromCurrency)
 * @returns Array of assets with converted values
 */
export function convertAssetsToNewCurrency(
  assets: Asset[],
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): Asset[] {
  if (fromCurrency === toCurrency) {
    return assets;
  }
  
  return assets.map(asset => {
    // Store the pre-conversion value for originalValue fallback
    const preConversionValue = asset.currentValue;
    
    // Convert currentValue from fromCurrency to toCurrency
    const convertedValue = convertAmount(preConversionValue, fromCurrency, toCurrency, rates);
    
    // Convert targetValue if it exists (for SET mode)
    const convertedTargetValue = asset.targetValue !== undefined
      ? convertAmount(asset.targetValue, fromCurrency, toCurrency, rates)
      : undefined;
    
    return {
      ...asset,
      currentValue: convertedValue,
      targetValue: convertedTargetValue,
      // Preserve original currency info for reference - use existing or set to fromCurrency
      originalCurrency: asset.originalCurrency ?? fromCurrency,
      // Preserve original value - use existing or the pre-conversion value
      originalValue: asset.originalValue ?? preConversionValue,
    };
  });
}

/**
 * Convert Net Worth Tracker asset holding to new currency
 */
function convertNetWorthAssetHolding(
  asset: AssetHolding,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): AssetHolding {
  const convertedPrice = convertAmount(asset.pricePerShare, fromCurrency, toCurrency, rates);
  return {
    ...asset,
    pricePerShare: convertedPrice,
    currency: toCurrency,
  };
}

/**
 * Convert Net Worth Tracker cash entry to new currency
 */
function convertNetWorthCashEntry(
  cash: CashEntry,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): CashEntry {
  const convertedBalance = convertAmount(cash.balance, fromCurrency, toCurrency, rates);
  return {
    ...cash,
    balance: convertedBalance,
    currency: toCurrency,
  };
}

/**
 * Convert Net Worth Tracker pension entry to new currency
 */
function convertNetWorthPensionEntry(
  pension: PensionEntry,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): PensionEntry {
  const convertedValue = convertAmount(pension.currentValue, fromCurrency, toCurrency, rates);
  return {
    ...pension,
    currentValue: convertedValue,
    currency: toCurrency,
  };
}

/**
 * Convert Net Worth Tracker financial operation to new currency
 */
function convertNetWorthOperation(
  operation: FinancialOperation,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): FinancialOperation {
  const convertedAmount = convertAmount(operation.amount, fromCurrency, toCurrency, rates);
  return {
    ...operation,
    amount: convertedAmount,
    currency: toCurrency,
  };
}

/**
 * Convert all Net Worth Tracker data to a new currency
 * @param data - The Net Worth Tracker data to convert
 * @param fromCurrency - The previous default currency
 * @param toCurrency - The new default currency
 * @param rates - Exchange rates (relative to fromCurrency)
 * @returns Net Worth Tracker data with all values converted
 */
export function convertNetWorthDataToNewCurrency(
  data: NetWorthTrackerData,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): NetWorthTrackerData {
  if (fromCurrency === toCurrency) {
    return data;
  }

  return {
    ...data,
    defaultCurrency: toCurrency,
    years: data.years.map(year => ({
      ...year,
      months: year.months.map(month => ({
        ...month,
        assets: month.assets.map(asset => 
          convertNetWorthAssetHolding(asset, fromCurrency, toCurrency, rates)
        ),
        cashEntries: month.cashEntries.map(cash => 
          convertNetWorthCashEntry(cash, fromCurrency, toCurrency, rates)
        ),
        pensions: month.pensions.map(pension => 
          convertNetWorthPensionEntry(pension, fromCurrency, toCurrency, rates)
        ),
        operations: month.operations.map(op => 
          convertNetWorthOperation(op, fromCurrency, toCurrency, rates)
        ),
      })),
    })),
  };
}

/**
 * Convert income entry to new currency
 */
function convertIncomeEntry(
  income: IncomeEntry,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): IncomeEntry {
  const convertedAmount = convertAmount(income.amount, fromCurrency, toCurrency, rates);
  return {
    ...income,
    amount: convertedAmount,
    currency: toCurrency,
  };
}

/**
 * Convert expense entry to new currency
 */
function convertExpenseEntry(
  expense: ExpenseEntry,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates
): ExpenseEntry {
  const convertedAmount = convertAmount(expense.amount, fromCurrency, toCurrency, rates);
  return {
    ...expense,
    amount: convertedAmount,
    currency: toCurrency,
  };
}

/**
 * Convert all Expense Tracker data to a new currency
 * @param data - The Expense Tracker data to convert
 * @param fromCurrency - The previous default currency
 * @param toCurrency - The new default currency
 * @param rates - Exchange rates (relative to fromCurrency)
 * @returns Expense Tracker data with all values converted
 */
export function convertExpenseDataToNewCurrency(
  data: ExpenseTrackerData,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): ExpenseTrackerData {
  if (fromCurrency === toCurrency) {
    return data;
  }

  return {
    ...data,
    currency: toCurrency,
    years: data.years.map(year => ({
      ...year,
      months: year.months.map(month => ({
        ...month,
        incomes: month.incomes.map(income => 
          convertIncomeEntry(income, fromCurrency, toCurrency, rates)
        ),
        expenses: month.expenses.map(expense => 
          convertExpenseEntry(expense, fromCurrency, toCurrency, rates)
        ),
        budgets: month.budgets.map(budget => ({
          ...budget,
          monthlyBudget: convertAmount(budget.monthlyBudget, fromCurrency, toCurrency, rates),
          currency: toCurrency,
        })),
      })),
    })),
    globalBudgets: data.globalBudgets.map(budget => ({
      ...budget,
      monthlyBudget: convertAmount(budget.monthlyBudget, fromCurrency, toCurrency, rates),
      currency: toCurrency,
    })),
  };
}

/**
 * Convert FIRE Calculator inputs to a new currency
 * Converts all monetary values: initialSavings, expenses, income, pensions, etc.
 * Non-monetary fields like percentages, rates, and flags are preserved unchanged.
 * 
 * @param inputs - The FIRE Calculator inputs to convert
 * @param fromCurrency - The previous default currency
 * @param toCurrency - The new default currency
 * @param rates - Exchange rates (relative to fromCurrency)
 * @returns FIRE Calculator inputs with all monetary values converted.
 *          Returns the original inputs unchanged if fromCurrency equals toCurrency.
 */
export function convertFireCalculatorInputsToNewCurrency(
  inputs: CalculatorInputs,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): CalculatorInputs {
  // Early return if currencies are the same - no conversion needed
  if (fromCurrency === toCurrency) {
    return inputs;
  }

  return {
    ...inputs,
    initialSavings: convertAmount(inputs.initialSavings, fromCurrency, toCurrency, rates),
    currentAnnualExpenses: convertAmount(inputs.currentAnnualExpenses, fromCurrency, toCurrency, rates),
    fireAnnualExpenses: convertAmount(inputs.fireAnnualExpenses, fromCurrency, toCurrency, rates),
    annualLaborIncome: convertAmount(inputs.annualLaborIncome, fromCurrency, toCurrency, rates),
    statePensionIncome: convertAmount(inputs.statePensionIncome, fromCurrency, toCurrency, rates),
    privatePensionIncome: convertAmount(inputs.privatePensionIncome, fromCurrency, toCurrency, rates),
    otherIncome: convertAmount(inputs.otherIncome, fromCurrency, toCurrency, rates),
  };
}

/**
 * Convert MonthlyVariation data to a different display currency for chart visualization
 * @param variations - Array of monthly variations to convert
 * @param fromCurrency - The source currency of the data
 * @param toCurrency - The target display currency
 * @param rates - Exchange rates to use for conversion
 * @returns Array of MonthlyVariation with converted monetary values
 */
export function convertMonthlyVariationsToDisplayCurrency(
  variations: MonthlyVariation[],
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): MonthlyVariation[] {
  if (fromCurrency === toCurrency) {
    return variations;
  }

  return variations.map(variation => ({
    month: variation.month,
    netWorth: convertAmount(variation.netWorth, fromCurrency, toCurrency, rates),
    changeFromPrevMonth: convertAmount(variation.changeFromPrevMonth, fromCurrency, toCurrency, rates),
    changePercent: variation.changePercent, // Percentage values stay the same
    assetValueChange: convertAmount(variation.assetValueChange, fromCurrency, toCurrency, rates),
    cashChange: convertAmount(variation.cashChange, fromCurrency, toCurrency, rates),
    pensionChange: convertAmount(variation.pensionChange, fromCurrency, toCurrency, rates),
    debtChange: convertAmount(variation.debtChange, fromCurrency, toCurrency, rates),
    taxLiabilityChange: convertAmount(variation.taxLiabilityChange, fromCurrency, toCurrency, rates),
  }));
}

/**
 * Convert NetWorthForecast data to a different display currency for chart visualization
 * @param forecast - Array of net worth forecasts to convert
 * @param fromCurrency - The source currency of the data
 * @param toCurrency - The target display currency
 * @param rates - Exchange rates to use for conversion
 * @returns Array of NetWorthForecast with converted monetary values
 */
export function convertNetWorthForecastToDisplayCurrency(
  forecast: NetWorthForecast[],
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: ExchangeRates = DEFAULT_FALLBACK_RATES
): NetWorthForecast[] {
  if (fromCurrency === toCurrency) {
    return forecast;
  }

  return forecast.map(f => ({
    month: f.month,
    projectedNetWorth: convertAmount(f.projectedNetWorth, fromCurrency, toCurrency, rates),
    confidenceLevel: f.confidenceLevel,
    basedOnMonths: f.basedOnMonths,
  }));
}
