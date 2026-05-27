/**
 * Portfolio Breakdown Types
 *
 * Types used by the Portfolio Breakdown page to slice the *current* portfolio
 * across multiple dimensions (currency, sector, region, market, ETF provider, holding).
 */

import { SupportedCurrency } from './currency';

export type BreakdownDimension =
  | 'currency'
  | 'holding'
  | 'sector'
  | 'continent'
  | 'region'
  | 'market'
  | 'etfProvider';

/**
 * Sector weight as returned/normalized from Yahoo `topHoldings.sectorWeightings`.
 * Values are fractions in [0, 1].
 */
export interface SectorWeight {
  sector: string;
  weight: number;
}

/**
 * Region weight derived from ETF holdings or country exposure.
 * Values are fractions in [0, 1].
 */
export interface RegionWeight {
  region: string;
  weight: number;
}

/**
 * Metadata for a single ticker, derived from Yahoo `quoteSummary`.
 * All fields are optional because Yahoo coverage varies by instrument.
 */
export interface AssetMetadata {
  ticker: string;
  quoteType?: string; // EQUITY, ETF, MUTUALFUND, CRYPTOCURRENCY, INDEX
  longName?: string;
  shortName?: string;
  currency?: SupportedCurrency | string;
  exchange?: string; // Full exchange name (e.g., "NASDAQ Global Select")

  // Equity-specific
  sector?: string;
  industry?: string;
  country?: string; // Free-text from Yahoo (e.g., "United States")

  // Fund-specific
  fundFamily?: string; // ETF provider (e.g., "Vanguard", "iShares")
  category?: string;

  // Sector weights (for ETFs/mutual funds)
  sectorWeightings?: SectorWeight[];
  regionWeightings?: RegionWeight[];

  fetchedAt: string; // ISO timestamp
  error?: string;
}

/**
 * A single bucket in a breakdown (e.g., "Technology" sector with 23.4% of portfolio).
 */
export interface BreakdownEntry {
  /** Display label for the bucket (e.g., "Technology", "United States", "Vanguard"). */
  label: string;
  /** Absolute monetary value contributed to this bucket. */
  value: number;
  /** Fraction of total portfolio value (0-100). */
  percentage: number;
  /** Stable color for charts. */
  color?: string;
  /** Optional ticker fallback label, only meaningful for `holding` dimension. */
  ticker?: string;
}

/**
 * Result of a single-dimension breakdown for the whole portfolio.
 */
export interface BreakdownResult {
  dimension: BreakdownDimension;
  entries: BreakdownEntry[];
  totalValue: number;
  /** Value not classified into any specific bucket; bundled under "Unknown" / asset class label. */
  unknownValue: number;
}

/** Special label used when a non-ticker asset (real estate, cash, etc.) cannot be classified. */
export const UNCLASSIFIED_LABEL = 'Unknown';
