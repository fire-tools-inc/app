/**
 * Country to Region / Continent mapping
 *
 * Maps ISO 3166-1 alpha-2 country codes AND the free-text country names that
 * Yahoo Finance returns from `summaryProfile.country` to a continent and a
 * finer-grained region label.
 *
 * Yahoo returns full country names (e.g. "United States", "United Kingdom"),
 * not ISO codes, so we accept either format.
 */

export type Continent =
  | 'North America'
  | 'South America'
  | 'Europe'
  | 'Asia'
  | 'Africa'
  | 'Oceania'
  | 'Antarctica'
  | 'Global'
  | 'Emerging Markets';

export interface CountryRegionInfo {
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string; // Canonical name as Yahoo returns
  continent: Continent;
  /** Finer-grained region (e.g., "Western Europe", "North America", "East Asia"). */
  region: string;
}

const COUNTRY_TABLE: CountryRegionInfo[] = [
  // North America
  { countryCode: 'US', countryName: 'United States', continent: 'North America', region: 'North America' },
  { countryCode: 'CA', countryName: 'Canada', continent: 'North America', region: 'North America' },
  { countryCode: 'MX', countryName: 'Mexico', continent: 'North America', region: 'Latin America' },

  // South / Latin America
  { countryCode: 'BR', countryName: 'Brazil', continent: 'South America', region: 'Latin America' },
  { countryCode: 'AR', countryName: 'Argentina', continent: 'South America', region: 'Latin America' },
  { countryCode: 'CL', countryName: 'Chile', continent: 'South America', region: 'Latin America' },
  { countryCode: 'CO', countryName: 'Colombia', continent: 'South America', region: 'Latin America' },
  { countryCode: 'PE', countryName: 'Peru', continent: 'South America', region: 'Latin America' },

  // Western Europe
  { countryCode: 'GB', countryName: 'United Kingdom', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'IE', countryName: 'Ireland', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'FR', countryName: 'France', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'DE', countryName: 'Germany', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'NL', countryName: 'Netherlands', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'BE', countryName: 'Belgium', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'LU', countryName: 'Luxembourg', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'CH', countryName: 'Switzerland', continent: 'Europe', region: 'Western Europe' },
  { countryCode: 'AT', countryName: 'Austria', continent: 'Europe', region: 'Western Europe' },

  // Southern Europe
  { countryCode: 'IT', countryName: 'Italy', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'ES', countryName: 'Spain', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'PT', countryName: 'Portugal', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'GR', countryName: 'Greece', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'MT', countryName: 'Malta', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'CY', countryName: 'Cyprus', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'HR', countryName: 'Croatia', continent: 'Europe', region: 'Southern Europe' },
  { countryCode: 'SI', countryName: 'Slovenia', continent: 'Europe', region: 'Southern Europe' },

  // Northern Europe
  { countryCode: 'SE', countryName: 'Sweden', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'NO', countryName: 'Norway', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'DK', countryName: 'Denmark', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'FI', countryName: 'Finland', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'IS', countryName: 'Iceland', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'EE', countryName: 'Estonia', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'LV', countryName: 'Latvia', continent: 'Europe', region: 'Northern Europe' },
  { countryCode: 'LT', countryName: 'Lithuania', continent: 'Europe', region: 'Northern Europe' },

  // Eastern Europe
  { countryCode: 'PL', countryName: 'Poland', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'CZ', countryName: 'Czechia', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'SK', countryName: 'Slovakia', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'HU', countryName: 'Hungary', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'RO', countryName: 'Romania', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'BG', countryName: 'Bulgaria', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'RU', countryName: 'Russia', continent: 'Europe', region: 'Eastern Europe' },
  { countryCode: 'UA', countryName: 'Ukraine', continent: 'Europe', region: 'Eastern Europe' },

  // East Asia
  { countryCode: 'JP', countryName: 'Japan', continent: 'Asia', region: 'East Asia' },
  { countryCode: 'CN', countryName: 'China', continent: 'Asia', region: 'East Asia' },
  { countryCode: 'KR', countryName: 'South Korea', continent: 'Asia', region: 'East Asia' },
  { countryCode: 'TW', countryName: 'Taiwan', continent: 'Asia', region: 'East Asia' },
  { countryCode: 'HK', countryName: 'Hong Kong', continent: 'Asia', region: 'East Asia' },
  { countryCode: 'MO', countryName: 'Macao', continent: 'Asia', region: 'East Asia' },

  // Southeast Asia
  { countryCode: 'SG', countryName: 'Singapore', continent: 'Asia', region: 'Southeast Asia' },
  { countryCode: 'MY', countryName: 'Malaysia', continent: 'Asia', region: 'Southeast Asia' },
  { countryCode: 'TH', countryName: 'Thailand', continent: 'Asia', region: 'Southeast Asia' },
  { countryCode: 'ID', countryName: 'Indonesia', continent: 'Asia', region: 'Southeast Asia' },
  { countryCode: 'PH', countryName: 'Philippines', continent: 'Asia', region: 'Southeast Asia' },
  { countryCode: 'VN', countryName: 'Vietnam', continent: 'Asia', region: 'Southeast Asia' },

  // South Asia
  { countryCode: 'IN', countryName: 'India', continent: 'Asia', region: 'South Asia' },
  { countryCode: 'PK', countryName: 'Pakistan', continent: 'Asia', region: 'South Asia' },
  { countryCode: 'BD', countryName: 'Bangladesh', continent: 'Asia', region: 'South Asia' },

  // Middle East
  { countryCode: 'IL', countryName: 'Israel', continent: 'Asia', region: 'Middle East' },
  { countryCode: 'AE', countryName: 'United Arab Emirates', continent: 'Asia', region: 'Middle East' },
  { countryCode: 'SA', countryName: 'Saudi Arabia', continent: 'Asia', region: 'Middle East' },
  { countryCode: 'QA', countryName: 'Qatar', continent: 'Asia', region: 'Middle East' },
  { countryCode: 'KW', countryName: 'Kuwait', continent: 'Asia', region: 'Middle East' },
  { countryCode: 'TR', countryName: 'Turkey', continent: 'Asia', region: 'Middle East' },

  // Africa
  { countryCode: 'ZA', countryName: 'South Africa', continent: 'Africa', region: 'Africa' },
  { countryCode: 'EG', countryName: 'Egypt', continent: 'Africa', region: 'Africa' },
  { countryCode: 'NG', countryName: 'Nigeria', continent: 'Africa', region: 'Africa' },
  { countryCode: 'KE', countryName: 'Kenya', continent: 'Africa', region: 'Africa' },
  { countryCode: 'MA', countryName: 'Morocco', continent: 'Africa', region: 'Africa' },

  // Oceania
  { countryCode: 'AU', countryName: 'Australia', continent: 'Oceania', region: 'Oceania' },
  { countryCode: 'NZ', countryName: 'New Zealand', continent: 'Oceania', region: 'Oceania' },
];

