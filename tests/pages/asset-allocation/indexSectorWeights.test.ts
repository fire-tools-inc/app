import { describe, it, expect } from 'vitest';
import { inferIndexSectorWeights, INDUSTRY_SECTORS } from '../../../src/utils/indexSectorWeights';

function total(weights: { weight: number }[] | undefined): number {
  return (weights ?? []).reduce((s, w) => s + w.weight, 0);
}

function labels(weights: { sector: string }[] | undefined): string[] {
  return (weights ?? []).map(w => w.sector);
}

describe('indexSectorWeights', () => {
  describe('inferIndexSectorWeights', () => {
    it('expands US large-cap indices into tech-led industry sectors', () => {
      const w = inferIndexSectorWeights('SPDR S&P 500 ETF Trust');
      expect(total(w)).toBeCloseTo(1, 6);
      expect(labels(w)).toContain(INDUSTRY_SECTORS.TECHNOLOGY);
      expect(labels(w)).toContain(INDUSTRY_SECTORS.FINANCIAL_SERVICES);
      // Sorted descending, Technology dominates US large cap.
      expect(w?.[0].sector).toBe(INDUSTRY_SECTORS.TECHNOLOGY);
    });

    it('maps Nasdaq-100 / QQQ to a tech & communication heavy profile', () => {
      const w = inferIndexSectorWeights('Invesco QQQ Trust NASDAQ-100');
      expect(w?.[0].sector).toBe(INDUSTRY_SECTORS.TECHNOLOGY);
      expect(labels(w)).toContain(INDUSTRY_SECTORS.COMMUNICATION_SERVICES);
      expect(total(w)).toBeCloseTo(1, 6);
    });

    it('maps all-world / ACWI before developed world', () => {
      const w = inferIndexSectorWeights('Vanguard FTSE All-World UCITS ETF');
      expect(labels(w)).toContain(INDUSTRY_SECTORS.TECHNOLOGY);
      expect(labels(w)).toContain(INDUSTRY_SECTORS.FINANCIAL_SERVICES);
      expect(total(w)).toBeCloseTo(1, 6);
    });

    it('maps MSCI World to a developed-world profile', () => {
      const w = inferIndexSectorWeights('iShares Core MSCI World UCITS ETF');
      expect(total(w)).toBeCloseTo(1, 6);
      expect(labels(w).length).toBeGreaterThan(8);
    });

    it('maps emerging markets funds with high financials weight', () => {
      const w = inferIndexSectorWeights('iShares Core MSCI Emerging Markets IMI');
      expect(labels(w)).toContain(INDUSTRY_SECTORS.FINANCIAL_SERVICES);
      expect(total(w)).toBeCloseTo(1, 6);
    });

    it('maps European indices', () => {
      const w = inferIndexSectorWeights('Lyxor Core STOXX Europe 600 UCITS ETF');
      expect(w?.[0].sector).toBe(INDUSTRY_SECTORS.FINANCIAL_SERVICES);
      expect(total(w)).toBeCloseTo(1, 6);
    });

    it('maps small-cap indices distinctly from large cap', () => {
      const w = inferIndexSectorWeights('iShares Russell 2000 ETF');
      expect(labels(w)).toContain(INDUSTRY_SECTORS.INDUSTRIALS);
      expect(total(w)).toBeCloseTo(1, 6);
    });

    it('returns undefined for bond, commodity and real-estate funds', () => {
      expect(inferIndexSectorWeights('iShares Euro Govt Bond 7-10yr')).toBeUndefined();
      expect(inferIndexSectorWeights('iShares Physical Gold ETC')).toBeUndefined();
      expect(inferIndexSectorWeights('Vanguard Global REIT UCITS ETF')).toBeUndefined();
      expect(inferIndexSectorWeights('SPDR Bloomberg Aggregate Bond')).toBeUndefined();
    });

    it('returns undefined for single-country and unknown funds', () => {
      expect(inferIndexSectorWeights('iShares MSCI China A')).toBeUndefined();
      expect(inferIndexSectorWeights('Some Random Holding Inc.')).toBeUndefined();
      expect(inferIndexSectorWeights(undefined)).toBeUndefined();
      expect(inferIndexSectorWeights('')).toBeUndefined();
    });

    it('normalizes every profile to sum to 1', () => {
      const names = [
        'SPDR S&P 500 ETF',
        'Invesco QQQ NASDAQ-100',
        'iShares Russell 2000',
        'iShares MSCI World',
        'Vanguard FTSE All-World',
        'iShares MSCI Emerging Markets',
        'STOXX Europe 600',
      ];
      for (const name of names) {
        expect(total(inferIndexSectorWeights(name))).toBeCloseTo(1, 6);
      }
    });
  });
});
