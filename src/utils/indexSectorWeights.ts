/**
 * Index → industry-sector weightings
 *
 * Yahoo Finance's per-ETF holdings endpoint (`quoteSummary` + `topHoldings`)
 * requires crumb auth that a static browser app can't obtain, so a broad-market
 * ETF would otherwise collapse into a single synthetic "<Region> Equity" bucket
 * on the Portfolio Breakdown "By Sector" chart — which is a region label, not an
 * industry sector.
 *
 * To make the sector breakdown genuinely *industry-based* (Finance, Technology,
 * Consumer goods, Healthcare, ...) we map well-known broad indices to an
 * approximate GICS / Morningstar industry-sector profile. A single S&P 500 ETF
 * then contributes proportionally to Technology / Financial Services / etc.,
 * just as it would if real holdings were available.
 *
 * The weightings are intentionally approximate, hand-maintained snapshots of
 * public index fact sheets — they are meant to give a representative industry
 * mix, not a to-the-basis-point allocation. They are normalized at lookup time
 * so callers always receive fractions summing to 1.
 */

import { SectorWeight } from '../types/portfolioBreakdown';

/**
 * Canonical industry-sector labels.
 *
 * These deliberately match Yahoo Finance's Morningstar-style `sectorDisp`
 * strings returned for individual stocks, so ETF-derived weightings merge into
 * the same buckets as direct stock holdings on the breakdown page.
 */
export const INDUSTRY_SECTORS = {
  TECHNOLOGY: 'Technology',
  FINANCIAL_SERVICES: 'Financial Services',
  HEALTHCARE: 'Healthcare',
  CONSUMER_CYCLICAL: 'Consumer Cyclical',
  CONSUMER_DEFENSIVE: 'Consumer Defensive',
  COMMUNICATION_SERVICES: 'Communication Services',
  INDUSTRIALS: 'Industrials',
  ENERGY: 'Energy',
  UTILITIES: 'Utilities',
  BASIC_MATERIALS: 'Basic Materials',
  REAL_ESTATE: 'Real Estate',
} as const;

type SectorProfile = Partial<Record<string, number>>;

/**
 * Approximate industry-sector profiles for major broad indices.
 * Values are relative weights; they are normalized to sum to 1 on lookup.
 */
const INDEX_PROFILES = {
  US_LARGE_CAP: {
    [INDUSTRY_SECTORS.TECHNOLOGY]: 30,
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 13,
    [INDUSTRY_SECTORS.HEALTHCARE]: 12,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 10,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 9,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 8,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 6,
    [INDUSTRY_SECTORS.ENERGY]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 2.5,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 2.5,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 2,
  },
  US_TECH_GROWTH: {
    // Nasdaq-100 style: tech / comms heavy, essentially no financials.
    [INDUSTRY_SECTORS.TECHNOLOGY]: 50,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 16,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 14,
    [INDUSTRY_SECTORS.HEALTHCARE]: 6,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 6,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 5,
    [INDUSTRY_SECTORS.UTILITIES]: 1,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 2,
  },
  US_SMALL_CAP: {
    // Russell 2000 style: more cyclical, less mega-cap tech.
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 18,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 17,
    [INDUSTRY_SECTORS.HEALTHCARE]: 16,
    [INDUSTRY_SECTORS.TECHNOLOGY]: 13,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 11,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 6,
    [INDUSTRY_SECTORS.ENERGY]: 6,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 5,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 3,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 1,
  },
  DEVELOPED_WORLD: {
    [INDUSTRY_SECTORS.TECHNOLOGY]: 25,
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 15,
    [INDUSTRY_SECTORS.HEALTHCARE]: 12,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 11,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 10,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 7,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 7,
    [INDUSTRY_SECTORS.ENERGY]: 4,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 3,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 2,
  },
  ALL_WORLD: {
    [INDUSTRY_SECTORS.TECHNOLOGY]: 24,
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 16,
    [INDUSTRY_SECTORS.HEALTHCARE]: 11,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 11,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 11,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 7,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 6,
    [INDUSTRY_SECTORS.ENERGY]: 5,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 3,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 2,
  },
  EMERGING_MARKETS: {
    [INDUSTRY_SECTORS.TECHNOLOGY]: 22,
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 22,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 13,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 9,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 8,
    [INDUSTRY_SECTORS.ENERGY]: 6,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 6,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 5,
    [INDUSTRY_SECTORS.HEALTHCARE]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 3,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 2,
  },
  EUROPE: {
    [INDUSTRY_SECTORS.FINANCIAL_SERVICES]: 18,
    [INDUSTRY_SECTORS.INDUSTRIALS]: 16,
    [INDUSTRY_SECTORS.HEALTHCARE]: 15,
    [INDUSTRY_SECTORS.CONSUMER_DEFENSIVE]: 10,
    [INDUSTRY_SECTORS.CONSUMER_CYCLICAL]: 10,
    [INDUSTRY_SECTORS.TECHNOLOGY]: 9,
    [INDUSTRY_SECTORS.BASIC_MATERIALS]: 7,
    [INDUSTRY_SECTORS.ENERGY]: 5,
    [INDUSTRY_SECTORS.COMMUNICATION_SERVICES]: 4,
    [INDUSTRY_SECTORS.UTILITIES]: 4,
    [INDUSTRY_SECTORS.REAL_ESTATE]: 2,
  },
} satisfies Record<string, SectorProfile>;

