/**
 * Yahoo Finance metadata fetcher
 *
 * Fetches per-ticker metadata (sector, country, fund family, sector weightings…)
 * via Yahoo Finance `quoteSummary` endpoint and caches results in localStorage
 * with a 7-day TTL.
 *
 * Used by the Portfolio Breakdown page to slice the portfolio across multiple
 * dimensions. Goes through the shared `yahooFetch` so it respects the global
 * rate limit.
 */

import { AssetMetadata, SectorWeight, RegionWeight } from '../types/portfolioBreakdown';
import { yahooFetch, hasRateLimitCapacity, YahooRateLimitError } from './yahooProxy';

const MODULES = ['summaryProfile', 'fundProfile', 'topHoldings', 'quoteType'].join(',');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_PREFIX = 'fire-tools:asset-metadata:';
const CACHE_VERSION = 1;

interface CachedEntry {
  v: number;
  data: AssetMetadata;
  expiresAt: number;
}

// In-memory mirror so we don't hit localStorage repeatedly within a session.
const memoryCache = new Map<string, AssetMetadata>();

function cacheKey(ticker: string): string {
  return `${CACHE_PREFIX}${ticker.toUpperCase()}`;
}

function readFromStorage(ticker: string): AssetMetadata | null {
  const mem = memoryCache.get(ticker.toUpperCase());
  if (mem) return mem;

  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    return null;
  }

  try {
    const raw = localStorage.getItem(cacheKey(ticker));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed.v !== CACHE_VERSION) return null;
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(cacheKey(ticker));
      return null;
    }

    memoryCache.set(ticker.toUpperCase(), parsed.data);
    return parsed.data;
  } catch (err) {
    console.error('Failed to read asset metadata cache', err);
    return null;
  }
}

function writeToStorage(ticker: string, data: AssetMetadata): void {
  memoryCache.set(ticker.toUpperCase(), data);
  if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
    return;
  }

  try {
    const entry: CachedEntry = {
      v: CACHE_VERSION,
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    localStorage.setItem(cacheKey(ticker), JSON.stringify(entry));
  } catch (err) {
    // Storage quota or privacy mode — non-fatal.
    console.error('Failed to write asset metadata cache', err);
  }
}

/** Clear all cached metadata (in-memory and localStorage). */
export function clearAssetMetadataCache(): void {
  memoryCache.clear();
  if (typeof localStorage === 'undefined' || typeof localStorage.key !== 'function') {
    return;
  }
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.error('Failed to clear asset metadata cache', err);
  }
}

// -- Yahoo response parsing -------------------------------------------------

interface YahooQuoteSummaryRaw {
  quoteSummary?: {
    result?: Array<{
      summaryProfile?: {
        sector?: string;
        industry?: string;
        country?: string;
      };
      fundProfile?: {
        family?: string;
        categoryName?: string;
        legalType?: string;
      };
      topHoldings?: {
        sectorWeightings?: Array<Record<string, { raw?: number } | number>>;
      };
      quoteType?: {
        quoteType?: string;
        longName?: string;
        shortName?: string;
        symbol?: string;
        exchange?: string;
        currency?: string;
      };
    }>;
    error?: { description?: string } | null;
  };
}

