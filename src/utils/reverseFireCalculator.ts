/**
 * Reverse FIRE Calculator
 *
 * Solves the inverse of the standard FIRE projection: given a target retirement
 * age and a desired post-FIRE expense level, compute how much the user must
 * save each month (and each year) starting from today to reach the FIRE target
 * by that age.
 *
 * The math is the standard future-value-of-an-annuity-due formulation:
 *
 *   FV = P * (1 + r)^n + PMT_year * [((1 + r)^n - 1) / r] * (1 + r)
 *
 * Where:
 *   FV          = required portfolio at retirement (in nominal/future euros)
 *   P           = current savings
 *   r           = nominal annual portfolio return (weighted by allocation)
 *   n           = years until target retirement age
 *   PMT_year    = required annual contribution (we solve for this)
 *
 * Contributions are modeled as annuity-due (start of year) so that the result
 * is conservative and matches how most users actually invest.
 *
 * FIRE target uses the same convention as the forward calculator:
 *   fireTarget = fireAnnualExpenses * yearsOfExpenses
 *
 * Inflation is applied by scaling the FIRE target forward to the retirement
 * year using the absolute value of `expectedCashReturn` (the same proxy the
 * forward calculator uses for inflation in expense-tracker integration).
 */

import { CalculatorInputs } from '../types/calculator';
import { getEffectiveInputs, calculateYearsOfExpenses } from './fireCalculator';

export interface ReverseFireInputs {
  targetRetirementAge: number;
  /**
   * When true, the FIRE target is inflated to the retirement year using the
   * inflation rate before solving for the contribution. When false the FIRE
   * target stays in today's money and the return rate is treated as a real
   * return. Defaults to true.
   */
  inflateTarget?: boolean;
}

export interface ReverseFireResult {
  /** Future-value FIRE target the user must reach by `targetRetirementAge`. */
  fireTarget: number;
  /** Same FIRE target expressed in today's money (pre-inflation). */
  fireTargetTodayValue: number;
  /** Years between current age and target retirement age. */
  yearsToTarget: number;
  /** Weighted nominal annual return implied by the asset allocation. */
  annualReturnRate: number;
  /** Annual inflation rate used when projecting the target forward. */
  inflationRate: number;
  /** Projected future value of current savings alone at the target age. */
  futureValueOfCurrentSavings: number;
  /**
   * Required gross annual contribution. May be 0 when the user is already on
   * track (future value of current savings >= FIRE target).
   */
  requiredAnnualSavings: number;
  /** requiredAnnualSavings / 12, rounded to cents. */
  requiredMonthlySavings: number;
  /** True when no further contributions are needed to hit the target. */
  alreadyOnTrack: boolean;
  /** Validation errors that prevented the calculation. */
  validationErrors?: string[];
}

const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER / 1000;

/**
 * Weighted nominal annual return for the portfolio (decimal, e.g. 0.06).
 */
function calculatePortfolioReturn(inputs: CalculatorInputs): number {
  return (
    (inputs.stocksPercent / 100) * (inputs.expectedStockReturn / 100) +
    (inputs.bondsPercent / 100) * (inputs.expectedBondReturn / 100) +
    (inputs.cashPercent / 100) * (inputs.expectedCashReturn / 100)
  );
}

/**
 * Round a money value to 2 decimal places without exposing tiny floating point
 * artefacts to the UI.
 */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate the required monthly / annual savings to reach the user's FIRE
 * target by a specified retirement age.
 */