const BY_CODE = new Map<string, CountryRegionInfo>();
const BY_NAME = new Map<string, CountryRegionInfo>();

for (const info of COUNTRY_TABLE) {
  BY_CODE.set(info.countryCode.toUpperCase(), info);
  BY_NAME.set(info.countryName.toLowerCase(), info);
}

// Common Yahoo variations / aliases mapped to canonical names.
const NAME_ALIASES: Record<string, string> = {
  usa: 'United States',
  'us': 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  america: 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  'czech republic': 'Czechia',
  'korea, south': 'South Korea',
  'south korea': 'South Korea',
  republic_of_korea: 'South Korea',
  'taiwan, province of china': 'Taiwan',
  'hong kong sar china': 'Hong Kong',
  'russian federation': 'Russia',
};

/**
 * Synthetic region themes used for ETFs whose underlying holdings span many
 * countries. They are not real countries but they ARE meaningful buckets in
 * the Continent / Region breakdowns.
 */
const SYNTHETIC_REGIONS: Record<string, { continent: string; region: string }> = {
  global: { continent: 'Global', region: 'Global' },
  'developed markets ex-us': { continent: 'Global', region: 'Developed Markets ex-US' },
  'emerging markets': { continent: 'Emerging Markets', region: 'Emerging Markets' },
  'asia pacific': { continent: 'Asia', region: 'Asia Pacific' },
  'asia ex-japan': { continent: 'Asia', region: 'Asia ex-Japan' },
  europe: { continent: 'Europe', region: 'Europe' },
  'eastern europe': { continent: 'Europe', region: 'Eastern Europe' },
  'western europe': { continent: 'Europe', region: 'Western Europe' },
  'southern europe': { continent: 'Europe', region: 'Southern Europe' },
  'northern europe': { continent: 'Europe', region: 'Northern Europe' },
  'north america': { continent: 'North America', region: 'North America' },
  'latin america': { continent: 'South America', region: 'Latin America' },
  'middle east': { continent: 'Asia', region: 'Middle East' },
  africa: { continent: 'Africa', region: 'Africa' },
  oceania: { continent: 'Oceania', region: 'Oceania' },
  'east asia': { continent: 'Asia', region: 'East Asia' },
  'south asia': { continent: 'Asia', region: 'South Asia' },
  'southeast asia': { continent: 'Asia', region: 'Southeast Asia' },
};

/**
 * Look up region info by country code (preferred), free-text country name, or
 * synthetic ETF region theme. Returns undefined if no mapping found.
 */
export function lookupCountry(input: string | undefined | null): CountryRegionInfo | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Try ISO code (2 chars, uppercase)
  if (trimmed.length === 2) {
    const byCode = BY_CODE.get(trimmed.toUpperCase());
    if (byCode) return byCode;
  }

  // Try exact name
  const lower = trimmed.toLowerCase();
  const byName = BY_NAME.get(lower);
  if (byName) return byName;

  // Try alias
  const canonical = NAME_ALIASES[lower];
  if (canonical) {
    return BY_NAME.get(canonical.toLowerCase());
  }

  // Try synthetic region theme (used for ETFs)
  const synthetic = SYNTHETIC_REGIONS[lower];
  if (synthetic) {
    return {
      countryCode: '',
      countryName: trimmed,
      continent: synthetic.continent as Continent,
      region: synthetic.region,
    };
  }

  return undefined;
}

/** Get continent for an arbitrary country input, or "Unknown" if not found. */
export function getContinent(input: string | undefined | null): string {
  return lookupCountry(input)?.continent ?? 'Unknown';
}

/** Get fine-grained region for an arbitrary country input, or "Unknown" if not found. */
export function getRegion(input: string | undefined | null): string {
  return lookupCountry(input)?.region ?? 'Unknown';
}

/** Full table — exported for testing. */
export const COUNTRY_REGION_TABLE: ReadonlyArray<CountryRegionInfo> = COUNTRY_TABLE;
