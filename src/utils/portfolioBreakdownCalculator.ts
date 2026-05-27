/**
 * Portfolio Breakdown Calculator
 *
 * Pure functions to slice a portfolio across multiple dimensions:
 * currency, holding, sector, continent, region, market (exchange), ETF provider.
 *
 * For ETFs we expand sector exposure via Yahoo's `sectorWeightings` so a single
 * S&P 500 ETF contributes proportionally to Technology / Healthcare / etc.
 * Non-ticker assets (real estate, cash, vehicles, collectibles, art) are bucketed
 * by their asset-class label in dimensions where they can't be classified.
 */

import { Asset, AssetClass } from '../types/assetAllocation';
import {
  AssetMetadata,
  BreakdownDimension,
  BreakdownEntry,
  BreakdownResult,
} from '../types/portfolioBreakdown';
import { getContinent, getRegion } from './countryToRegion';
import { formatAssetName } from './allocationCalculator';

const GOLDEN_ANGLE_DEGREES = 137.5;

/** Stable color per asset class — mirrors `prepareAssetClassChartData`. */
const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  STOCKS: '#5568d4',
  BONDS: '#764ba2',
  CASH: '#4CAF50',
  CRYPTO: '#FF9800',
  REAL_ESTATE: '#9C27B0',
  COMMODITIES: '#FFC107',
  VEHICLE: '#607D8B',
  COLLECTIBLE: '#E91E63',
  ART: '#00BCD4',
};

function assetClassLabel(cls: AssetClass): string {
  return formatAssetName(cls);
}

/**
 * Filter assets the breakdown page should consider: anything not OFF and with
 * a positive value (matches what the user sees in the Asset Allocation table).
 */
export function selectActiveAssets(assets: Asset[]): Asset[] {
  return assets.filter(a => a.targetMode !== 'OFF' && a.currentValue > 0);
}

/** Sum currentValue across active assets. */
export function activePortfolioValue(assets: Asset[]): number {
  return selectActiveAssets(assets).reduce((sum, a) => sum + a.currentValue, 0);
}

// -- Bucket helpers ---------------------------------------------------------

interface BucketAccumulator {
  value: number;
  ticker?: string;
}

function addBucket(
  buckets: Map<string, BucketAccumulator>,
  label: string,
  value: number,
  ticker?: string,
): void {
  if (value <= 0) return;
  const existing = buckets.get(label);
  if (existing) {
    existing.value += value;
    // Keep first ticker as the representative one
  } else {
    buckets.set(label, { value, ticker });
  }
}

function bucketsToEntries(
  buckets: Map<string, BucketAccumulator>,
  totalValue: number,
  colorFor?: (label: string, index: number) => string,
): BreakdownEntry[] {
  const entries = [...buckets.entries()].map(([label, b], index) => {
    const percentage = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
    return {
      label,
      value: b.value,
      percentage,
      color: colorFor
        ? colorFor(label, index)
        : `hsl(${(index * GOLDEN_ANGLE_DEGREES) % 360}, 70%, 60%)`,
      ticker: b.ticker,
    };
  });

  // Sort by value desc for readability
  entries.sort((a, b) => b.value - a.value);
  // Re-assign colors based on final order if using golden-angle scheme
  if (!colorFor) {
    entries.forEach((e, i) => {
      e.color = `hsl(${(i * GOLDEN_ANGLE_DEGREES) % 360}, 70%, 60%)`;
    });
  }

  return entries;
}

// -- Dimension breakdowns ---------------------------------------------------

function byCurrency(assets: Asset[]): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();
  for (const a of assets) {
    const currency = a.originalCurrency || 'EUR';
    addBucket(buckets, currency, a.currentValue);
  }
  return buckets;
}

function byHolding(assets: Asset[]): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();
  for (const a of assets) {
    const label = a.name || a.ticker || assetClassLabel(a.assetClass);
    addBucket(buckets, label, a.currentValue, a.ticker || undefined);
  }
  return buckets;
}

function bySector(
  assets: Asset[],
  metadataByTicker: Record<string, AssetMetadata | undefined>,
): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();

  for (const a of assets) {
    const meta = a.ticker ? metadataByTicker[a.ticker.toUpperCase()] : undefined;
    const weights = meta?.sectorWeightings;

    if (weights && weights.length > 0) {
      // ETF / fund: distribute value across sectors using weights
      const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
      if (totalWeight > 0) {
        for (const w of weights) {
          const portion = (w.weight / totalWeight) * a.currentValue;
          addBucket(buckets, w.sector, portion);
        }
        continue;
      }
    }

    if (meta?.sector) {
      // Individual stock
      addBucket(buckets, meta.sector, a.currentValue);
      continue;
    }

    // Fallback: asset class label
    addBucket(buckets, assetClassLabel(a.assetClass), a.currentValue);
  }

  return buckets;
}

