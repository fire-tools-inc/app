import { describe, expect, it } from 'vitest';
import {
  annualizedContribution,
  calculateInvestmentGrowth,
  classifySavingsRate,
  realAnnualReturn,
  validateInputs,
  weightedAnnualReturn,
} from '../../src/utils/investmentGrowthCalculator';
import type { InvestmentGrowthInputs } from '../../src/types/investmentGrowth';

const baseInputs: InvestmentGrowthInputs = {
  startingAmount: 10000,
  stocksPercent: 80,
  bondsPercent: 15,
  cashPercent: 5,
  contributionAmount: 500,
  contributionFrequency: 'monthly',
  expectedStockReturn: 7,
  expectedBondReturn: 3,
  expectedCashReturn: 1,
  inflationRate: 2,
  years: 10,
};

describe('weightedAnnualReturn', () => {
  it('returns the allocation-weighted nominal return', () => {
    expect(weightedAnnualReturn(baseInputs)).toBeCloseTo(0.8 * 7 + 0.15 * 3 + 0.05 * 1, 6);
  });

  it('returns 0 when all returns are 0', () => {
    expect(
      weightedAnnualReturn({
        ...baseInputs,
        expectedStockReturn: 0,
        expectedBondReturn: 0,
        expectedCashReturn: 0,
      }),
    ).toBe(0);
  });
});

describe('realAnnualReturn', () => {
  it('matches the Fisher equation', () => {
    expect(realAnnualReturn(7, 2)).toBeCloseTo(((1.07 / 1.02) - 1) * 100, 6);
  });

  it('returns the nominal value when inflation is 0', () => {
    expect(realAnnualReturn(5, 0)).toBeCloseTo(5, 6);
  });

  it('returns negative when inflation outpaces returns', () => {
    expect(realAnnualReturn(1, 5)).toBeLessThan(0);
  });
});

describe('annualizedContribution', () => {
  it('multiplies by 12 for monthly', () => {
    expect(annualizedContribution(500, 'monthly')).toBe(6000);
  });
  it('multiplies by 4 for quarterly', () => {
    expect(annualizedContribution(500, 'quarterly')).toBe(2000);
  });
  it('multiplies by 1 for yearly', () => {
    expect(annualizedContribution(500, 'yearly')).toBe(500);
  });
});

