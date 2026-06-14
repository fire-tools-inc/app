/**
 * ETF Name Heuristics
 *
 * Yahoo Finance's `/v1/finance/search` endpoint (which works without crumb auth)
 * returns long names for ETFs but no provider, region, or holdings data. The
 * `quoteSummary` endpoint that would return that data requires a crumb cookie
 * which can't be obtained from a static browser app.
 *
 * As a fallback, we parse the ETF's long name to extract:
 *   - Provider (fund family)        e.g. "Vanguard", "iShares"
 *   - Region theme                  e.g. "Global", "United States", "Emerging Markets"
 *   - Sector / asset focus          e.g. "Equity - Global", "Government Bonds", "Gold"
 *
 * These heuristics are intentionally conservative: if no confident match is
 * found the field is left undefined and the calling code falls back to the
 * asset class label.
 */

export interface ETFHeuristicResult {
  provider?: string;
  regionTheme?: string;
  sectorTheme?: string;
  assetFocus?: 'Equity' | 'Bond' | 'Commodity' | 'Real Estate' | 'Mixed';
}

// -- Provider patterns -----------------------------------------------------
// Ordered: more specific first.
const PROVIDER_PATTERNS: Array<{ regex: RegExp; provider: string }> = [
  { regex: /\bvanguard\b/i, provider: 'Vanguard' },
  { regex: /\bishares\b/i, provider: 'iShares' },
  { regex: /\bspdr\b/i, provider: 'SPDR' },
  { regex: /\bxtrackers\b/i, provider: 'Xtrackers' },
  { regex: /\bdb x-trackers\b/i, provider: 'Xtrackers' },
  { regex: /\blyxor\b/i, provider: 'Lyxor' },
  { regex: /\bamundi\b/i, provider: 'Amundi' },
  { regex: /\binvesco\b/i, provider: 'Invesco' },
  { regex: /\bwisdomtree\b/i, provider: 'WisdomTree' },
  { regex: /\bvaneck\b/i, provider: 'VanEck' },
  { regex: /\barkk?\b/i, provider: 'ARK' },
  { regex: /\bproshares\b/i, provider: 'ProShares' },
  { regex: /\bfirst trust\b/i, provider: 'First Trust' },
  { regex: /\bschwab\b/i, provider: 'Schwab' },
  { regex: /\bfidelity\b/i, provider: 'Fidelity' },
  { regex: /\bjpmorgan\b|\bjp morgan\b/i, provider: 'JPMorgan' },
  { regex: /\bbnp paribas\b/i, provider: 'BNP Paribas' },
  { regex: /\bhsbc\b/i, provider: 'HSBC' },
  { regex: /\bubs\b/i, provider: 'UBS' },
  { regex: /\bblackrock\b/i, provider: 'BlackRock' },
  { regex: /\bstate street\b/i, provider: 'State Street' },
  { regex: /\bdimensional\b/i, provider: 'Dimensional' },
  { regex: /\bglobal x\b/i, provider: 'Global X' },
  { regex: /\bcsif\b/i, provider: 'Credit Suisse' },
  { regex: /\bossiam\b/i, provider: 'Ossiam' },
  { regex: /\bpimco\b/i, provider: 'PIMCO' },
];

