import { describe, expect, it } from 'vitest';
import { serializeInputsToURL, deserializeInputsFromURL, hasURLParams, rememberCalculatorQuery, selectInitialCalculatorInputs } from '../../../src/utils/urlParams';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';
import { CalculatorInputs } from '../../../src/types/calculator';

describe('urlParams', () => {
  describe('serializeInputsToURL', () => {
    it('serializes all calculator inputs to URL parameters', () => {
      const params = serializeInputsToURL(DEFAULT_INPUTS);
      
      expect(params.get('initialSavings')).toBe(DEFAULT_INPUTS.initialSavings.toString());
      expect(params.get('stocksPercent')).toBe(DEFAULT_INPUTS.stocksPercent.toString());
      expect(params.get('bondsPercent')).toBe(DEFAULT_INPUTS.bondsPercent.toString());
      expect(params.get('cashPercent')).toBe(DEFAULT_INPUTS.cashPercent.toString());
      expect(params.get('currentAnnualExpenses')).toBe(DEFAULT_INPUTS.currentAnnualExpenses.toString());
      expect(params.get('fireAnnualExpenses')).toBe(DEFAULT_INPUTS.fireAnnualExpenses.toString());
      expect(params.get('annualLaborIncome')).toBe(DEFAULT_INPUTS.annualLaborIncome.toString());
      expect(params.get('laborIncomeGrowthRate')).toBe(DEFAULT_INPUTS.laborIncomeGrowthRate.toString());
      expect(params.get('savingsRate')).toBe(DEFAULT_INPUTS.savingsRate.toString());
      expect(params.get('desiredWithdrawalRate')).toBe(DEFAULT_INPUTS.desiredWithdrawalRate.toString());
      expect(params.get('expectedStockReturn')).toBe(DEFAULT_INPUTS.expectedStockReturn.toString());
      expect(params.get('expectedBondReturn')).toBe(DEFAULT_INPUTS.expectedBondReturn.toString());
      expect(params.get('expectedCashReturn')).toBe(DEFAULT_INPUTS.expectedCashReturn.toString());
      expect(params.get('yearOfBirth')).toBe(DEFAULT_INPUTS.yearOfBirth.toString());
      expect(params.get('retirementAge')).toBe(DEFAULT_INPUTS.retirementAge.toString());
      expect(params.get('statePensionIncome')).toBe(DEFAULT_INPUTS.statePensionIncome.toString());
      expect(params.get('privatePensionIncome')).toBe(DEFAULT_INPUTS.privatePensionIncome.toString());
      expect(params.get('otherIncome')).toBe(DEFAULT_INPUTS.otherIncome.toString());
      expect(params.get('stopWorkingAtFIRE')).toBe(DEFAULT_INPUTS.stopWorkingAtFIRE.toString());
    });

    it('serializes custom inputs correctly', () => {
      const customInputs: CalculatorInputs = {
        ...DEFAULT_INPUTS,
        initialSavings: 100000,
        stocksPercent: 80,
        yearOfBirth: 1985,
        stopWorkingAtFIRE: false,
      };

      const params = serializeInputsToURL(customInputs);
      
      expect(params.get('initialSavings')).toBe('100000');
      expect(params.get('stocksPercent')).toBe('80');
      expect(params.get('yearOfBirth')).toBe('1985');
      expect(params.get('stopWorkingAtFIRE')).toBe('false');
    });
  });

  describe('deserializeInputsFromURL', () => {
    it('deserializes all parameters correctly', () => {
      const params = new URLSearchParams();
      params.set('initialSavings', '75000');
      params.set('stocksPercent', '60');
      params.set('bondsPercent', '30');
      params.set('cashPercent', '10');
      params.set('currentAnnualExpenses', '35000');
      params.set('fireAnnualExpenses', '35000');
      params.set('annualLaborIncome', '50000');
      params.set('laborIncomeGrowthRate', '2.5');
      params.set('savingsRate', '30');
      params.set('desiredWithdrawalRate', '3.5');
      params.set('expectedStockReturn', '8');
      params.set('expectedBondReturn', '3');
      params.set('expectedCashReturn', '-1.5');
      params.set('yearOfBirth', '1985');
      params.set('retirementAge', '65');
      params.set('statePensionIncome', '15000');
      params.set('privatePensionIncome', '10000');
      params.set('otherIncome', '5000');
      params.set('stopWorkingAtFIRE', 'false');

      const inputs = deserializeInputsFromURL(params);

      expect(inputs.initialSavings).toBe(75000);
      expect(inputs.stocksPercent).toBe(60);
      expect(inputs.bondsPercent).toBe(30);
      expect(inputs.cashPercent).toBe(10);
      expect(inputs.currentAnnualExpenses).toBe(35000);
      expect(inputs.fireAnnualExpenses).toBe(35000);
      expect(inputs.annualLaborIncome).toBe(50000);
      expect(inputs.laborIncomeGrowthRate).toBe(2.5);
      expect(inputs.savingsRate).toBe(30);
      expect(inputs.desiredWithdrawalRate).toBe(3.5);
      expect(inputs.expectedStockReturn).toBe(8);
      expect(inputs.expectedBondReturn).toBe(3);
      expect(inputs.expectedCashReturn).toBe(-1.5);
      expect(inputs.yearOfBirth).toBe(1985);
      expect(inputs.retirementAge).toBe(65);
      expect(inputs.statePensionIncome).toBe(15000);
      expect(inputs.privatePensionIncome).toBe(10000);
      expect(inputs.otherIncome).toBe(5000);
      expect(inputs.stopWorkingAtFIRE).toBe(false);
    });

    it('falls back to defaults for missing parameters', () => {
      const params = new URLSearchParams();
      params.set('initialSavings', '100000');
      // Other parameters missing

      const inputs = deserializeInputsFromURL(params);

      expect(inputs.initialSavings).toBe(100000);
      expect(inputs.stocksPercent).toBe(DEFAULT_INPUTS.stocksPercent);
      expect(inputs.bondsPercent).toBe(DEFAULT_INPUTS.bondsPercent);
      expect(inputs.yearOfBirth).toBe(DEFAULT_INPUTS.yearOfBirth);
      expect(inputs.stopWorkingAtFIRE).toBe(DEFAULT_INPUTS.stopWorkingAtFIRE);
    });

    it('falls back to defaults for invalid number parameters', () => {
      const params = new URLSearchParams();
      params.set('initialSavings', 'not-a-number');
      params.set('stocksPercent', 'invalid');

      const inputs = deserializeInputsFromURL(params);

      expect(inputs.initialSavings).toBe(DEFAULT_INPUTS.initialSavings);
      expect(inputs.stocksPercent).toBe(DEFAULT_INPUTS.stocksPercent);
    });

    it('handles boolean parameters correctly', () => {
      const paramsTrue = new URLSearchParams();
      paramsTrue.set('stopWorkingAtFIRE', 'true');
      expect(deserializeInputsFromURL(paramsTrue).stopWorkingAtFIRE).toBe(true);

      const paramsFalse = new URLSearchParams();
      paramsFalse.set('stopWorkingAtFIRE', 'false');
      expect(deserializeInputsFromURL(paramsFalse).stopWorkingAtFIRE).toBe(false);

      const paramsInvalid = new URLSearchParams();
      paramsInvalid.set('stopWorkingAtFIRE', 'invalid');
      expect(deserializeInputsFromURL(paramsInvalid).stopWorkingAtFIRE).toBe(false);
    });

    it('handles negative numbers correctly', () => {
      const params = new URLSearchParams();
      params.set('expectedCashReturn', '-3');
      
      const inputs = deserializeInputsFromURL(params);
      
      expect(inputs.expectedCashReturn).toBe(-3);
    });
  });

  describe('hasURLParams', () => {
    it('returns true when calculator parameters are present', () => {
      const params = new URLSearchParams();
      params.set('initialSavings', '100000');
      
      expect(hasURLParams(params)).toBe(true);
    });

    it('returns true when any parameter is present', () => {
      const params = new URLSearchParams();
      params.set('stocksPercent', '70');
      
      expect(hasURLParams(params)).toBe(true);
    });

    it('returns false when no parameters are present', () => {
      const params = new URLSearchParams();
      
      expect(hasURLParams(params)).toBe(false);
    });
  });

  describe('round-trip serialization', () => {
    it('preserves all values through serialization and deserialization', () => {
      const originalInputs: CalculatorInputs = {
        ...DEFAULT_INPUTS,
        initialSavings: 123456.78,
        stocksPercent: 65.5,
        bondsPercent: 24.5,
        cashPercent: 10,
        yearOfBirth: 1988,
        stopWorkingAtFIRE: false,
      };

      const params = serializeInputsToURL(originalInputs);
      const deserializedInputs = deserializeInputsFromURL(params);

      expect(deserializedInputs).toEqual(originalInputs);
    });
  });

  describe('partial URL parameters', () => {
    it('handles partial URL parameters like user provided example', () => {
      // Simulating the user's example: 
      // /fire-calculator?initialSavings=100000&stocksPercent=70&bondsPercent=20&cashPercent=10&yearOfBirth=1985&stopWorkingAtFIRE=true
      const params = new URLSearchParams();
      params.set('initialSavings', '100000');
      params.set('stocksPercent', '70');
      params.set('bondsPercent', '20');
      params.set('cashPercent', '10');
      params.set('yearOfBirth', '1985');
      params.set('stopWorkingAtFIRE', 'true');

      const inputs = deserializeInputsFromURL(params);

      // Should have the specified values
      expect(inputs.initialSavings).toBe(100000);
      expect(inputs.stocksPercent).toBe(70);
      expect(inputs.bondsPercent).toBe(20);
      expect(inputs.cashPercent).toBe(10);
      expect(inputs.yearOfBirth).toBe(1985);
      expect(inputs.stopWorkingAtFIRE).toBe(true);

      // Other values should fall back to defaults
      expect(inputs.annualLaborIncome).toBe(DEFAULT_INPUTS.annualLaborIncome);
      expect(inputs.currentAnnualExpenses).toBe(DEFAULT_INPUTS.currentAnnualExpenses);
      expect(inputs.expectedStockReturn).toBe(DEFAULT_INPUTS.expectedStockReturn);
    });
  });

  describe('selectInitialCalculatorInputs', () => {
    const own = { ...DEFAULT_INPUTS, initialSavings: 1000 };
    const remote = { ...DEFAULT_INPUTS, initialSavings: 2000 };

    it('lets stored inputs from the database win over the query the calculator wrote itself', () => {
      const params = serializeInputsToURL(own);
      rememberCalculatorQuery(params);
      expect(selectInitialCalculatorInputs(new URLSearchParams(params.toString()), remote, true)).toEqual(remote);
    });

    it('keeps shared links and local-only storage behaving as before', () => {
      rememberCalculatorQuery(serializeInputsToURL(own));
      const shared = serializeInputsToURL({ ...DEFAULT_INPUTS, initialSavings: 3000 });
      expect(selectInitialCalculatorInputs(shared, remote, true).initialSavings).toBe(3000);
      expect(selectInitialCalculatorInputs(serializeInputsToURL(own), remote, false)).toEqual(own);
      expect(selectInitialCalculatorInputs(new URLSearchParams(), remote, false)).toEqual(remote);
      expect(selectInitialCalculatorInputs(new URLSearchParams(), null, true)).toEqual(DEFAULT_INPUTS);
    });
  });
});
