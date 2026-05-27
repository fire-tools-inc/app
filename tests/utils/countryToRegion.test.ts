import { describe, it, expect } from 'vitest';
import {
  lookupCountry,
  getContinent,
  getRegion,
  COUNTRY_REGION_TABLE,
} from '../../src/utils/countryToRegion';

describe('countryToRegion', () => {
  describe('lookupCountry', () => {
    it('looks up by ISO code (uppercase)', () => {
      const info = lookupCountry('US');
      expect(info?.countryName).toBe('United States');
      expect(info?.continent).toBe('North America');
    });

    it('looks up by ISO code (lowercase)', () => {
      const info = lookupCountry('us');
      expect(info?.countryName).toBe('United States');
    });

    it('looks up by full name', () => {
      const info = lookupCountry('United Kingdom');
      expect(info?.countryCode).toBe('GB');
      expect(info?.region).toBe('Western Europe');
    });

    it('looks up via common alias', () => {
      expect(lookupCountry('USA')?.countryCode).toBe('US');
      expect(lookupCountry('UK')?.countryCode).toBe('GB');
      expect(lookupCountry('Russian Federation')?.countryCode).toBe('RU');
    });

    it('is case-insensitive on names', () => {
      const info = lookupCountry('united states');
      expect(info?.countryCode).toBe('US');
    });

    it('returns undefined for unknown country', () => {
      expect(lookupCountry('Atlantis')).toBeUndefined();
      expect(lookupCountry('')).toBeUndefined();
      expect(lookupCountry(undefined)).toBeUndefined();
      expect(lookupCountry(null)).toBeUndefined();
    });
  });

  describe('getContinent / getRegion', () => {
    it('returns continent for known country', () => {
      expect(getContinent('Germany')).toBe('Europe');
      expect(getContinent('JP')).toBe('Asia');
      expect(getContinent('Australia')).toBe('Oceania');
    });

    it('returns finer-grained region', () => {
      expect(getRegion('Germany')).toBe('Western Europe');
      expect(getRegion('Italy')).toBe('Southern Europe');
      expect(getRegion('Japan')).toBe('East Asia');
      expect(getRegion('India')).toBe('South Asia');
    });

    it('returns "Unknown" for unmatched input', () => {
      expect(getContinent('Atlantis')).toBe('Unknown');
      expect(getRegion('Atlantis')).toBe('Unknown');
      expect(getContinent(undefined)).toBe('Unknown');
    });
  });

  it('table covers the major economies a portfolio is likely to reference', () => {
    const codes = COUNTRY_REGION_TABLE.map(c => c.countryCode);
    for (const required of ['US', 'GB', 'DE', 'JP', 'CA', 'AU', 'CH', 'FR', 'IT', 'IE', 'LU', 'CN', 'IN']) {
      expect(codes).toContain(required);
    }
  });
});
