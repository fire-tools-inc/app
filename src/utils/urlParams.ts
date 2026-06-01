import { CalculatorInputs, FIRE_TYPES, FireType } from '../types/calculator';
import { DEFAULT_INPUTS } from './defaults';

/**
 * Serialize CalculatorInputs to URL search parameters
 * Excludes Monte Carlo parameters as they are runtime-only
 */
export function serializeInputsToURL(inputs: CalculatorInputs): URLSearchParams {
  const params = new URLSearchParams();

  // Initial Values
  params.set('initialSavings', inputs.initialSavings.toString());

  // Asset Allocation
  params.set('stocksPercent', inputs.stocksPercent.toString());
  params.set('bondsPercent', inputs.bondsPercent.toString());
  params.set('cashPercent', inputs.cashPercent.toString());

  // Expenses
  params.set('currentAnnualExpenses', inputs.currentAnnualExpenses.toString());
  params.set('fireAnnualExpenses', inputs.fireAnnualExpenses.toString());

  // Income
  params.set('annualLaborIncome', inputs.annualLaborIncome.toString());
  params.set('laborIncomeGrowthRate', inputs.laborIncomeGrowthRate.toString());

  // Savings
  params.set('savingsRate', inputs.savingsRate.toString());

  // FIRE Target
  params.set('desiredWithdrawalRate', inputs.desiredWithdrawalRate.toString());
  params.set('yearsOfExpenses', inputs.yearsOfExpenses.toString());

  // FIRE Variant
  params.set('fireType', inputs.fireType);
  params.set('leanExpenseMultiplier', inputs.leanExpenseMultiplier.toString());
  params.set('fatExpenseMultiplier', inputs.fatExpenseMultiplier.toString());
  params.set('baristaAnnualIncome', inputs.baristaAnnualIncome.toString());
  params.set('coastTargetAge', inputs.coastTargetAge.toString());

  // Expected Returns
  params.set('expectedStockReturn', inputs.expectedStockReturn.toString());
  params.set('expectedBondReturn', inputs.expectedBondReturn.toString());
  params.set('expectedCashReturn', inputs.expectedCashReturn.toString());

  // Personal Info
  params.set('yearOfBirth', inputs.yearOfBirth.toString());
  params.set('retirementAge', inputs.retirementAge.toString());

  // Other Income
  params.set('statePensionIncome', inputs.statePensionIncome.toString());
  params.set('privatePensionIncome', inputs.privatePensionIncome.toString());
  params.set('otherIncome', inputs.otherIncome.toString());

  // Options
  params.set('stopWorkingAtFIRE', inputs.stopWorkingAtFIRE.toString());
  params.set('maxAge', inputs.maxAge.toString());
  params.set('useAssetAllocationValue', inputs.useAssetAllocationValue.toString());
  params.set('useExpenseTrackerExpenses', inputs.useExpenseTrackerExpenses.toString());
  params.set('useExpenseTrackerIncome', inputs.useExpenseTrackerIncome.toString());

  return params;
}

/**
 * Deserialize URL search parameters to CalculatorInputs
 * Falls back to default values for missing or invalid parameters
 */
