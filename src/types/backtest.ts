import { AssetClass } from './assetAllocation';

export type AnnualReturnsByYear = Record<number, number>;

export interface BacktestAssetInput {
  id: string;
  name: string;
  assetClass: AssetClass;
  weight: number;
  ticker?: string;
  annualReturnsByYear?: AnnualReturnsByYear;
}

export interface BacktestAssetCoverage {
  assetId: string;
  assetName: string;
  ticker?: string;
  marketYears: number;
  assumptionYears: number;
}

export interface BacktestYearPoint {
  year: number;
  annualReturn: number;
  portfolioValue: number;
  drawdown: number;
  marketWeight: number;
  assumptionWeight: number;
}

export interface BacktestBestWorstYear {
  year: number;
  return: number;
}

export interface BacktestMetrics {
  cagr: number;
  totalReturn: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  bestYear: BacktestBestWorstYear;
  worstYear: BacktestBestWorstYear;
  finalValue: number;
}

export interface BacktestAssumptionProfile {
  expectedAnnualReturn: number;
  annualVolatility: number;
}

export type BacktestAssumptionProfiles = Record<AssetClass, BacktestAssumptionProfile>;

export interface PortfolioBacktestRequest {
  assets: BacktestAssetInput[];
  initialInvestment: number;
  lookbackYears: number;
  endYear?: number;
}

export interface PortfolioBacktestSuccess {
  ok: true;
  years: BacktestYearPoint[];
  metrics: BacktestMetrics;
  coverage: BacktestAssetCoverage[];
  assumptionsUsed: boolean;
  assumptionSource: string;
}

export interface PortfolioBacktestFailure {
  ok: false;
  error: string;
}

export type PortfolioBacktestResult = PortfolioBacktestSuccess | PortfolioBacktestFailure;
