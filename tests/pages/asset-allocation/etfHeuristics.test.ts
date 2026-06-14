import { describe, it, expect } from 'vitest';
import { inferEtfInfo, isinToCountryCode } from '../../../src/utils/etfHeuristics';

describe('etfHeuristics', () => {
  describe('isinToCountryCode', () => {
    it('returns first two letters of valid ISIN as uppercase', () => {
      expect(isinToCountryCode('US0378331005')).toBe('US');
      expect(isinToCountryCode('IE00BK5BQT80')).toBe('IE');
      expect(isinToCountryCode('de0007164600')).toBe('DE');
    });

    it('returns undefined for non-ISIN-shaped input', () => {
      expect(isinToCountryCode('')).toBeUndefined();
      expect(isinToCountryCode(undefined)).toBeUndefined();
      expect(isinToCountryCode('A')).toBeUndefined();
      expect(isinToCountryCode('12FOO')).toBeUndefined();
    });
  });

  describe('inferEtfInfo', () => {
    it('infers provider from longname', () => {
      expect(inferEtfInfo('Vanguard FTSE All-World UCITS ETF').provider).toBe('Vanguard');
      expect(inferEtfInfo('iShares Core MSCI World UCITS ETF').provider).toBe('iShares');
      expect(inferEtfInfo('SPDR S&P 500 ETF Trust').provider).toBe('SPDR');
      expect(inferEtfInfo('Xtrackers MSCI Emerging Markets').provider).toBe('Xtrackers');
      expect(inferEtfInfo('Amundi Prime All Country World').provider).toBe('Amundi');
      expect(inferEtfInfo('Invesco QQQ Trust').provider).toBe('Invesco');
    });

    it('infers global region from "All-World" / "World" names', () => {
      expect(inferEtfInfo('Vanguard FTSE All-World UCITS ETF').regionTheme).toBe('Global');
      expect(inferEtfInfo('iShares MSCI World').regionTheme).toBe('Global');
      expect(inferEtfInfo('SPDR ACWI ETF').regionTheme).toBe('Global');
    });

    it('infers United States from S&P 500 / Nasdaq / US names', () => {
      expect(inferEtfInfo('SPDR S&P 500 ETF').regionTheme).toBe('United States');
      expect(inferEtfInfo('Invesco QQQ NASDAQ-100').regionTheme).toBe('United States');
      expect(inferEtfInfo('iShares Russell 2000 ETF').regionTheme).toBe('United States');
    });

    it('infers Emerging Markets from EM names', () => {
      expect(inferEtfInfo('iShares Core MSCI Emerging Markets').regionTheme).toBe('Emerging Markets');
      expect(inferEtfInfo('Xtrackers MSCI EM Asia').regionTheme).toBe('Emerging Markets');
    });

    it('infers Europe from Stoxx / DAX / FTSE 100 etc.', () => {
      expect(inferEtfInfo('Lyxor Euro Stoxx 50 UCITS ETF').regionTheme).toBe('Europe');
      expect(inferEtfInfo('iShares Core DAX UCITS').regionTheme).toBe('Europe');
      expect(inferEtfInfo('Vanguard FTSE 100').regionTheme).toBe('Europe');
    });

    it('infers Japan / China / India', () => {
      expect(inferEtfInfo('iShares Core Nikkei 225').regionTheme).toBe('Japan');
      expect(inferEtfInfo('iShares MSCI China').regionTheme).toBe('China');
      expect(inferEtfInfo('iShares MSCI India').regionTheme).toBe('India');
    });

    it('detects bond focus for fixed income ETFs', () => {
      const info = inferEtfInfo('iShares Euro Govt Bond 7-10 yr UCITS ETF');
      expect(info.assetFocus).toBe('Bond');
      expect(info.sectorTheme).toBe('Government Bonds');
    });

    it('detects gold and other commodities', () => {
      expect(inferEtfInfo('iShares Physical Gold ETC').sectorTheme).toBe('Gold');
      expect(inferEtfInfo('WisdomTree Silver').sectorTheme).toBe('Silver');
    });

    it('detects REIT / real estate focus', () => {
      const info = inferEtfInfo('Vanguard Global REIT UCITS ETF');
      expect(info.assetFocus).toBe('Real Estate');
      expect(info.sectorTheme).toBe('Real Estate');
    });

    it('detects sector-themed equity ETFs', () => {
      expect(inferEtfInfo('iShares S&P 500 Information Technology').sectorTheme).toBe('Technology');
      expect(inferEtfInfo('Vanguard Health Care ETF').sectorTheme).toBe('Healthcare');
      expect(inferEtfInfo('Financial Select Sector SPDR Fund').sectorTheme).toBe('Financial Services');
    });

    it('marks broad region-only equity baskets as Equity without a fake sector label', () => {
      const info = inferEtfInfo('Vanguard FTSE All-World UCITS ETF');
      // A region is a region, not an industry sector — broad baskets are expanded
      // into real industry sectors via inferIndexSectorWeights instead.
      expect(info.sectorTheme).toBeUndefined();
      expect(info.assetFocus).toBe('Equity');
    });

    it('returns empty object when no patterns match', () => {
      const info = inferEtfInfo('Unknown Random Holding Inc.');
      expect(info.provider).toBeUndefined();
      expect(info.regionTheme).toBeUndefined();
      expect(info.sectorTheme).toBeUndefined();
    });

    it('handles undefined/empty input', () => {
      expect(inferEtfInfo(undefined)).toEqual({});
      expect(inferEtfInfo('')).toEqual({});
    });
  });
});
