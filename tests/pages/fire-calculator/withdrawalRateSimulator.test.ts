import { describe, it, expect } from 'vitest';
import {
  runWithdrawalRateSimulation,
  runWithdrawalRateSweep,
  defaultWithdrawalRateRange,
  WithdrawalRateInputs,
} from '../../../src/utils/withdrawalRateSimulator';

const baseInputs: WithdrawalRateInputs = {
  initialPortfolio: 1_000_000,
  stocksPercent: 60,
  bondsPercent: 30,
  cashPercent: 10,
  expectedStockReturn: 7,
  expectedBondReturn: 2,
  expectedCashReturn: -2,
  stockVolatility: 15,
  bondVolatility: 5,
  blackSwanProbability: 2,
  blackSwanImpact: -40,
  retirementYears: 30,
  numSimulations: 500,
};

describe('withdrawalRateSimulator', () => {
  describe('runWithdrawalRateSimulation', () => {
    it('returns a populated result for a typical 4% withdrawal', () => {
      const r = runWithdrawalRateSimulation(baseInputs, 4);
      expect(r.withdrawalRate).toBe(4);
      expect(r.numSimulations).toBe(500);
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(100);
      expect(r.medianYearsLasted).toBeGreaterThan(0);
      expect(r.medianYearsLasted).toBeLessThanOrEqual(baseInputs.retirementYears);
    });

    it('lower withdrawal rate produces equal-or-higher success rate (statistically)', () => {
      const low = runWithdrawalRateSimulation({ ...baseInputs, numSimulations: 1500 }, 2.5);
      const high = runWithdrawalRateSimulation({ ...baseInputs, numSimulations: 1500 }, 8);
      // 2.5% should be effectively bulletproof over 30 years vs 8% which should fail often
      expect(low.successRate).toBeGreaterThan(high.successRate);
      expect(low.successRate).toBeGreaterThan(80);
      expect(high.successRate).toBeLessThan(60);
    });

    it('extremely high withdrawal rate drains portfolio quickly', () => {
      const r = runWithdrawalRateSimulation({ ...baseInputs, numSimulations: 300 }, 25);
      expect(r.successRate).toBeLessThan(5);
      expect(r.medianYearsLasted).toBeLessThan(baseInputs.retirementYears);
    });

    it('survived runs yield positive final portfolio', () => {
      const r = runWithdrawalRateSimulation({ ...baseInputs, numSimulations: 1000 }, 3);
      // With 3% over 30 years, ~90th percentile final portfolio should be > 0
      expect(r.percentile90FinalPortfolio).toBeGreaterThan(0);
    });

    it('throws when allocation does not sum to 100%', () => {
      const bad = { ...baseInputs, stocksPercent: 50 }; // sum = 90
      expect(() => runWithdrawalRateSimulation(bad, 4)).toThrow(/100%/);
    });

    it('throws on non-positive withdrawal rate', () => {
      expect(() => runWithdrawalRateSimulation(baseInputs, 0)).toThrow();
      expect(() => runWithdrawalRateSimulation(baseInputs, -1)).toThrow();
    });

    it('throws on non-positive portfolio', () => {
      expect(() => runWithdrawalRateSimulation({ ...baseInputs, initialPortfolio: 0 }, 4)).toThrow();
    });

    it('returns medianFinalPortfolio = 0 when most runs deplete', () => {
      const r = runWithdrawalRateSimulation({ ...baseInputs, numSimulations: 500 }, 20);
      expect(r.medianFinalPortfolio).toBe(0);
    });
  });

  describe('runWithdrawalRateSweep', () => {
    it('returns one result per requested rate, in order', () => {
      const rates = [3, 4, 5];
      const out = runWithdrawalRateSweep({ ...baseInputs, numSimulations: 200 }, rates);
      expect(out).toHaveLength(3);
      expect(out.map((p) => p.withdrawalRate)).toEqual(rates);
    });

    it('success rate is monotonically non-increasing across rising rates (approx)', () => {
      const rates = [3, 5, 8, 12];
      const out = runWithdrawalRateSweep({ ...baseInputs, numSimulations: 1000 }, rates);
      // Allow tiny statistical jitter but expect a clear downward trend
      expect(out[0].successRate).toBeGreaterThanOrEqual(out[1].successRate - 3);
      expect(out[1].successRate).toBeGreaterThanOrEqual(out[2].successRate - 3);
      expect(out[2].successRate).toBeGreaterThanOrEqual(out[3].successRate - 3);
    });
  });

  describe('defaultWithdrawalRateRange', () => {
    it('generates inclusive range with given step', () => {
      const r = defaultWithdrawalRateRange(2, 4, 0.5);
      expect(r).toEqual([2, 2.5, 3, 3.5, 4]);
    });

    it('defaults to 2–7 in 0.5% steps', () => {
      const r = defaultWithdrawalRateRange();
      expect(r[0]).toBe(2);
      expect(r[r.length - 1]).toBe(7);
      expect(r).toContain(4);
      expect(r).toContain(3.5);
    });
  });
});