// -- Region patterns -------------------------------------------------------
// Most specific first. Each maps to a region label that's meaningful in the
// Continent / Region breakdowns.
const REGION_PATTERNS: Array<{ regex: RegExp; region: string; continent?: string }> = [
  // Global
  { regex: /\b(all[- ]?world|all[- ]?country|acwi|msci world|ftse all[- ]world|global aggregate|world index|world equity)\b/i, region: 'Global', continent: 'Global' },
  { regex: /\bglobal\b/i, region: 'Global', continent: 'Global' },
  { regex: /\bworld\b/i, region: 'Global', continent: 'Global' },

  // Emerging Markets
  { regex: /\b(emerging markets?|em equity|em asia|em\b(?! equity)|emim|emerging|developing)\b/i, region: 'Emerging Markets', continent: 'Emerging Markets' },

  // United States
  { regex: /\b(s&p ?500|s&p500|sp500|nasdaq[- ]?100|russell ?(1000|2000|3000)|dow jones (industrial|us)|us ?500|u\.s\.\b|usa|united states|america)\b/i, region: 'United States', continent: 'North America' },

  // Japan
  { regex: /\b(japan|nikkei|topix)\b/i, region: 'Japan', continent: 'Asia' },

  // Europe (broader catches)
  { regex: /\b(euro ?stoxx ?50?|stoxx ?600|euro ?zone|eurozone|ftse ?100|dax|cac ?40|smi|ibex|ftse mib)\b/i, region: 'Europe', continent: 'Europe' },
  { regex: /\b(europe|european)\b/i, region: 'Europe', continent: 'Europe' },

  // Asia ex-Japan & Pacific
  { regex: /\basia[- ]pacific\b/i, region: 'Asia Pacific', continent: 'Asia' },
  { regex: /\b(asia ex[- ]?japan)\b/i, region: 'Asia ex-Japan', continent: 'Asia' },
  { regex: /\b(asia|pacific)\b/i, region: 'Asia Pacific', continent: 'Asia' },

  // Country-specific
  { regex: /\bchina\b/i, region: 'China', continent: 'Asia' },
  { regex: /\bindia\b/i, region: 'India', continent: 'Asia' },
  { regex: /\bkorea\b/i, region: 'South Korea', continent: 'Asia' },
  { regex: /\btaiwan\b/i, region: 'Taiwan', continent: 'Asia' },
  { regex: /\baustralia\b/i, region: 'Australia', continent: 'Oceania' },
  { regex: /\bcanada\b/i, region: 'Canada', continent: 'North America' },
  { regex: /\bbrazil\b/i, region: 'Brazil', continent: 'South America' },
  { regex: /\b(germany|deutsch)\b/i, region: 'Germany', continent: 'Europe' },
  { regex: /\b(united kingdom|britain|uk equity)\b/i, region: 'United Kingdom', continent: 'Europe' },
  { regex: /\bfrance\b/i, region: 'France', continent: 'Europe' },
  { regex: /\bitaly\b/i, region: 'Italy', continent: 'Europe' },
  { regex: /\bswitzerland\b/i, region: 'Switzerland', continent: 'Europe' },

  // Developed Markets (last as fallback for "developed")
  { regex: /\b(developed markets?|dm equity|msci eafe|eafe)\b/i, region: 'Developed Markets ex-US', continent: 'Global' },
];

