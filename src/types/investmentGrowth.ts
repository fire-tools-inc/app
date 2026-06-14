/**
 * Investment Growth Calculator Types
 * See: https://github.com/fire-tools-inc/app/issues/96
 */

export type ContributionFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface InvestmentGrowthInputs {
  startingAmount: number;
  // Asset allocation (must sum to 100)
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
  // Contributions
  contributionAmount: number;
  contributionFrequency: ContributionFrequency;
  // Expected nominal annual returns (%)
  expectedStockReturn: number;
  expectedBondReturn: number;
  expectedCashReturn: number;
  // Inflation rate (%)
  inflationRate: number;
  // Time horizon (years)
  years: number;
  // Optional: annual income for savings rate feedback
  annualIncome?: number;
}

export interface InvestmentGrowthYear {
  year: number; // 0 = start, 1..N
  contributions: number; // total contributions made this year
  cumulativeContributions: number;
  nominalValue: number; // end-of-year portfolio value (nominal)
  realValue: number; // inflation-adjusted (today's currency)
}

export interface InvestmentGrowthResult {
  yearly: InvestmentGrowthYear[];
  // Convenience totals at horizon
  finalNominalValue: number;
  finalRealValue: number;
  totalContributions: number;
  totalGrowth: number; // finalNominalValue - startingAmount - totalContributions
  weightedNominalReturn: number; // weighted annual return (%, nominal)
  realReturn: number; // (1+nom)/(1+inf) - 1, as % per year
  outperformsInflation: boolean;
  validationErrors: string[];
}

export type SavingsRateBand =
  | 'poor'
  | 'fair'
  | 'good'
  | 'excellent'
  | 'unrealistic'
  | 'none';

export interface SavingsRateFeedback {
  rate: number; // % of income contributed (annualized)
  band: SavingsRateBand;
  label: string;
  description: string;
}
