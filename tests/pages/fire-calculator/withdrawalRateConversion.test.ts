import { describe, it, expect } from 'vitest';
import {
  annuityWithdrawalFactor,
  solveRealReturn,
  convertWithdrawalRates,
  DEFAULT_SWR_HORIZON_YEARS,
  DEFAULT_LTWR_HORIZON_YEARS,
} from '../../../src/utils/withdrawalRateConversion';

describe('annuityWithdrawalFactor', () => {
  it('returns 1/N at r = 0 (limit)', () => {
    expect(annuityWithdrawalFactor(0, 30)).toBeCloseTo(1 / 30, 10);
    expect(annuityWithdrawalFactor(0, 50)).toBeCloseTo(1 / 50, 10);
  });

  it('is numerically stable for very small r', () => {
    expect(annuityWithdrawalFactor(1e-9, 30)).toBeCloseTo(1 / 30, 6);
  });

  it('is strictly increasing in r for fixed N', () => {
    let prev = -Infinity;
    for (let r = -0.05; r <= 0.15 + 1e-9; r += 0.005) {
      const v = annuityWithdrawalFactor(r, 30);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('is strictly decreasing in N for positive r', () => {
    const r = 0.04;
    expect(annuityWithdrawalFactor(r, 30)).toBeGreaterThan(annuityWithdrawalFactor(r, 50));
    expect(annuityWithdrawalFactor(r, 50)).toBeGreaterThan(r); // approaches r from above
  });

  it('throws for r <= -1', () => {
    expect(() => annuityWithdrawalFactor(-1, 30)).toThrow();
    expect(() => annuityWithdrawalFactor(-1.5, 30)).toThrow();
  });
});

describe('solveRealReturn', () => {
  it('inverts annuityWithdrawalFactor (round-trip on r)', () => {
    for (const r of [-0.02, 0, 0.01, 0.03, 0.05, 0.1]) {
      const factor = annuityWithdrawalFactor(r, 30);
      const solved = solveRealReturn(factor, 30);
      expect(solved).toBeCloseTo(r, 6);
    }
  });

  it('recovers ~1.26% real return for the classic 4%/30y SWR', () => {
    const r = solveRealReturn(0.04, 30);
    // 4% over 30 years implies a low positive real return
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.03);
  });

  it('returns negative r when the rate is below 1/N', () => {
    const r = solveRealReturn(0.02, 30); // below 1/30 ≈ 3.33%
    expect(r).toBeLessThan(0);
  });
});

describe('convertWithdrawalRates', () => {
  const params = {
    swrHorizonYears: DEFAULT_SWR_HORIZON_YEARS,
    ltwrHorizonYears: DEFAULT_LTWR_HORIZON_YEARS,
  };

  it('keeps the user-entered rate unchanged for each input type', () => {
    expect(convertWithdrawalRates(4, 'swr', params).swr).toBeCloseTo(4, 6);
    expect(convertWithdrawalRates(3.5, 'ltwr', params).ltwr).toBeCloseTo(3.5, 6);
    expect(convertWithdrawalRates(3, 'pwr', params).pwr).toBeCloseTo(3, 6);
  });

  it('enforces PWR <= LTWR <= SWR for a typical SWR input', () => {
    const t = convertWithdrawalRates(4, 'swr', params);
    expect(t.pwr).toBeLessThanOrEqual(t.ltwr + 1e-9);
    expect(t.ltwr).toBeLessThanOrEqual(t.swr + 1e-9);
  });

  it('enforces PWR <= LTWR <= SWR for a typical LTWR input', () => {
    const t = convertWithdrawalRates(3.5, 'ltwr', params);
    expect(t.pwr).toBeLessThanOrEqual(t.ltwr + 1e-9);
    expect(t.ltwr).toBeLessThanOrEqual(t.swr + 1e-9);
  });

  it('enforces PWR <= LTWR <= SWR for a typical PWR input', () => {
    const t = convertWithdrawalRates(3, 'pwr', params);
    expect(t.pwr).toBeLessThanOrEqual(t.ltwr + 1e-9);
    expect(t.ltwr).toBeLessThanOrEqual(t.swr + 1e-9);
  });

  it('round-trips SWR -> PWR -> SWR consistently', () => {
    const fromSwr = convertWithdrawalRates(4.2, 'swr', params);
    const backFromPwr = convertWithdrawalRates(fromSwr.pwr, 'pwr', params);
    expect(backFromPwr.swr).toBeCloseTo(4.2, 4);
    expect(backFromPwr.ltwr).toBeCloseTo(fromSwr.ltwr, 4);
  });

  it('round-trips LTWR -> SWR -> LTWR consistently', () => {
    const fromLtwr = convertWithdrawalRates(3.6, 'ltwr', params);
    const backFromSwr = convertWithdrawalRates(fromLtwr.swr, 'swr', params);
    expect(backFromSwr.ltwr).toBeCloseTo(3.6, 4);
    expect(backFromSwr.pwr).toBeCloseTo(fromLtwr.pwr, 4);
  });

  it('flags a non-positive real return and clamps displayed PWR to 0', () => {
    const t = convertWithdrawalRates(2, 'swr', params); // below 1/30 -> negative r
    expect(t.impliedRealReturn).toBeLessThan(0);
    expect(t.pwr).toBe(0);
    expect(t.principalPreserved).toBe(false);
  });

  it('marks principal as preserved for a positive real return', () => {
    const t = convertWithdrawalRates(4, 'swr', params);
    expect(t.impliedRealReturn).toBeGreaterThan(0);
    expect(t.principalPreserved).toBe(true);
  });

  it('throws on non-positive input rate', () => {
    expect(() => convertWithdrawalRates(0, 'swr', params)).toThrow();
    expect(() => convertWithdrawalRates(-1, 'pwr', params)).toThrow();
  });

  it('longer SWR horizon lowers the derived SWR for a fixed PWR', () => {
    const short = convertWithdrawalRates(3, 'pwr', { swrHorizonYears: 20, ltwrHorizonYears: 50 });
    const long = convertWithdrawalRates(3, 'pwr', { swrHorizonYears: 40, ltwrHorizonYears: 50 });
    expect(long.swr).toBeLessThan(short.swr);
  });
});