export function calculateReverseFIRE(
  inputs: CalculatorInputs,
  reverseInputs: ReverseFireInputs,
): ReverseFireResult {
  const effective = getEffectiveInputs(inputs);
  const validationErrors: string[] = [];

  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - effective.yearOfBirth;
  const yearsToTarget = reverseInputs.targetRetirementAge - currentAge;

  const allocationSum =
    effective.stocksPercent + effective.bondsPercent + effective.cashPercent;
  if (Math.abs(allocationSum - 100) > 0.01) {
    validationErrors.push(
      `Asset allocation must sum to 100%, currently ${allocationSum.toFixed(2)}%`,
    );
  }

  if (!Number.isFinite(reverseInputs.targetRetirementAge)) {
    validationErrors.push('Target retirement age must be a number');
  } else if (yearsToTarget <= 0) {
    validationErrors.push(
      'Target retirement age must be greater than your current age',
    );
  } else if (yearsToTarget > 100) {
    validationErrors.push('Target retirement age is too far in the future');
  }

  if (effective.fireAnnualExpenses < 0) {
    validationErrors.push('FIRE annual expenses cannot be negative');
  }
  if (effective.initialSavings < 0) {
    validationErrors.push('Current savings cannot be negative');
  }
  if (effective.desiredWithdrawalRate < 0) {
    validationErrors.push('Withdrawal rate cannot be negative');
  }

  const annualReturnRate = calculatePortfolioReturn(effective);
  const inflationRate = Math.abs(effective.expectedCashReturn) / 100;
  const inflateTarget = reverseInputs.inflateTarget ?? true;

  if (validationErrors.length > 0) {
    return {
      fireTarget: 0,
      fireTargetTodayValue: 0,
      yearsToTarget: Math.max(0, yearsToTarget),
      annualReturnRate,
      inflationRate,
      futureValueOfCurrentSavings: 0,
      requiredAnnualSavings: 0,
      requiredMonthlySavings: 0,
      alreadyOnTrack: false,
      validationErrors,
    };
  }

  // Resolve yearsOfExpenses: prefer the stored value, fall back to deriving it
  // from the withdrawal rate (matches the forward calculator's behaviour).
  const yearsOfExpenses =
    effective.yearsOfExpenses > 0
      ? effective.yearsOfExpenses
      : calculateYearsOfExpenses(effective.desiredWithdrawalRate);

  const fireTargetTodayValue =
    effective.desiredWithdrawalRate === 0
      ? 0
      : effective.fireAnnualExpenses * yearsOfExpenses;

  const fireTarget = inflateTarget
    ? fireTargetTodayValue * Math.pow(1 + inflationRate, yearsToTarget)
    : fireTargetTodayValue;

  if (!Number.isFinite(fireTarget) || fireTarget > MAX_SAFE_VALUE) {
    return {
      fireTarget: 0,
      fireTargetTodayValue,
      yearsToTarget,
      annualReturnRate,
      inflationRate,
      futureValueOfCurrentSavings: 0,
      requiredAnnualSavings: 0,
      requiredMonthlySavings: 0,
      alreadyOnTrack: false,
      validationErrors: ['FIRE target calculation resulted in an invalid value'],
    };
  }

  const growthFactor = Math.pow(1 + annualReturnRate, yearsToTarget);
  const futureValueOfCurrentSavings = effective.initialSavings * growthFactor;

  // Shortfall the contributions need to cover at the target year.
  const shortfall = fireTarget - futureValueOfCurrentSavings;

  if (shortfall <= 0) {
    return {
      fireTarget: roundCents(fireTarget),
      fireTargetTodayValue: roundCents(fireTargetTodayValue),
      yearsToTarget,
      annualReturnRate,
      inflationRate,
      futureValueOfCurrentSavings: roundCents(futureValueOfCurrentSavings),
      requiredAnnualSavings: 0,
      requiredMonthlySavings: 0,
      alreadyOnTrack: true,
    };
  }

  // Annuity-due factor: contributions made at the start of each year.
  //   FV_pmt = PMT * [((1 + r)^n - 1) / r] * (1 + r)        (r != 0)
  //   FV_pmt = PMT * n                                       (r == 0)
  let requiredAnnualSavings: number;
  if (Math.abs(annualReturnRate) < 1e-9) {
    requiredAnnualSavings = shortfall / yearsToTarget;
  } else {
    const annuityFactor =
      ((growthFactor - 1) / annualReturnRate) * (1 + annualReturnRate);
    requiredAnnualSavings = shortfall / annuityFactor;
  }

  if (!Number.isFinite(requiredAnnualSavings) || requiredAnnualSavings < 0) {
    requiredAnnualSavings = 0;
  }

  const requiredMonthlySavings = requiredAnnualSavings / 12;

  return {
    fireTarget: roundCents(fireTarget),
    fireTargetTodayValue: roundCents(fireTargetTodayValue),
    yearsToTarget,
    annualReturnRate,
    inflationRate,
    futureValueOfCurrentSavings: roundCents(futureValueOfCurrentSavings),
    requiredAnnualSavings: roundCents(requiredAnnualSavings),
    requiredMonthlySavings: roundCents(requiredMonthlySavings),
    alreadyOnTrack: false,
  };
}