describe('validateInputs', () => {
  it('passes for a sane input', () => {
    expect(validateInputs(baseInputs)).toEqual([]);
  });

  it('flags allocation that does not sum to 100', () => {
    const errors = validateInputs({ ...baseInputs, cashPercent: 10 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/sum to 100/);
  });

  it('flags negative starting amount', () => {
    expect(validateInputs({ ...baseInputs, startingAmount: -1 })).toContain(
      'Starting amount cannot be negative',
    );
  });

  it('flags negative contribution', () => {
    expect(validateInputs({ ...baseInputs, contributionAmount: -1 })).toContain(
      'Contribution amount cannot be negative',
    );
  });

  it('flags excessive horizon', () => {
    expect(validateInputs({ ...baseInputs, years: 200 })).toContain(
      'Time horizon must be 100 years or less',
    );
  });

  it('flags out-of-range inflation', () => {
    expect(validateInputs({ ...baseInputs, inflationRate: -99 })).toContain(
      'Inflation rate must be between -50% and 100%',
    );
  });
});

describe('calculateInvestmentGrowth', () => {
  it('returns yearly snapshots including a year-0 baseline', () => {
    const r = calculateInvestmentGrowth(baseInputs);
    expect(r.validationErrors).toEqual([]);
    expect(r.yearly).toHaveLength(11);
    expect(r.yearly[0]).toMatchObject({
      year: 0,
      contributions: 0,
      cumulativeContributions: 0,
      nominalValue: baseInputs.startingAmount,
      realValue: baseInputs.startingAmount,
    });
  });

  it('total contributions equal contribution * periods/year * years', () => {
    const r = calculateInvestmentGrowth(baseInputs);
    expect(r.totalContributions).toBeCloseTo(500 * 12 * 10, 6);
  });

  it('final nominal value exceeds starting + contributions when returns are positive', () => {
    const r = calculateInvestmentGrowth(baseInputs);
    const principal = baseInputs.startingAmount + r.totalContributions;
    expect(r.finalNominalValue).toBeGreaterThan(principal);
    expect(r.totalGrowth).toBeGreaterThan(0);
  });

  it('with zero return the final equals starting + contributions', () => {
    const r = calculateInvestmentGrowth({
      ...baseInputs,
      expectedStockReturn: 0,
      expectedBondReturn: 0,
      expectedCashReturn: 0,
      inflationRate: 0,
    });
    expect(r.finalNominalValue).toBeCloseTo(
      baseInputs.startingAmount + 500 * 12 * 10,
      6,
    );
    expect(r.finalRealValue).toBeCloseTo(r.finalNominalValue, 6);
  });

  it('handles zero starting amount', () => {
    const r = calculateInvestmentGrowth({ ...baseInputs, startingAmount: 0 });
    expect(r.validationErrors).toEqual([]);
    expect(r.yearly[0].nominalValue).toBe(0);
    expect(r.finalNominalValue).toBeGreaterThan(0);
  });

  it('handles zero contributions (lump-sum growth)', () => {
    const r = calculateInvestmentGrowth({ ...baseInputs, contributionAmount: 0 });
    expect(r.validationErrors).toEqual([]);
    expect(r.totalContributions).toBe(0);
    // Pure compounding of starting amount
    const w = weightedAnnualReturn(baseInputs) / 100;
    const expected = baseInputs.startingAmount * Math.pow(1 + w, baseInputs.years);
    expect(r.finalNominalValue).toBeCloseTo(expected, 2);
  });

  it('real value is lower than nominal when inflation is positive and >0 growth', () => {
    const r = calculateInvestmentGrowth(baseInputs);
    expect(r.finalRealValue).toBeLessThan(r.finalNominalValue);
  });

  it('flags outperformsInflation correctly', () => {
    expect(calculateInvestmentGrowth(baseInputs).outperformsInflation).toBe(true);
    expect(
      calculateInvestmentGrowth({
        ...baseInputs,
        expectedStockReturn: 1,
        expectedBondReturn: 1,
        expectedCashReturn: 1,
        inflationRate: 5,
      }).outperformsInflation,
    ).toBe(false);
  });

  it('handles extreme inflation gracefully', () => {
    const r = calculateInvestmentGrowth({ ...baseInputs, inflationRate: 50 });
    expect(r.validationErrors).toEqual([]);
    expect(r.finalRealValue).toBeLessThan(r.finalNominalValue);
    expect(Number.isFinite(r.finalRealValue)).toBe(true);
  });

  it('returns empty yearly when validation fails', () => {
    const r = calculateInvestmentGrowth({ ...baseInputs, years: -1 });
    expect(r.validationErrors.length).toBeGreaterThan(0);
    expect(r.yearly).toEqual([]);
  });

  it('quarterly frequency contributes 4x the periodic amount per year', () => {
    const r = calculateInvestmentGrowth({
      ...baseInputs,
      contributionFrequency: 'quarterly',
    });
    expect(r.totalContributions).toBeCloseTo(500 * 4 * 10, 6);
  });

  it('zero horizon returns just the starting amount snapshot', () => {
    const r = calculateInvestmentGrowth({ ...baseInputs, years: 0 });
    expect(r.yearly).toHaveLength(1);
    expect(r.finalNominalValue).toBe(baseInputs.startingAmount);
    expect(r.totalContributions).toBe(0);
  });
});

describe('classifySavingsRate', () => {
  it('returns null when income is missing or non-positive', () => {
    expect(classifySavingsRate(1000, undefined)).toBeNull();
    expect(classifySavingsRate(1000, 0)).toBeNull();
    expect(classifySavingsRate(1000, -100)).toBeNull();
  });

  it('classifies 10% as poor', () => {
    const f = classifySavingsRate(5000, 50000);
    expect(f?.band).toBe('poor');
    expect(f?.rate).toBeCloseTo(10, 6);
  });

  it('classifies 20% as fair', () => {
    expect(classifySavingsRate(10000, 50000)?.band).toBe('fair');
  });

  it('classifies 30% as good', () => {
    expect(classifySavingsRate(15000, 50000)?.band).toBe('good');
  });

  it('classifies 50% as excellent', () => {
    expect(classifySavingsRate(25000, 50000)?.band).toBe('excellent');
  });

  it('classifies 70% as unrealistic', () => {
    expect(classifySavingsRate(35000, 50000)?.band).toBe('unrealistic');
  });
});
