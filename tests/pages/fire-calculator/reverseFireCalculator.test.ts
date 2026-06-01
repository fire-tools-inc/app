import { describe, it, expect } from 'vitest';
import { calculateReverseFIRE } from '../../../src/utils/reverseFireCalculator';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';
import { CalculatorInputs } from '../../../src/types/calculator';

const currentYear = new Date().getFullYear();

function inputsWithAge(currentAge: number, overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    ...DEFAULT_INPUTS,
    yearOfBirth: currentYear - currentAge,
    ...overrides,
  };
}

describe('calculateReverseFIRE', () => {
  it('returns a positive monthly contribution for a realistic plan', () => {
    const inputs = inputsWithAge(35, {
      initialSavings: 50_000,
      fireAnnualExpenses: 40_000,
      desiredWithdrawalRate: 3,
      yearsOfExpenses: 100 / 3,
      stocksPercent: 80,
      bondsPercent: 20,
      cashPercent: 0,
      expectedStockReturn: 7,
      expectedBondReturn: 3,
      expectedCashReturn: -2,
    });

    const result = calculateReverseFIRE(inputs, { targetRetirementAge: 55 });

    expect(result.validationErrors).toBeUndefined();
    expect(result.yearsToTarget).toBe(20);
    expect(result.requiredAnnualSavings).toBeGreaterThan(0);
    expect(result.requiredMonthlySavings).toBeCloseTo(result.requiredAnnualSavings / 12, 2);
    // FIRE target should be inflated above the today-value (€1.33M nominal).
    expect(result.fireTargetTodayValue).toBeCloseTo(40_000 * (100 / 3), 0);
    expect(result.fireTarget).toBeGreaterThan(result.fireTargetTodayValue);
    expect(result.alreadyOnTrack).toBe(false);
  });

  it('marks the user as already on track when current savings already cover the target', () => {
    const inputs = inputsWithAge(40, {
      initialSavings: 5_000_000,
      fireAnnualExpenses: 30_000,
      desiredWithdrawalRate: 3,
      yearsOfExpenses: 100 / 3,
      stocksPercent: 60,
      bondsPercent: 30,
      cashPercent: 10,
      expectedStockReturn: 7,
      expectedBondReturn: 3,
      expectedCashReturn: -2,
    });

    const result = calculateReverseFIRE(inputs, { targetRetirementAge: 60 });

    expect(result.alreadyOnTrack).toBe(true);
    expect(result.requiredAnnualSavings).toBe(0);
    expect(result.requiredMonthlySavings).toBe(0);
  });

  it('handles a zero-return portfolio with the linear fallback', () => {
    const inputs = inputsWithAge(30, {
      initialSavings: 0,
      fireAnnualExpenses: 10_000,
      desiredWithdrawalRate: 3,
      yearsOfExpenses: 100 / 3,
      stocksPercent: 0,
      bondsPercent: 0,
      cashPercent: 100,
      expectedStockReturn: 0,
      expectedBondReturn: 0,
      expectedCashReturn: 0, // also zero inflation so target stays in today's money
    });

    const result = calculateReverseFIRE(
      inputs,
      { targetRetirementAge: 40, inflateTarget: false },
    );

    expect(result.validationErrors).toBeUndefined();
    expect(result.annualReturnRate).toBe(0);
    expect(result.fireTarget).toBeCloseTo(333_333.33, 1);
    expect(result.yearsToTarget).toBe(10);
    expect(result.requiredAnnualSavings).toBeCloseTo(result.fireTarget / 10, 1);
  });

  it('flags an invalid target retirement age below current age', () => {
    const inputs = inputsWithAge(50);
    const result = calculateReverseFIRE(inputs, { targetRetirementAge: 40 });

    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors?.join(' ')).toMatch(/greater than your current age/i);
    expect(result.requiredAnnualSavings).toBe(0);
  });

  it('flags an asset allocation that does not sum to 100', () => {
    const inputs = inputsWithAge(35, {
      stocksPercent: 70,
      bondsPercent: 20,
      cashPercent: 5,
    });

    const result = calculateReverseFIRE(inputs, { targetRetirementAge: 55 });
    expect(result.validationErrors?.join(' ')).toMatch(/sum to 100/);
  });

  it('inflation increases the required contribution vs the un-inflated case', () => {
    const baseInputs = inputsWithAge(35, {
      initialSavings: 50_000,
      fireAnnualExpenses: 40_000,
      desiredWithdrawalRate: 3,
      yearsOfExpenses: 100 / 3,
      stocksPercent: 80,
      bondsPercent: 20,
      cashPercent: 0,
      expectedStockReturn: 7,
      expectedBondReturn: 3,
      expectedCashReturn: -2, // 2% inflation proxy
    });

    const inflated = calculateReverseFIRE(baseInputs, {
      targetRetirementAge: 55,
      inflateTarget: true,
    });
    const noInflation = calculateReverseFIRE(baseInputs, {
      targetRetirementAge: 55,
      inflateTarget: false,
    });

    expect(inflated.requiredAnnualSavings).toBeGreaterThan(noInflation.requiredAnnualSavings);
    expect(inflated.fireTarget).toBeGreaterThan(noInflation.fireTarget);
    // The un-inflated case keeps the FIRE target in today's money.
    expect(noInflation.fireTarget).toBeCloseTo(noInflation.fireTargetTodayValue, 2);
  });

  it('returns FIRE target of 0 when withdrawal rate is 0 and reports on-track', () => {
    const inputs = inputsWithAge(40, {
      initialSavings: 1,
      desiredWithdrawalRate: 0,
      fireAnnualExpenses: 30_000,
    });

    const result = calculateReverseFIRE(inputs, { targetRetirementAge: 60 });
    expect(result.fireTarget).toBe(0);
    expect(result.fireTargetTodayValue).toBe(0);
    expect(result.alreadyOnTrack).toBe(true);
    expect(result.requiredAnnualSavings).toBe(0);
  });
});