// -- Asset focus / sector theme patterns -----------------------------------
const ASSET_FOCUS_PATTERNS: Array<{
  regex: RegExp;
  focus: ETFHeuristicResult['assetFocus'];
  sectorTheme: string;
}> = [
  // Bonds
  { regex: /\b(treasur(y|ies)|govt bond|government bond|sovereign|gilt|bund)\b/i, focus: 'Bond', sectorTheme: 'Government Bonds' },
  { regex: /\b(corporate bond|corp bond|investment grade|ig credit|aggregate bond)\b/i, focus: 'Bond', sectorTheme: 'Corporate Bonds' },
  { regex: /\b(high[- ]?yield|hy bond|junk bond)\b/i, focus: 'Bond', sectorTheme: 'High-Yield Bonds' },
  { regex: /\b(inflation[- ]?linked|tips|linker|inflation protected)\b/i, focus: 'Bond', sectorTheme: 'Inflation-Linked Bonds' },
  { regex: /\b(em(?:erging)? debt|emerging bond)\b/i, focus: 'Bond', sectorTheme: 'Emerging Markets Bonds' },
  { regex: /\b(bond|fixed income|treasuries|aggregate)\b/i, focus: 'Bond', sectorTheme: 'Bonds' },

  // Real Estate
  { regex: /\b(reit|real estate)\b/i, focus: 'Real Estate', sectorTheme: 'Real Estate' },

  // Commodities
  { regex: /\bgold\b/i, focus: 'Commodity', sectorTheme: 'Gold' },
  { regex: /\bsilver\b/i, focus: 'Commodity', sectorTheme: 'Silver' },
  { regex: /\b(crude|oil|brent|wti)\b/i, focus: 'Commodity', sectorTheme: 'Oil & Gas' },
  { regex: /\bcommodit(y|ies)\b/i, focus: 'Commodity', sectorTheme: 'Commodities' },

  // Sector-themed equity
  { regex: /\b(technology|tech sector|information technology)\b/i, focus: 'Equity', sectorTheme: 'Technology' },
  { regex: /\b(healthcare|health care|biotech|pharmaceutical)\b/i, focus: 'Equity', sectorTheme: 'Healthcare' },
  { regex: /\b(financial|banks|insurance)\b/i, focus: 'Equity', sectorTheme: 'Financial Services' },
  { regex: /\b(energy|oil & gas)\b/i, focus: 'Equity', sectorTheme: 'Energy' },
  { regex: /\b(consumer staples)\b/i, focus: 'Equity', sectorTheme: 'Consumer Defensive' },
  { regex: /\b(consumer discretionary)\b/i, focus: 'Equity', sectorTheme: 'Consumer Cyclical' },
  { regex: /\b(utilities)\b/i, focus: 'Equity', sectorTheme: 'Utilities' },
  { regex: /\b(materials|metals|mining)\b/i, focus: 'Equity', sectorTheme: 'Basic Materials' },
  { regex: /\b(industrials)\b/i, focus: 'Equity', sectorTheme: 'Industrials' },
  { regex: /\b(communications?|telecom)\b/i, focus: 'Equity', sectorTheme: 'Communication Services' },

  // Mixed / allocation
  { regex: /\b(allocation|multi[- ]asset|balanced|lifestrategy)\b/i, focus: 'Mixed', sectorTheme: 'Multi-Asset' },
];

/** Infer provider, region, and asset focus from an ETF's long name. */
export function inferEtfInfo(longName: string | undefined, shortName?: string): ETFHeuristicResult {
  const text = [longName, shortName].filter(Boolean).join(' ');
  if (!text) return {};

  const result: ETFHeuristicResult = {};

  for (const { regex, provider } of PROVIDER_PATTERNS) {
    if (regex.test(text)) {
      result.provider = provider;
      break;
    }
  }

  for (const { regex, region } of REGION_PATTERNS) {
    if (regex.test(text)) {
      result.regionTheme = region;
      break;
    }
  }

  for (const { regex, focus, sectorTheme } of ASSET_FOCUS_PATTERNS) {
    if (regex.test(text)) {
      result.assetFocus = focus;
      result.sectorTheme = sectorTheme;
      break;
    }
  }

  // If no specific asset/sector theme matched but we did identify a region, this
  // is a broad equity basket. Mark the focus as Equity, but deliberately DON'T
  // synthesize a "<Region> Equity" sector — that's a region label, not an
  // industry sector. Broad baskets are expanded into real industry sectors
  // (Technology, Financial Services, ...) via `inferIndexSectorWeights`.
  if (!result.sectorTheme && result.regionTheme) {
    result.assetFocus = 'Equity';
  }

  return result;
}

/**
 * Derive an ISO country code from an ISIN's first two characters.
 * The ISIN prefix is the country of issuance. For individual stocks it usually
 * matches the company's primary listing country (and often HQ); for ETFs it
 * indicates the *domicile* (often IE, LU), not the underlying region.
 *
 * Returns undefined if the input doesn't look like a valid ISIN.
 */
export function isinToCountryCode(isin: string | undefined | null): string | undefined {
  if (!isin) return undefined;
  const clean = isin.trim().toUpperCase();
  if (clean.length < 2) return undefined;
  const prefix = clean.substring(0, 2);
  if (!/^[A-Z]{2}$/.test(prefix)) return undefined;
  return prefix;
}
