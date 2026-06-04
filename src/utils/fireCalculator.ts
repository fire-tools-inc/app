import { CalculatorInputs, YearProjection, CalculationResult, FireType } from '../types/calculator';
import { 
  calculateAnnualExpensesFromTracker, 
  calculateAnnualIncomeFromTracker 
} from './expenseTrackerIntegration';

/**
 * Get effective calculator inputs with values from expense tracker if enabled
 */
export function getEffectiveInputs(inputs: CalculatorInputs): CalculatorInputs {
  const effectiveInputs = { ...inputs };
  
  // Replace currentAnnualExpenses if using expense tracker
  if (inputs.useExpenseTrackerExpenses) {
    effectiveInputs.currentAnnualExpenses = calculateAnnualExpensesFromTracker(
      undefined,
      Math.abs(inputs.expectedCashReturn)
    );
  }
  
  // Replace annualLaborIncome if using expense tracker
  if (inputs.useExpenseTrackerIncome) {
    effectiveInputs.annualLaborIncome = calculateAnnualIncomeFromTracker(
      undefined,
      inputs.laborIncomeGrowthRate
    );
  }
  
  // Recalculate savings rate if either expense tracker flag is enabled
  if (inputs.useExpenseTrackerExpenses || inputs.useExpenseTrackerIncome) {
    const income = effectiveInputs.annualLaborIncome;
    const expenses = effectiveInputs.currentAnnualExpenses;
    if (income > 0) {
      effectiveInputs.savingsRate = Math.min(100, ((income - expenses) / income) * 100);
    } else {
      effectiveInputs.savingsRate = 0;
    }
  }
  
  return effectiveInputs;
}

/**
 * Calculate years of expenses from withdrawal rate
 * Formula: yearsOfExpenses = 100 / withdrawalRate
 * Returns value rounded to 2 decimal places
 * Returns 0 if withdrawalRate is 0 (FIRE is achieved with any amount)
 */
export function calculateYearsOfExpenses(withdrawalRate: number): number {
  if (withdrawalRate === 0) {
    return 0;
  }
  const years = 100 / withdrawalRate;
  return Math.round(years * 100) / 100; // Round to 2 decimal places
}

/**
 * Blended expected portfolio return (decimal, e.g. 0.05 for 5%) based on asset allocation.
 */
export function getExpectedPortfolioReturn(inputs: CalculatorInputs): number {
  return (
    (inputs.stocksPercent / 100) * (inputs.expectedStockReturn / 100) +
    (inputs.bondsPercent / 100) * (inputs.expectedBondReturn / 100) +
    (inputs.cashPercent / 100) * (inputs.expectedCashReturn / 100)
  );
}

/**
 * Returns the annual expenses used to derive the FIRE target, after applying
 * the lean/fat multipliers. For barista FIRE the "effective expenses" are the
 * gap left after subtracting the barista part-time income.
 */
export function getEffectiveFireExpenses(inputs: CalculatorInputs): number {
  const fireType: FireType = inputs.fireType ?? 'standard';
  switch (fireType) {
    case 'lean':
      return Math.max(0, inputs.fireAnnualExpenses * (inputs.leanExpenseMultiplier ?? 1));
    case 'fat':
      return Math.max(0, inputs.fireAnnualExpenses * (inputs.fatExpenseMultiplier ?? 1));
    case 'barista':
      return Math.max(0, inputs.fireAnnualExpenses - (inputs.baristaAnnualIncome ?? 0));
    case 'coast':
    case 'standard':
    default:
      return inputs.fireAnnualExpenses;
  }
}

/**
 * Calculate the FIRE target for the selected variant.
 *
 * - standard / lean / fat / barista: effectiveExpenses × yearsOfExpenses
 * - coast: present value of the standard FIRE target discounted by the expected
 *   portfolio return between currentAge and coastTargetAge.
 *
 * When desiredWithdrawalRate is 0 the target is also 0 (FIRE is trivially achieved).
 */
export function calculateFireTarget(inputs: CalculatorInputs, currentAge: number): number {
  if (inputs.desiredWithdrawalRate === 0) return 0;
  const fireType: FireType = inputs.fireType ?? 'standard';
  if (fireType === 'coast') {
    const standardTarget = inputs.fireAnnualExpenses * inputs.yearsOfExpenses;
    const r = getExpectedPortfolioReturn(inputs);
    const years = Math.max(0, (inputs.coastTargetAge ?? currentAge) - currentAge);
    if (years === 0) return standardTarget;
    // Avoid division by zero / extreme negatives that would explode the target.
    const growth = Math.pow(1 + r, years);
    if (!isFinite(growth) || growth <= 0) return standardTarget;
    return standardTarget / growth;
  }
  return getEffectiveFireExpenses(inputs) * inputs.yearsOfExpenses;
}

