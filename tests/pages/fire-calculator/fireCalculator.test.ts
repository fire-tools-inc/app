import { describe, it, expect } from 'vitest';
import {
  calculateFIRE,
  calculateYearsOfExpenses,
  calculateFireTarget,
  getEffectiveFireExpenses,
  getExpectedPortfolioReturn,
} from '../../../src/utils/fireCalculator';
import { CalculatorInputs } from '../../../src/types/calculator';

describe('calculateYearsOfExpenses', () => {
  it('should calculate 33.33 years for 3% withdrawal rate', () => {
    const result = calculateYearsOfExpenses(3);
    expect(result).toBe(33.33);
  });

  it('should calculate 25 years for 4% withdrawal rate', () => {
    const result = calculateYearsOfExpenses(4);
    expect(result).toBe(25);
  });

  it('should return 0 for 0% withdrawal rate', () => {
    const result = calculateYearsOfExpenses(0);
    expect(result).toBe(0);
  });

  it('should calculate 50 years for 2% withdrawal rate', () => {
    const result = calculateYearsOfExpenses(2);
    expect(result).toBe(50);
  });

  it('should round to 2 decimal places', () => {
    // 100 / 7 = 14.285714...
    const result = calculateYearsOfExpenses(7);
    expect(result).toBe(14.29);
  });
});

