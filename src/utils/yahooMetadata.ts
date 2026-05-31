/**
 * Yahoo Finance metadata fetcher
 *
 * Fetches per-ticker metadata (sector, country, fund family, exchange, ...)
 * for the Portfolio Breakdown page.
 *
 * Goes through the shared rate-limited `yahooFetch` proxy and caches results
 * in localStorage for 7 days.
 *
 * Data sources (all anonymous — no crumb cookie required):
 *   - `/v1/finance/search` — sector / industry / exchange / quoteType / longName
 *   - For ETFs, the longName is run through `etfHeuristics` to extract a
 *     provider, region theme, and asset focus, since Yahoo's per-ETF holdings
 *     endpoint (`quoteSummary` with `topHoldings`) requires crumb auth which
 *     isn't available in a static browser app.
 *   - Stock country is derived from the ISIN prefix when stored on the asset.
 *
 * Why not `quoteSummary`?
 *   `https://query1.finance.yahoo.com/v10/finance/quoteSummary/<ticker>` now
 *   returns `{"finance":{"error":{"code":"Unauthorized","description":"Invalid Crumb"}}}`
 *   for unauthenticated callers, so we don't even attempt it.
 */

import { AssetMetadata, RegionWeight } from '../types/portfolioBreakdown';
import { yahooFetch, hasRateLimitCapacity, YahooRateLimitError } from './yahooProxy';
import { inferEtfInfo, isinToCountryCode } from './etfHeuristics';
import { logger } from './logger';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'fire-tools:asset-metadata:';
const CACHE_VERSION = 2; // bumped when fields/strategy change

interface CachedEntry {
  v: number;
  data: AssetMetadata;
  expiresAt: number;
}

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
    logger.error('yahoo-metadata', 'read-failed', 'failed to read asset metadata cache', { pii: { error: (err as Error)?.message } });
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
    logger.error('yahoo-metadata', 'write-failed', 'failed to write asset metadata cache', { pii: { error: (err as Error)?.message } });
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
    logger.error('yahoo-metadata', 'clear-failed', 'failed to clear asset metadata cache', { pii: { error: (err as Error)?.message } });
  }
}

// -- Yahoo response shape --------------------------------------------------

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    typeDisp?: string;
    exchange?: string;
    exchDisp?: string;
    sector?: string;
    sectorDisp?: string;
    industry?: string;
    industryDisp?: string;
  }>;
  count?: number;
}

// -- Public API ------------------------------------------------------------

export interface FetchMetadataOptions {
  /** Optional ISIN to derive country code from when Yahoo doesn't return one. */
  isin?: string;
}

/**
 * Fetch metadata for a single ticker. Returns cached data if fresh.
 *
 * Errors are surfaced in `error` rather than thrown so callers can keep
 * rendering with partial coverage.
 */
export async function fetchAssetMetadata(
  ticker: string,
  opts: FetchMetadataOptions = {},
): Promise<AssetMetadata> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) {
    return { ticker: '', fetchedAt: new Date().toISOString(), error: 'Empty ticker' };
  }

  const cached = readFromStorage(clean);
  if (cached) {
    if (!cached.country && opts.isin) {
      const code = isinToCountryCode(opts.isin);
      if (code) return { ...cached, country: code };
    }
    return cached;
  }

  if (!hasRateLimitCapacity()) {
    return {
      ticker: clean,
      fetchedAt: new Date().toISOString(),
      error: 'Yahoo Finance daily rate limit reached',
    };
  }

  try {
    const data = await yahooFetch<YahooSearchResponse>(
      `/v1/finance/search?q=${encodeURIComponent(clean)}&quotesCount=1&newsCount=0&enableFuzzyQuery=false&enableNavLinks=false`,
    );

    // Prefer an exact symbol match; Yahoo occasionally returns near-matches first.
    const quotes = data?.quotes ?? [];
    const match =
      quotes.find(q => (q.symbol || '').toUpperCase() === clean) ?? quotes[0];

    if (!match) {
      return {
        ticker: clean,
        fetchedAt: new Date().toISOString(),
        error: 'No data returned from Yahoo Finance search',
      };
    }

    const quoteType = match.quoteType?.toUpperCase();
    const meta: AssetMetadata = {
      ticker: clean,
      quoteType,
      longName: match.longname,
      shortName: match.shortname,
      exchange: match.exchDisp || match.exchange,
      sector: match.sectorDisp || match.sector,
      industry: match.industryDisp || match.industry,
      fetchedAt: new Date().toISOString(),
    };

    // ETFs: fill in provider / region theme / sector theme from the long name.
    if (quoteType === 'ETF' || quoteType === 'MUTUALFUND') {
      const etf = inferEtfInfo(match.longname, match.shortname);
      if (etf.provider) meta.fundFamily = etf.provider;
      if (etf.regionTheme) meta.country = etf.regionTheme; // used by continent/region
      if (!meta.sector && etf.sectorTheme) meta.sector = etf.sectorTheme;
      if (etf.regionTheme) {
        const regionWeightings: RegionWeight[] = [{ region: etf.regionTheme, weight: 1 }];
        meta.regionWeightings = regionWeightings;
      }
    }

    // Stocks: ISIN prefix → country code (Yahoo search doesn't return country).
    if (!meta.country && opts.isin) {
      const code = isinToCountryCode(opts.isin);
      if (code) meta.country = code;
    }

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
 * Fetch metadata for multiple tickers sequentially (respects the per-request
 * throttle in `yahooFetch`). Optional `isinByTicker` augments stock metadata
 * with ISIN-derived country.
 */
export async function fetchAssetMetadataBatch(
  tickers: string[],
  isinByTicker: Record<string, string | undefined> = {},
): Promise<Record<string, AssetMetadata>> {
  const unique = [
    ...new Set(tickers.filter(t => t && t.trim().length > 0).map(t => t.trim().toUpperCase())),
  ];

  const out: Record<string, AssetMetadata> = {};
  for (const ticker of unique) {
    out[ticker] = await fetchAssetMetadata(ticker, { isin: isinByTicker[ticker] });
  }
  return out;
}

export const _internal = {
  cacheKey,
  CACHE_PREFIX,
  CACHE_TTL_MS,
  CACHE_VERSION,
};

export type { RegionWeight };