/**
 * Calculate FIRE projection based on inputs.
 *
 * Supports five FIRE variants via inputs.fireType — see {@link calculateFireTarget}
 * for how each variant's target is derived. The projection loop also honors
 * variant-specific behavior:
 *
 * - barista: once the barista number is reached, full labor income is replaced
 *   by baristaAnnualIncome and additional savings stop (the part-time job
 *   covers expenses while the portfolio compounds).
 * - coast:   once the coast number is reached, additional savings stop while
 *   labor income continues to cover current expenses; the portfolio coasts.
 * - lean / fat / standard: when stopWorkingAtFIRE is true, behavior matches
 *   classic FIRE (stop working, live off the portfolio).
 */
export function calculateFIRE(inputs: CalculatorInputs): CalculationResult {
  const effectiveInputs = getEffectiveInputs(inputs);
  
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - effectiveInputs.yearOfBirth;
  const projections: YearProjection[] = [];
  const validationErrors: string[] = [];
  
  // Validate asset allocation
  const allocationSum = effectiveInputs.stocksPercent + effectiveInputs.bondsPercent + effectiveInputs.cashPercent;
  if (Math.abs(allocationSum - 100) > 0.01) {
    validationErrors.push(`Asset allocation must sum to 100%, currently ${allocationSum.toFixed(2)}%`);
  }
  
  // Validate withdrawal rate (must not be negative)
  if (effectiveInputs.desiredWithdrawalRate < 0) {
    validationErrors.push('Withdrawal rate cannot be negative');
  }
  
  // Validate reasonable ranges for inputs to prevent calculation errors
  if (effectiveInputs.currentAnnualExpenses < 0) {
    validationErrors.push('Current annual expenses cannot be negative');
  }
  
  if (effectiveInputs.fireAnnualExpenses < 0) {
    validationErrors.push('FIRE annual expenses cannot be negative');
  }
  
  if (effectiveInputs.annualLaborIncome < 0) {
    validationErrors.push('Annual labor income cannot be negative');
  }
  
  if (effectiveInputs.maxAge < currentAge) {
    validationErrors.push('Maximum age must be greater than or equal to current age');
  }
  
  if (effectiveInputs.maxAge > 150) {
    validationErrors.push('Maximum age must be 150 or less');
  }
  
  // Check for extreme values that could cause calculation issues
  const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER / 1000; // Conservative limit
  if (effectiveInputs.initialSavings > MAX_SAFE_VALUE || 
      effectiveInputs.currentAnnualExpenses > MAX_SAFE_VALUE ||
      effectiveInputs.fireAnnualExpenses > MAX_SAFE_VALUE ||
      effectiveInputs.annualLaborIncome > MAX_SAFE_VALUE) {
    validationErrors.push('Input values are too large for calculation');
  }
  
  const fireType: FireType = effectiveInputs.fireType ?? 'standard';
  const effectiveFireExpenses = getEffectiveFireExpenses(effectiveInputs);

  // If there are validation errors, return early with empty projections
  if (validationErrors.length > 0) {
    return {
      projections: [],
      yearsToFIRE: -1,
      fireTarget: 0,
      finalPortfolioValue: 0,
      fireType,
      effectiveFireExpenses,
      validationErrors,
    };
  }

  // Calculate FIRE target for the selected variant
  let fireTarget: number;
  if (effectiveInputs.desiredWithdrawalRate === 0) {
    fireTarget = 0;
  } else {
    fireTarget = calculateFireTarget(effectiveInputs, currentAge);
    if (!isFinite(fireTarget) || fireTarget > MAX_SAFE_VALUE) {
      validationErrors.push('FIRE target calculation resulted in an invalid value');
      return {
        projections: [],
        yearsToFIRE: -1,
        fireTarget: 0,
        finalPortfolioValue: 0,
        fireType,
        effectiveFireExpenses,
        validationErrors,
      };
    }
  }
  
  let portfolioValue = effectiveInputs.initialSavings;
  let laborIncome = effectiveInputs.annualLaborIncome;
  let isFIREAchieved = effectiveInputs.desiredWithdrawalRate === 0; // FIRE achieved immediately if withdrawal rate is 0
  let yearsToFIRE = effectiveInputs.desiredWithdrawalRate === 0 ? 0 : -1;
  
  // Project from current age to maxAge
  const maxYears = Math.max(0, effectiveInputs.maxAge - currentAge + 1);
  
  for (let i = 0; i < maxYears; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    
    // Check if FIRE is achieved (skip if already achieved at start due to withdrawal rate = 0)
    const justAchievedFIRE = !isFIREAchieved && portfolioValue >= fireTarget;
    if (justAchievedFIRE) {
      isFIREAchieved = true;
      yearsToFIRE = i;
    }
    
    // Determine working mode for this year based on FIRE variant.
    // - barista: after the number is reached, switch to part-time labor income (still working).
    // - coast:   after the number is reached, keep full labor income but stop adding savings.
    // - standard / lean / fat: respect stopWorkingAtFIRE.
    const isBaristaActive = fireType === 'barista' && isFIREAchieved;
    const isCoastActive = fireType === 'coast' && isFIREAchieved;
    const isFullyRetired =
      isFIREAchieved &&
      effectiveInputs.stopWorkingAtFIRE &&
      !isBaristaActive &&
      !isCoastActive;
    const isWorking = !isFullyRetired;
    
    // Calculate investment yield based on asset allocation
    const portfolioReturn = getExpectedPortfolioReturn(effectiveInputs);
    const investmentYield = portfolioValue * portfolioReturn;
    
    // Active labor income for this year (barista replaces it with part-time income)
    const activeLaborIncome = isBaristaActive
      ? Math.min(laborIncome, effectiveInputs.baristaAnnualIncome ?? 0)
      : laborIncome;
    const currentLaborIncome = isWorking ? activeLaborIncome : 0;
    // Pension income only starts at retirement age
    const currentStatePension = age >= effectiveInputs.retirementAge ? effectiveInputs.statePensionIncome : 0;
    const currentPrivatePension = age >= effectiveInputs.retirementAge ? effectiveInputs.privatePensionIncome : 0;
    const pensionIncome = currentStatePension + currentPrivatePension;
    const otherIncomeTotal = pensionIncome + effectiveInputs.otherIncome;
    const totalIncome = currentLaborIncome + investmentYield + otherIncomeTotal;
    
    // Expenses: once FIRE is reached, use the FIRE budget (also for barista/coast post-target).
    const expenses = isFIREAchieved ? effectiveInputs.fireAnnualExpenses : effectiveInputs.currentAnnualExpenses;
    
    // Calculate net change in portfolio
    let portfolioChange: number;
    if (isWorking) {
      if (isCoastActive) {
        // Coast FIRE: stop contributing additional savings, let the portfolio compound.
        portfolioChange = investmentYield;
      } else if (isBaristaActive) {
        // Barista FIRE: part-time income covers the post-FIRE expenses, the gap
        // (if any) is drawn from the portfolio; investment yield compounds.
        portfolioChange = currentLaborIncome + investmentYield + otherIncomeTotal - expenses;
      } else {
        // Standard accumulation: save a percentage of labor income, plus all investment returns.
        const laborSavings = activeLaborIncome * (effectiveInputs.savingsRate / 100);
        portfolioChange = laborSavings + investmentYield;
      }
    } else {
      // Not working: live off portfolio (income - expenses, including investment returns)
      portfolioChange = totalIncome - expenses;
    }
    
    // Store projection (netSavings is the change for display purposes)
    projections.push({
      year,
      age,
      laborIncome: currentLaborIncome,
      investmentYield,
      totalIncome,
      expenses,
      netSavings: portfolioChange,
      portfolioValue,
      fireTarget,
      isFIRE: isFIREAchieved,
      statePensionIncome: currentStatePension,
      privatePensionIncome: currentPrivatePension,
      otherIncome: effectiveInputs.otherIncome,
    });
    
    // Update portfolio for next year
    portfolioValue = portfolioValue + portfolioChange;
    
    // Safety check: if portfolio value becomes too large or invalid, stop calculation
    if (!isFinite(portfolioValue) || Math.abs(portfolioValue) > MAX_SAFE_VALUE) {
      break;
    }
    
    // Grow labor income (barista keeps part-time income flat — it's a lifestyle choice, not a career)
    if (isWorking && !isBaristaActive) {
      laborIncome = laborIncome * (1 + effectiveInputs.laborIncomeGrowthRate / 100);
      if (!isFinite(laborIncome) || laborIncome > MAX_SAFE_VALUE) {
        laborIncome = MAX_SAFE_VALUE;
      }
    }
    
    // Stop if portfolio is significantly depleted
    if (portfolioValue < -1000) {
      break;
    }
  }
  
  return {
    projections,
    yearsToFIRE: yearsToFIRE >= 0 ? yearsToFIRE : -1,
    fireTarget,
    finalPortfolioValue: projections[projections.length - 1]?.portfolioValue || 0,
    fireType,
    effectiveFireExpenses,
  };
}