type IndexKey = keyof typeof INDEX_PROFILES;

/**
 * Ordered name patterns → index profile. Most specific first; the first match
 * wins. Broad "all-world / all-country" patterns are checked before the generic
 * "world" pattern so a developed-world fund isn't mistaken for all-world.
 */
const INDEX_PATTERNS: Array<{ regex: RegExp; index: IndexKey }> = [
  // US tech / growth (Nasdaq-100)
  { regex: /\b(nasdaq[- ]?100|qqq)\b/i, index: 'US_TECH_GROWTH' },

  // US small cap (check before generic US large cap)
  { regex: /\b(russell ?2000|s&p ?600|small[- ]?cap)\b/i, index: 'US_SMALL_CAP' },

  // US large cap / total US market
  {
    regex:
      /\b(s&p ?500|s&p500|sp500|russell ?(1000|3000)|dow jones (industrial|us)|us ?500|total (us|u\.s\.) ?(stock|market)|crsp us total|us total market|msci usa|us large)\b/i,
    index: 'US_LARGE_CAP',
  },

  // Global incl. emerging (all-world / all-country / ACWI)
  {
    regex:
      /\b(all[- ]?world|all[- ]?country|acwi|all cap|ftse global|total world|global all|whole world)\b/i,
    index: 'ALL_WORLD',
  },

  // Emerging markets
  { regex: /\b(emerging markets?|emerging market|\bem\b|emim|developing markets?)\b/i, index: 'EMERGING_MARKETS' },

  // Developed world (MSCI World, FTSE Developed, EAFE, World index)
  {
    regex: /\b(msci world|ftse developed|developed world|developed markets?|world index|world equity|eafe|world ex|\bworld\b)\b/i,
    index: 'DEVELOPED_WORLD',
  },

  // Europe
  {
    regex:
      /\b(euro ?stoxx ?(50|600)?|stoxx ?(europe ?)?600|msci europe|ftse develop(ed)? europe|ftse europe|europe(an)? equity|stoxx europe)\b/i,
    index: 'EUROPE',
  },
];

function normalizeProfile(profile: SectorProfile): SectorWeight[] {
  const entries = Object.entries(profile).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0,
  );
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return [];
  return entries
    .map(([sector, w]) => ({ sector, weight: w / total }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Infer industry-sector weightings for a broad-market fund from its name.
 *
 * Returns normalized `SectorWeight[]` (fractions summing to 1) when the fund
 * name matches a known broad index, or `undefined` when no confident match is
 * found (e.g. single-country, bond, commodity, or sector-themed funds, which the
 * caller classifies through other heuristics).
 */
export function inferIndexSectorWeights(
  longName: string | undefined,
  shortName?: string,
): SectorWeight[] | undefined {
  const text = [longName, shortName].filter(Boolean).join(' ');
  if (!text) return undefined;

  // Funds that are explicitly bond / commodity / real-estate / single-sector are
  // not broad equity baskets — don't force an equity industry profile on them.
  if (/\b(bond|treasur(y|ies)|gilt|bund|fixed income|govt|sovereign|aggregate|gold|silver|commodit(y|ies)|crude|oil|reit|money market)\b/i.test(text)) {
    return undefined;
  }

  for (const { regex, index } of INDEX_PATTERNS) {
    if (regex.test(text)) {
      return normalizeProfile(INDEX_PROFILES[index]);
    }
  }
  return undefined;
}

export const _internal = { INDEX_PROFILES, INDEX_PATTERNS, normalizeProfile };