describe('FIRE Calculator', () => {
  const baseInputs: CalculatorInputs = {
    initialSavings: 50000,
    stocksPercent: 70,
    bondsPercent: 20,
    cashPercent: 10,
    currentAnnualExpenses: 40000,
    fireAnnualExpenses: 40000,
    annualLaborIncome: 60000,
    laborIncomeGrowthRate: 3,
    savingsRate: 33.33,
    desiredWithdrawalRate: 3,
    yearsOfExpenses: 100 / 3, // ~33.33 years
    expectedStockReturn: 7,
    expectedBondReturn: 2,
    expectedCashReturn: -2,
    yearOfBirth: 1990,
    retirementAge: 67,
    statePensionIncome: 0,
    privatePensionIncome: 0,
    otherIncome: 0,
    stopWorkingAtFIRE: true,
    maxAge: 100,
    useAssetAllocationValue: false,
    useExpenseTrackerExpenses: false,
    useExpenseTrackerIncome: false,
    fireType: 'standard',
    leanExpenseMultiplier: 0.7,
    fatExpenseMultiplier: 2.0,
    baristaAnnualIncome: 20000,
    coastTargetAge: 65,
  };

  describe('Projection timeline', () => {
    it('should project from current age to maxAge', () => {
      // ARRANGE & ACT
      const currentYear = new Date().getFullYear();
      const currentAge = currentYear - baseInputs.yearOfBirth;
      const result = calculateFIRE(baseInputs);
      
      // ASSERT
      expect(result.projections.length).toBeGreaterThan(0);
      
      // First projection should start at current age
      const firstProjection = result.projections[0];
      expect(firstProjection.age).toBe(currentAge);
      expect(firstProjection.year).toBe(currentYear);
      
      // Last projection should be at maxAge
      const lastProjection = result.projections[result.projections.length - 1];
      expect(lastProjection.age).toBe(baseInputs.maxAge);
      expect(lastProjection.year).toBe(currentYear + (baseInputs.maxAge - currentAge));
      
      // Should have correct number of projections
      const expectedProjections = baseInputs.maxAge - currentAge + 1;
      expect(result.projections.length).toBe(expectedProjections);
    });

    it('should handle withdrawal rate of 0 without crashing', () => {
      // ARRANGE
      const inputs = { ...baseInputs, desiredWithdrawalRate: 0 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.fireTarget).toBe(0);
      expect(result.yearsToFIRE).toBe(0);
      expect(result.projections.length).toBeGreaterThan(0);
      expect(result.projections[0].portfolioValue).toBe(inputs.initialSavings);
    });
  });

  describe('Withdrawal rate validation', () => {
    it('should reject negative withdrawal rate', () => {
      // ARRANGE
      const inputs = { ...baseInputs, desiredWithdrawalRate: -1 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Withdrawal rate cannot be negative');
      expect(result.projections).toHaveLength(0);
      expect(result.yearsToFIRE).toBe(-1);
    });

    it('should reject negative withdrawal rate with extreme value', () => {
      // ARRANGE
      const inputs = { ...baseInputs, desiredWithdrawalRate: -100 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Withdrawal rate cannot be negative');
      expect(result.projections).toHaveLength(0);
    });
  });

  describe('Edge case handling', () => {
    it('should reject negative expenses', () => {
      // ARRANGE
      const inputs = { ...baseInputs, currentAnnualExpenses: -10000 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Current annual expenses cannot be negative');
      expect(result.projections).toHaveLength(0);
    });

    it('should reject negative FIRE expenses', () => {
      // ARRANGE
      const inputs = { ...baseInputs, fireAnnualExpenses: -5000 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('FIRE annual expenses cannot be negative');
      expect(result.projections).toHaveLength(0);
    });

    it('should reject negative labor income', () => {
      // ARRANGE
      const inputs = { ...baseInputs, annualLaborIncome: -30000 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Annual labor income cannot be negative');
      expect(result.projections).toHaveLength(0);
    });

    it('should reject maxAge less than current age', () => {
      // ARRANGE
      const currentYear = new Date().getFullYear();
      const currentAge = currentYear - baseInputs.yearOfBirth;
      const inputs = { ...baseInputs, maxAge: currentAge - 1 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Maximum age must be greater than or equal to current age');
      expect(result.projections).toHaveLength(0);
    });

    it('should reject maxAge greater than 150', () => {
      // ARRANGE
      const inputs = { ...baseInputs, maxAge: 200 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Maximum age must be 150 or less');
      expect(result.projections).toHaveLength(0);
    });

    it('should handle extremely large initial savings', () => {
      // ARRANGE
      const inputs = { ...baseInputs, initialSavings: Number.MAX_SAFE_INTEGER };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Input values are too large for calculation');
      expect(result.projections).toHaveLength(0);
    });

    it('should handle extremely large expenses', () => {
      // ARRANGE
      const inputs = { ...baseInputs, currentAnnualExpenses: Number.MAX_SAFE_INTEGER };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toContain('Input values are too large for calculation');
      expect(result.projections).toHaveLength(0);
    });

    it('should handle very small withdrawal rate without division issues', () => {
      // ARRANGE
      const inputs = { ...baseInputs, desiredWithdrawalRate: 0.001 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      // Should not have validation errors, but FIRE target will be very large
      expect(result.validationErrors).toBeUndefined();
      expect(result.projections.length).toBeGreaterThan(0);
      expect(isFinite(result.fireTarget)).toBe(true);
    });

    it('should handle zero initial savings', () => {
      // ARRANGE
      const inputs = { ...baseInputs, initialSavings: 0 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.projections.length).toBeGreaterThan(0);
      expect(result.projections[0].portfolioValue).toBe(0);
    });

    it('should handle zero labor income', () => {
      // ARRANGE
      const inputs = { ...baseInputs, annualLaborIncome: 0 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.projections.length).toBeGreaterThan(0);
      expect(result.projections[0].laborIncome).toBe(0);
    });
  });

  describe('Years of expenses for FIRE target', () => {
    it('should calculate FIRE target based on yearsOfExpenses', () => {
      // ARRANGE
      const inputs = { ...baseInputs, yearsOfExpenses: 25, fireAnnualExpenses: 40000 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      // FIRE target = fireAnnualExpenses * yearsOfExpenses = 40000 * 25 = 1,000,000
      expect(result.fireTarget).toBe(1000000);
    });

    it('should use custom yearsOfExpenses value', () => {
      // ARRANGE
      const inputs = { ...baseInputs, yearsOfExpenses: 30, fireAnnualExpenses: 50000 };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      // FIRE target = fireAnnualExpenses * yearsOfExpenses = 50000 * 30 = 1,500,000
      expect(result.fireTarget).toBe(1500000);
    });
  });

  describe('Other income and pension calculations', () => {
    it('should NOT include otherIncome in pre-FIRE savings (only affects post-FIRE)', () => {
      // ARRANGE
      const inputsWithOther = { ...baseInputs, otherIncome: 10000 };
      const inputsWithoutOther = { ...baseInputs, otherIncome: 0 };
      
      // ACT
      const resultWithOther = calculateFIRE(inputsWithOther);
      const resultWithoutOther = calculateFIRE(inputsWithoutOther);
      
      // ASSERT
      // First year net savings should be the SAME with or without other income (while working)
      const firstYearWithOther = resultWithOther.projections[0];
      const firstYearWithoutOther = resultWithoutOther.projections[0];
      
      // The savings should be the same since other income is not included in pre-FIRE savings
      expect(firstYearWithOther.netSavings).toBeCloseTo(firstYearWithoutOther.netSavings, 2);
      
      // But the otherIncome field should be populated for chart display
      expect(firstYearWithOther.otherIncome).toBe(10000);
      expect(firstYearWithoutOther.otherIncome).toBe(0);
    });

    it('should populate pension fields only after retirement age', () => {
      // ARRANGE
      const currentYear = new Date().getFullYear();
      const retirementAge = 67;
      // Use a year of birth that makes current age exactly 66 (one year before retirement)
      const yearOfBirth = currentYear - 66;
      
      const inputs = { 
        ...baseInputs, 
        yearOfBirth,
        retirementAge,
        statePensionIncome: 12000,
        privatePensionIncome: 6000,
        stopWorkingAtFIRE: false, // Keep working to test pension inclusion
      };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      // Year 0: age 66, no pension
      // Year 1: age 67, pension should kick in
      const beforeRetirement = result.projections[0]; // age 66
      const atRetirement = result.projections[1]; // age 67
      
      expect(beforeRetirement.age).toBe(66);
      expect(atRetirement.age).toBe(67);
      
      // Pension fields should be 0 before retirement age
      expect(beforeRetirement.statePensionIncome).toBe(0);
      expect(beforeRetirement.privatePensionIncome).toBe(0);
      
      // Pension fields should be populated at/after retirement age
      expect(atRetirement.statePensionIncome).toBe(12000);
      expect(atRetirement.privatePensionIncome).toBe(6000);
    });

    it('should include otherIncome in post-FIRE calculations', () => {
      // ARRANGE: Start with already FIRE'd situation
      const inputs = { 
        ...baseInputs, 
        initialSavings: 2000000, // Already at FIRE target
        yearsOfExpenses: 25,
        fireAnnualExpenses: 40000, // FIRE target = 1,000,000
        otherIncome: 5000,
        stopWorkingAtFIRE: true,
      };
      
      // ACT
      const result = calculateFIRE(inputs);
      
      // ASSERT
      expect(result.yearsToFIRE).toBe(0); // Already FIRE'd
      
      // After FIRE, the portfolio change should be: totalIncome - expenses
      // totalIncome = 0 (no labor) + investmentYield + otherIncome (5000)
      // The otherIncome should help reduce portfolio drawdown
      const firstProjection = result.projections[0];
      expect(firstProjection.isFIRE).toBe(true);
      expect(firstProjection.totalIncome).toBeGreaterThan(0);
      expect(firstProjection.otherIncome).toBe(5000);
    });
  });

  describe('FIRE variants', () => {
    it('standard FIRE: result echoes fireType and effectiveFireExpenses', () => {
      const result = calculateFIRE({ ...baseInputs, fireType: 'standard' });
      expect(result.fireType).toBe('standard');
      expect(result.effectiveFireExpenses).toBe(baseInputs.fireAnnualExpenses);
      expect(result.fireTarget).toBeCloseTo(baseInputs.fireAnnualExpenses * baseInputs.yearsOfExpenses, 4);
    });

    it('lean FIRE: target is reduced by leanExpenseMultiplier', () => {
      const inputs = { ...baseInputs, fireType: 'lean' as const, leanExpenseMultiplier: 0.7 };
      const result = calculateFIRE(inputs);
      expect(result.fireType).toBe('lean');
      expect(result.effectiveFireExpenses).toBeCloseTo(40000 * 0.7, 4);
      expect(result.fireTarget).toBeCloseTo(40000 * 0.7 * inputs.yearsOfExpenses, 4);
      // Lean FIRE should be cheaper than standard FIRE, so years-to-FIRE is <= standard
      const standard = calculateFIRE({ ...baseInputs, fireType: 'standard' });
      expect(result.yearsToFIRE).toBeLessThanOrEqual(standard.yearsToFIRE);
    });

    it('fat FIRE: target is scaled up by fatExpenseMultiplier', () => {
      const inputs = { ...baseInputs, fireType: 'fat' as const, fatExpenseMultiplier: 2.0 };
      const result = calculateFIRE(inputs);
      expect(result.fireType).toBe('fat');
      expect(result.effectiveFireExpenses).toBeCloseTo(40000 * 2.0, 4);
      expect(result.fireTarget).toBeCloseTo(40000 * 2.0 * inputs.yearsOfExpenses, 4);
      // Fat FIRE should take longer than standard FIRE
      const standard = calculateFIRE({ ...baseInputs, fireType: 'standard' });
      if (standard.yearsToFIRE > 0) {
        expect(result.yearsToFIRE === -1 || result.yearsToFIRE >= standard.yearsToFIRE).toBe(true);
      }
    });

    it('barista FIRE: target only funds the gap between expenses and part-time income', () => {
      const inputs = { ...baseInputs, fireType: 'barista' as const, baristaAnnualIncome: 20000 };
      const result = calculateFIRE(inputs);
      expect(result.fireType).toBe('barista');
      expect(result.effectiveFireExpenses).toBe(40000 - 20000);
      expect(result.fireTarget).toBeCloseTo((40000 - 20000) * inputs.yearsOfExpenses, 4);
    });

    it('barista FIRE: post-FIRE labor income drops to baristaAnnualIncome', () => {
      const inputs: CalculatorInputs = {
        ...baseInputs,
        initialSavings: 1_000_000, // start already FIRE-ready for barista
        fireType: 'barista',
        baristaAnnualIncome: 20000,
      };
      const result = calculateFIRE(inputs);
      // First projection should be FIRE-achieved and labor income capped at barista amount
      const firstFire = result.projections.find((p) => p.isFIRE);
      expect(firstFire).toBeDefined();
      expect(firstFire!.laborIncome).toBe(20000);
    });

    it('barista FIRE: when part-time income covers all expenses, target is 0', () => {
      const inputs = { ...baseInputs, fireType: 'barista' as const, baristaAnnualIncome: 50000 };
      const result = calculateFIRE(inputs);
      expect(result.effectiveFireExpenses).toBe(0);
      expect(result.fireTarget).toBe(0);
    });

    it('coast FIRE: target is the discounted present value of standard target', () => {
      const inputs = { ...baseInputs, fireType: 'coast' as const, coastTargetAge: 65 };
      const currentAge = new Date().getFullYear() - baseInputs.yearOfBirth;
      const standardTarget = baseInputs.fireAnnualExpenses * baseInputs.yearsOfExpenses;
      const r = getExpectedPortfolioReturn(inputs);
      const years = Math.max(0, 65 - currentAge);
      const expected = standardTarget / Math.pow(1 + r, years);

      const result = calculateFIRE(inputs);
      expect(result.fireType).toBe('coast');
      expect(result.fireTarget).toBeCloseTo(expected, 4);
      // Coast FIRE target is always less than standard target (assuming positive return)
      expect(result.fireTarget).toBeLessThan(standardTarget);
    });

    it('coast FIRE: contributions stop after the coast number is reached', () => {
      const inputs: CalculatorInputs = {
        ...baseInputs,
        initialSavings: 500_000, // pre-loaded so coast is hit immediately
        fireType: 'coast',
        coastTargetAge: 65,
      };
      const result = calculateFIRE(inputs);
      const firstFire = result.projections.find((p) => p.isFIRE);
      expect(firstFire).toBeDefined();
      // Coast FIRE keeps labor income but stops contributing; portfolio change == investment yield only
      expect(firstFire!.laborIncome).toBe(inputs.annualLaborIncome);
      expect(firstFire!.netSavings).toBeCloseTo(firstFire!.investmentYield, 4);
    });
  });

  describe('calculateFireTarget helper', () => {
    const currentAge = new Date().getFullYear() - baseInputs.yearOfBirth;

    it('returns 0 when withdrawal rate is 0', () => {
      expect(calculateFireTarget({ ...baseInputs, desiredWithdrawalRate: 0 }, currentAge)).toBe(0);
    });

    it('returns standardTarget for standard FIRE', () => {
      const target = calculateFireTarget({ ...baseInputs, fireType: 'standard' }, currentAge);
      expect(target).toBeCloseTo(baseInputs.fireAnnualExpenses * baseInputs.yearsOfExpenses, 4);
    });

    it('returns scaled target for fat FIRE', () => {
      const target = calculateFireTarget(
        { ...baseInputs, fireType: 'fat', fatExpenseMultiplier: 1.5 },
        currentAge,
      );
      expect(target).toBeCloseTo(40000 * 1.5 * baseInputs.yearsOfExpenses, 4);
    });

    it('coast: returns standardTarget when years remaining is 0', () => {
      const target = calculateFireTarget(
        { ...baseInputs, fireType: 'coast', coastTargetAge: currentAge },
        currentAge,
      );
      expect(target).toBeCloseTo(baseInputs.fireAnnualExpenses * baseInputs.yearsOfExpenses, 4);
    });
  });

  describe('getEffectiveFireExpenses helper', () => {
    it('standard: returns fireAnnualExpenses unchanged', () => {
      expect(getEffectiveFireExpenses({ ...baseInputs, fireType: 'standard' })).toBe(40000);
    });

    it('lean: scales down', () => {
      expect(
        getEffectiveFireExpenses({ ...baseInputs, fireType: 'lean', leanExpenseMultiplier: 0.5 }),
      ).toBe(20000);
    });

    it('fat: scales up', () => {
      expect(
        getEffectiveFireExpenses({ ...baseInputs, fireType: 'fat', fatExpenseMultiplier: 2.5 }),
      ).toBe(100000);
    });

    it('barista: subtracts part-time income but never goes negative', () => {
      expect(
        getEffectiveFireExpenses({ ...baseInputs, fireType: 'barista', baristaAnnualIncome: 15000 }),
      ).toBe(25000);
      expect(
        getEffectiveFireExpenses({ ...baseInputs, fireType: 'barista', baristaAnnualIncome: 50000 }),
      ).toBe(0);
    });
  });
});