function normalizeSectorName(raw: string): string {
  // Yahoo returns keys like "realestate", "consumer_cyclical"
  const map: Record<string, string> = {
    realestate: 'Real Estate',
    consumer_cyclical: 'Consumer Cyclical',
    consumer_defensive: 'Consumer Defensive',
    basic_materials: 'Basic Materials',
    communication_services: 'Communication Services',
    financial_services: 'Financial Services',
    healthcare: 'Healthcare',
    industrials: 'Industrials',
    technology: 'Technology',
    energy: 'Energy',
    utilities: 'Utilities',
  };
  if (map[raw]) return map[raw];
  // Title-case fallback
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function parseSectorWeightings(raw: YahooQuoteSummaryRaw): SectorWeight[] | undefined {
  const arr = raw?.quoteSummary?.result?.[0]?.topHoldings?.sectorWeightings;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;

  const result: SectorWeight[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    for (const [key, val] of Object.entries(item)) {
      let weight: number | undefined;
      if (typeof val === 'number') weight = val;
      else if (val && typeof val === 'object' && typeof val.raw === 'number') weight = val.raw;
      if (weight === undefined || isNaN(weight) || weight <= 0) continue;
      result.push({ sector: normalizeSectorName(key), weight });
    }
  }

  return result.length > 0 ? result : undefined;
}

function parseMetadata(ticker: string, raw: YahooQuoteSummaryRaw): AssetMetadata {
  const result = raw?.quoteSummary?.result?.[0];
  const summary = result?.summaryProfile;
  const fund = result?.fundProfile;
  const quote = result?.quoteType;

  return {
    ticker: ticker.toUpperCase(),
    quoteType: quote?.quoteType,
    longName: quote?.longName,
    shortName: quote?.shortName,
    currency: quote?.currency,
    exchange: quote?.exchange,
    sector: summary?.sector,
    industry: summary?.industry,
    country: summary?.country,
    fundFamily: fund?.family,
    category: fund?.categoryName,
    sectorWeightings: parseSectorWeightings(raw),
    regionWeightings: undefined, // Yahoo doesn't reliably expose region weights
    fetchedAt: new Date().toISOString(),
  };
}

// -- Public API -------------------------------------------------------------

/**
 * Fetch metadata for a single ticker. Returns cached data if fresh.
 *
 * Errors are returned in the `error` field rather than thrown, so callers can
 * keep rendering with partial coverage.
 */
export async function fetchAssetMetadata(ticker: string): Promise<AssetMetadata> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) {
    return { ticker: '', fetchedAt: new Date().toISOString(), error: 'Empty ticker' };
  }

  const cached = readFromStorage(clean);
  if (cached) return cached;

  if (!hasRateLimitCapacity()) {
    return {
      ticker: clean,
      fetchedAt: new Date().toISOString(),
      error: 'Yahoo Finance daily rate limit reached',
    };
  }

  try {
    const data = await yahooFetch<YahooQuoteSummaryRaw>(
      `/v10/finance/quoteSummary/${encodeURIComponent(clean)}?modules=${MODULES}`,
    );

    if (data?.quoteSummary?.error) {
      const desc = data.quoteSummary.error.description || 'Unknown error';
      return {
        ticker: clean,
        fetchedAt: new Date().toISOString(),
        error: `Yahoo Finance error: ${desc}`,
      };
    }

    if (!data?.quoteSummary?.result?.[0]) {
      return {
        ticker: clean,
        fetchedAt: new Date().toISOString(),
        error: 'No data returned from Yahoo Finance',
      };
    }

    const meta = parseMetadata(clean, data);
    writeToStorage(clean, meta);
    return meta;
  } catch (err) {
    const message =
      err instanceof YahooRateLimitError
        ? err.message
        : err instanceof Error
        ? err.message
        : 'Fetch failed';
    return {
      ticker: clean,
      fetchedAt: new Date().toISOString(),
      error: message,
    };
  }
}

/**
 * Fetch metadata for multiple tickers sequentially (to respect the per-request
 * throttle in `yahooFetch`). Returns a ticker → metadata map.
 */
export async function fetchAssetMetadataBatch(
  tickers: string[],
): Promise<Record<string, AssetMetadata>> {
  const unique = [
    ...new Set(tickers.filter(t => t && t.trim().length > 0).map(t => t.trim().toUpperCase())),
  ];

  const out: Record<string, AssetMetadata> = {};
  for (const ticker of unique) {
    out[ticker] = await fetchAssetMetadata(ticker);
  }
  return out;
}

// Re-exported for tests
export const _internal = {
  parseMetadata,
  parseSectorWeightings,
  normalizeSectorName,
  cacheKey,
  CACHE_PREFIX,
  CACHE_TTL_MS,
};

/** Region weight type is re-exported here so callers don't have to import the type file. */
export type { RegionWeight };
