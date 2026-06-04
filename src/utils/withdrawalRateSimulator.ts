/**
 * Withdrawal Rate Portfolio Longevity Simulator
 *
 * Simulates how long a retirement portfolio lasts under a given initial
 * withdrawal rate, following the Trinity Study convention: withdraw
 * `withdrawalRate * initialPortfolio` in year 1, then adjust that dollar
 * amount for inflation every subsequent year (constant real spending).
 *
 * Uses the same Box-Muller random return + black swan model as the FIRE
 * Monte Carlo simulator (see `monteCarlo.ts`) so results are directly
 * comparable.
 */

import { generateRandomReturn } from './monteCarlo';

export interface WithdrawalRateInputs {
  initialPortfolio: number;
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
  expectedStockReturn: number;
  expectedBondReturn: number;
  expectedCashReturn: number; // typically negative (= -inflation)
  stockVolatility: number;
  bondVolatility: number;
  blackSwanProbability: number; // % per year
  blackSwanImpact: number;      // negative %, applied to stocks
  retirementYears: number;       // horizon in years
  numSimulations: number;
}

export interface WithdrawalRateResult {
  withdrawalRate: number;        // % (e.g. 4 for 4%)
  successRate: number;           // % of runs where portfolio survived
  medianYearsLasted: number;     // median years before depletion (= retirementYears if survived)
  medianFinalPortfolio: number;  // median ending portfolio (nominal)
  percentile10FinalPortfolio: number;
  percentile90FinalPortfolio: number;
  numSimulations: number;
}

export interface WithdrawalRateSweepPoint extends WithdrawalRateResult {}

const DEFAULT_BLACK_SWAN_BOND_DAMPER = 2; // bonds get half the impact

function validateAllocation(inputs: WithdrawalRateInputs): string | null {
  const sum = inputs.stocksPercent + inputs.bondsPercent + inputs.cashPercent;
  if (Math.abs(sum - 100) > 0.01) {
    return `Asset allocation must sum to 100% (got ${sum.toFixed(2)}%)`;
  }
  if (inputs.initialPortfolio <= 0) return 'initialPortfolio must be greater than 0';
  if (inputs.retirementYears <= 0) return 'retirementYears must be greater than 0';
  if (inputs.numSimulations <= 0) return 'numSimulations must be greater than 0';
  return null;
}

interface SingleRunOutcome {
  survived: boolean;
  yearsLasted: number;
  finalPortfolio: number;
}

function runSingleLongevity(
  inputs: WithdrawalRateInputs,
  withdrawalRate: number,
): SingleRunOutcome {
  let portfolio = inputs.initialPortfolio;
  // Constant-real-dollar withdrawal: anchor to initial portfolio, inflate over time.
  const baseAnnualWithdrawal = inputs.initialPortfolio * (withdrawalRate / 100);
  let annualWithdrawal = baseAnnualWithdrawal;

  const baseInflationRate = Math.abs(inputs.expectedCashReturn) / 100;

  for (let year = 0; year < inputs.retirementYears; year++) {
    const isBlackSwan = Math.random() < inputs.blackSwanProbability / 100;

    const stockReturn = isBlackSwan
      ? inputs.blackSwanImpact / 100
      : generateRandomReturn(inputs.expectedStockReturn / 100, inputs.stockVolatility / 100);

    const bondReturn = isBlackSwan
      ? inputs.blackSwanImpact / 100 / DEFAULT_BLACK_SWAN_BOND_DAMPER
      : generateRandomReturn(inputs.expectedBondReturn / 100, inputs.bondVolatility / 100);

    // Inflation varies +/- 1% around the base rate (same model as monteCarlo.ts)
    const inflationDelta = (Math.random() * 2 - 1) / 100;
    const simulatedInflation = baseInflationRate + inflationDelta;
    const cashReturn = -simulatedInflation;

    const portfolioReturn =
      (inputs.stocksPercent / 100) * stockReturn +
      (inputs.bondsPercent / 100) * bondReturn +
      (inputs.cashPercent / 100) * cashReturn;

    // Withdraw at start of year, then apply returns to remainder.
    portfolio = portfolio - annualWithdrawal;
    if (portfolio <= 0) {
      return { survived: false, yearsLasted: year, finalPortfolio: 0 };
    }
    portfolio = portfolio * (1 + portfolioReturn);
    if (portfolio <= 0) {
      return { survived: false, yearsLasted: year + 1, finalPortfolio: 0 };
    }

    // Inflate next year's withdrawal
    annualWithdrawal = annualWithdrawal * (1 + simulatedInflation);
  }

  return {
    survived: true,
    yearsLasted: inputs.retirementYears,
    finalPortfolio: portfolio,
  };
}

function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 === 0
    ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2
    : sortedAsc[mid];
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(sortedAsc.length * p)));
  return sortedAsc[idx];
}

/**
 * Run portfolio longevity Monte Carlo for a single withdrawal rate.
 */
export function runWithdrawalRateSimulation(
  inputs: WithdrawalRateInputs,
  withdrawalRate: number,
): WithdrawalRateResult {
  const err = validateAllocation(inputs);
  if (err) throw new Error(err);
  if (withdrawalRate <= 0) throw new Error('withdrawalRate must be greater than 0');

  const years: number[] = [];
  const finals: number[] = [];
  let successCount = 0;

  for (let i = 0; i < inputs.numSimulations; i++) {
    const r = runSingleLongevity(inputs, withdrawalRate);
    years.push(r.yearsLasted);
    finals.push(r.finalPortfolio);
    if (r.survived) successCount++;
  }

  const yearsSorted = [...years].sort((a, b) => a - b);
  const finalsSorted = [...finals].sort((a, b) => a - b);

  return {
    withdrawalRate,
    successRate: (successCount / inputs.numSimulations) * 100,
    medianYearsLasted: median(yearsSorted),
    medianFinalPortfolio: median(finalsSorted),
    percentile10FinalPortfolio: percentile(finalsSorted, 0.1),
    percentile90FinalPortfolio: percentile(finalsSorted, 0.9),
    numSimulations: inputs.numSimulations,
  };
}

/**
 * Sweep withdrawal rates and return one result per rate for charting.
 */
export function runWithdrawalRateSweep(
  inputs: WithdrawalRateInputs,
  rates: number[],
): WithdrawalRateSweepPoint[] {
  return rates.map((rate) => runWithdrawalRateSimulation(inputs, rate));
}

/**
 * Generate a default range of withdrawal rates from min to max (inclusive)
 * with the given step. E.g. (2, 7, 0.5) -> [2, 2.5, 3, ..., 7].
 */
export function defaultWithdrawalRateRange(min = 2, max = 7, step = 0.5): number[] {
  const out: number[] = [];
  for (let r = min; r <= max + 1e-9; r += step) {
    out.push(Math.round(r * 100) / 100);
  }
  return out;
}