export function deserializeInputsFromURL(params: URLSearchParams): CalculatorInputs {
  const parseNumber = (value: string | null, defaultValue: number): number => {
    if (value === null) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const parseInt = (value: string | null, defaultValue: number): number => {
    if (value === null) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const parseBoolean = (value: string | null, defaultValue: boolean): boolean => {
    if (value === null) return defaultValue;
    return value === 'true';
  };

  const parseFireType = (value: string | null): FireType => {
    if (value && (FIRE_TYPES as readonly string[]).includes(value)) {
      return value as FireType;
    }
    return DEFAULT_INPUTS.fireType;
  };

  return {
    // Initial Values
    initialSavings: parseNumber(params.get('initialSavings'), DEFAULT_INPUTS.initialSavings),

    // Asset Allocation
    stocksPercent: parseNumber(params.get('stocksPercent'), DEFAULT_INPUTS.stocksPercent),
    bondsPercent: parseNumber(params.get('bondsPercent'), DEFAULT_INPUTS.bondsPercent),
    cashPercent: parseNumber(params.get('cashPercent'), DEFAULT_INPUTS.cashPercent),

    // Expenses
    currentAnnualExpenses: parseNumber(params.get('currentAnnualExpenses'), DEFAULT_INPUTS.currentAnnualExpenses),
    fireAnnualExpenses: parseNumber(params.get('fireAnnualExpenses'), DEFAULT_INPUTS.fireAnnualExpenses),

    // Income
    annualLaborIncome: parseNumber(params.get('annualLaborIncome'), DEFAULT_INPUTS.annualLaborIncome),
    laborIncomeGrowthRate: parseNumber(params.get('laborIncomeGrowthRate'), DEFAULT_INPUTS.laborIncomeGrowthRate),

    // Savings
    savingsRate: parseNumber(params.get('savingsRate'), DEFAULT_INPUTS.savingsRate),

    // FIRE Target
    desiredWithdrawalRate: parseNumber(params.get('desiredWithdrawalRate'), DEFAULT_INPUTS.desiredWithdrawalRate),
    yearsOfExpenses: parseNumber(params.get('yearsOfExpenses'), DEFAULT_INPUTS.yearsOfExpenses),

    // FIRE Variant
    fireType: parseFireType(params.get('fireType')),
    leanExpenseMultiplier: parseNumber(params.get('leanExpenseMultiplier'), DEFAULT_INPUTS.leanExpenseMultiplier),
    fatExpenseMultiplier: parseNumber(params.get('fatExpenseMultiplier'), DEFAULT_INPUTS.fatExpenseMultiplier),
    baristaAnnualIncome: parseNumber(params.get('baristaAnnualIncome'), DEFAULT_INPUTS.baristaAnnualIncome),
    coastTargetAge: parseInt(params.get('coastTargetAge'), DEFAULT_INPUTS.coastTargetAge),

    // Expected Returns
    expectedStockReturn: parseNumber(params.get('expectedStockReturn'), DEFAULT_INPUTS.expectedStockReturn),
    expectedBondReturn: parseNumber(params.get('expectedBondReturn'), DEFAULT_INPUTS.expectedBondReturn),
    expectedCashReturn: parseNumber(params.get('expectedCashReturn'), DEFAULT_INPUTS.expectedCashReturn),

    // Personal Info
    yearOfBirth: parseInt(params.get('yearOfBirth'), DEFAULT_INPUTS.yearOfBirth),
    retirementAge: parseInt(params.get('retirementAge'), DEFAULT_INPUTS.retirementAge),

    // Other Income
    statePensionIncome: parseNumber(params.get('statePensionIncome'), DEFAULT_INPUTS.statePensionIncome),
    privatePensionIncome: parseNumber(params.get('privatePensionIncome'), DEFAULT_INPUTS.privatePensionIncome),
    otherIncome: parseNumber(params.get('otherIncome'), DEFAULT_INPUTS.otherIncome),

    // Options
    stopWorkingAtFIRE: parseBoolean(params.get('stopWorkingAtFIRE'), DEFAULT_INPUTS.stopWorkingAtFIRE),
    maxAge: parseInt(params.get('maxAge'), DEFAULT_INPUTS.maxAge),
    useAssetAllocationValue: parseBoolean(params.get('useAssetAllocationValue'), DEFAULT_INPUTS.useAssetAllocationValue),
    useExpenseTrackerExpenses: parseBoolean(params.get('useExpenseTrackerExpenses'), DEFAULT_INPUTS.useExpenseTrackerExpenses),
    useExpenseTrackerIncome: parseBoolean(params.get('useExpenseTrackerIncome'), DEFAULT_INPUTS.useExpenseTrackerIncome),
  };
}

/**
 * Check if URL contains any calculator input parameters
 */
export function hasURLParams(params: URLSearchParams): boolean {
  return params.size > 0;
}