function byCountryDerived(
  assets: Asset[],
  metadataByTicker: Record<string, AssetMetadata | undefined>,
  derive: (country: string | undefined) => string,
): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();

  for (const a of assets) {
    const meta = a.ticker ? metadataByTicker[a.ticker.toUpperCase()] : undefined;
    if (meta?.country) {
      const label = derive(meta.country);
      addBucket(buckets, label, a.currentValue);
      continue;
    }
    // ETFs / non-classifiable: fall back to asset class label
    addBucket(buckets, assetClassLabel(a.assetClass), a.currentValue);
  }

  return buckets;
}

function byMarket(
  assets: Asset[],
  metadataByTicker: Record<string, AssetMetadata | undefined>,
): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();

  for (const a of assets) {
    const meta = a.ticker ? metadataByTicker[a.ticker.toUpperCase()] : undefined;
    const label = meta?.exchange || assetClassLabel(a.assetClass);
    addBucket(buckets, label, a.currentValue);
  }
  return buckets;
}

function byEtfProvider(
  assets: Asset[],
  metadataByTicker: Record<string, AssetMetadata | undefined>,
): Map<string, BucketAccumulator> {
  const buckets = new Map<string, BucketAccumulator>();

  for (const a of assets) {
    const meta = a.ticker ? metadataByTicker[a.ticker.toUpperCase()] : undefined;
    let label: string;
    if (meta?.fundFamily) {
      label = meta.fundFamily;
    } else if (meta?.quoteType === 'EQUITY') {
      label = 'Direct holding';
    } else {
      label = assetClassLabel(a.assetClass);
    }
    addBucket(buckets, label, a.currentValue);
  }
  return buckets;
}

// -- Entry point ------------------------------------------------------------

export interface ComputeBreakdownOptions {
  assets: Asset[];
  metadataByTicker: Record<string, AssetMetadata | undefined>;
  dimension: BreakdownDimension;
}

/**
 * Compute a single-dimension breakdown of a portfolio.
 *
 * Values are based on `asset.currentValue` (already converted to the user's
 * default currency upstream).
 */
export function computeBreakdown(opts: ComputeBreakdownOptions): BreakdownResult {
  const active = selectActiveAssets(opts.assets);
  const totalValue = active.reduce((s, a) => s + a.currentValue, 0);

  let buckets: Map<string, BucketAccumulator>;
  let colorFor: ((label: string, index: number) => string) | undefined;

  switch (opts.dimension) {
    case 'currency':
      buckets = byCurrency(active);
      break;
    case 'holding':
      buckets = byHolding(active);
      break;
    case 'sector':
      buckets = bySector(active, opts.metadataByTicker);
      break;
    case 'continent':
      buckets = byCountryDerived(active, opts.metadataByTicker, getContinent);
      break;
    case 'region':
      buckets = byCountryDerived(active, opts.metadataByTicker, getRegion);
      break;
    case 'market':
      buckets = byMarket(active, opts.metadataByTicker);
      break;
    case 'etfProvider':
      buckets = byEtfProvider(active, opts.metadataByTicker);
      // If a known asset class label happens to be the bucket key, color it
      // consistently with the existing asset-class palette.
      colorFor = (label: string, i: number) => {
        const knownClassEntry = (Object.keys(ASSET_CLASS_COLORS) as AssetClass[]).find(
          c => assetClassLabel(c) === label,
        );
        if (knownClassEntry) return ASSET_CLASS_COLORS[knownClassEntry];
        return `hsl(${(i * GOLDEN_ANGLE_DEGREES) % 360}, 70%, 60%)`;
      };
      break;
  }

  const unknownValue = buckets.get('Unknown')?.value ?? 0;
  const entries = bucketsToEntries(buckets, totalValue, colorFor);

  return {
    dimension: opts.dimension,
    entries,
    totalValue,
    unknownValue,
  };
}

/** Convenience: compute every dimension at once. */
export function computeAllBreakdowns(
  assets: Asset[],
  metadataByTicker: Record<string, AssetMetadata | undefined>,
): Record<BreakdownDimension, BreakdownResult> {
  const dims: BreakdownDimension[] = [
    'currency',
    'holding',
    'sector',
    'continent',
    'region',
    'market',
    'etfProvider',
  ];
  const out: Partial<Record<BreakdownDimension, BreakdownResult>> = {};
  for (const dim of dims) {
    out[dim] = computeBreakdown({ assets, metadataByTicker, dimension: dim });
  }
  return out as Record<BreakdownDimension, BreakdownResult>;
}

/** Tickers that we should fetch metadata for, given a set of assets. */
export function uniqueTickers(assets: Asset[]): string[] {
  const set = new Set<string>();
  for (const a of selectActiveAssets(assets)) {
    if (a.ticker && a.ticker.trim().length > 0) {
      set.add(a.ticker.trim().toUpperCase());
    }
  }
  return [...set];
}
