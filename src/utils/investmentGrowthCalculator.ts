/**
 * Investment Growth Calculator
 *
 * Projects a portfolio's end value after N years, supporting:
 *  - A starting amount (optionally pulled from the asset allocation page)
 *  - Periodic contributions (monthly / quarterly / yearly)
 *  - Per-asset-class expected nominal returns blended by allocation
 *  - Inflation adjustment to surface real (today's currency) value
 *
 * Pure functions only — UI components own the I/O.
 */

import {
  ContributionFrequency,
  InvestmentGrowthInputs,
  InvestmentGrowthResult,
  InvestmentGrowthYear,
  SavingsRateBand,
  SavingsRateFeedback,
} from '../types/investmentGrowth';

export const FREQUENCY_PERIODS_PER_YEAR: Record<ContributionFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

const MAX_SAFE = Number.MAX_SAFE_INTEGER / 1000;

export function validateInputs(inputs: InvestmentGrowthInputs): string[] {
  const errors: string[] = [];
  const allocationSum = inputs.stocksPercent + inputs.bondsPercent + inputs.cashPercent;
  if (Math.abs(allocationSum - 100) > 0.01) {
    errors.push(`Asset allocation must sum to 100%, currently ${allocationSum.toFixed(2)}%`);
  }
  if (inputs.startingAmount < 0) errors.push('Starting amount cannot be negative');
  if (inputs.contributionAmount < 0) errors.push('Contribution amount cannot be negative');
  if (inputs.years < 0) errors.push('Time horizon cannot be negative');
  if (inputs.years > 100) errors.push('Time horizon must be 100 years or less');
  if (inputs.inflationRate < -50 || inputs.inflationRate > 100) {
    errors.push('Inflation rate must be between -50% and 100%');
  }
  if (
    inputs.startingAmount > MAX_SAFE ||
    inputs.contributionAmount > MAX_SAFE ||
    (inputs.annualIncome !== undefined && inputs.annualIncome > MAX_SAFE)
  ) {
    errors.push('Input values are too large for calculation');
  }
  return errors;
}

/**
 * Weighted annual nominal return (%) from allocation + per-class returns.
 */
export function weightedAnnualReturn(inputs: InvestmentGrowthInputs): number {
  return (
    (inputs.stocksPercent / 100) * inputs.expectedStockReturn +
    (inputs.bondsPercent / 100) * inputs.expectedBondReturn +
    (inputs.cashPercent / 100) * inputs.expectedCashReturn
  );
}

/**
 * Real annual return (%) given nominal return and inflation.
 * Fisher equation: (1 + r_real) = (1 + r_nom) / (1 + inflation)
 */
export function realAnnualReturn(nominalPercent: number, inflationPercent: number): number {
  const nom = nominalPercent / 100;
  const inf = inflationPercent / 100;
  if (1 + inf === 0) return 0;
  return ((1 + nom) / (1 + inf) - 1) * 100;
}

/**
 * Project investment growth year by year.
 *
 * Contributions are added at the end of each period, then the periodic return is
 * applied. We compound at the contribution frequency to mimic real-world DCA.
 */
export function calculateInvestmentGrowth(
  inputs: InvestmentGrowthInputs,
): InvestmentGrowthResult {
  const validationErrors = validateInputs(inputs);
  const weighted = weightedAnnualReturn(inputs);
  const real = realAnnualReturn(weighted, inputs.inflationRate);

  if (validationErrors.length > 0) {
    return {
      yearly: [],
      finalNominalValue: 0,
      finalRealValue: 0,
      totalContributions: 0,
      totalGrowth: 0,
      weightedNominalReturn: weighted,
      realReturn: real,
      outperformsInflation: weighted > inputs.inflationRate,
      validationErrors,
    };
  }

  const periods = FREQUENCY_PERIODS_PER_YEAR[inputs.contributionFrequency];
  // Convert annual nominal return to per-period rate
  const annualRate = weighted / 100;
  const periodRate = Math.pow(1 + annualRate, 1 / periods) - 1;
  const inflationRate = inputs.inflationRate / 100;

  const yearly: InvestmentGrowthYear[] = [];
  let portfolio = inputs.startingAmount;
  let cumulativeContrib = 0;

  // Year 0 snapshot
  yearly.push({
    year: 0,
    contributions: 0,
    cumulativeContributions: 0,
    nominalValue: portfolio,
    realValue: portfolio,
  });

  for (let y = 1; y <= inputs.years; y++) {
    let yearContrib = 0;
    for (let p = 0; p < periods; p++) {
      portfolio += inputs.contributionAmount;
      yearContrib += inputs.contributionAmount;
      portfolio *= 1 + periodRate;
    }
    cumulativeContrib += yearContrib;
    const inflationDiscount = Math.pow(1 + inflationRate, y);
    const realValue = inflationDiscount === 0 ? 0 : portfolio / inflationDiscount;
    yearly.push({
      year: y,
      contributions: yearContrib,
      cumulativeContributions: cumulativeContrib,
      nominalValue: portfolio,
      realValue,
    });
  }

  const last = yearly[yearly.length - 1];
  const finalNominalValue = last.nominalValue;
  const finalRealValue = last.realValue;
  const totalContributions = last.cumulativeContributions;
  const totalGrowth = finalNominalValue - inputs.startingAmount - totalContributions;

  return {
    yearly,
    finalNominalValue,
    finalRealValue,
    totalContributions,
    totalGrowth,
    weightedNominalReturn: weighted,
    realReturn: real,
    outperformsInflation: weighted > inputs.inflationRate,
    validationErrors,
  };
}

/**
 * Annualized contribution amount based on frequency.
 */
export function annualizedContribution(
  amount: number,
  frequency: ContributionFrequency,
): number {
  return amount * FREQUENCY_PERIODS_PER_YEAR[frequency];
}

/**
 * Classify a savings rate (% of income) into a band with feedback.
 * Bands per issue #96:
 *   ~10%: Poor
 *   ~20%: Fair (50/30/20 rule)
 *   ~30%: Good
 *   ~50%: Excellent
 *   ~60%+: Unrealistic, overly frugal
 */
export function classifySavingsRate(
  annualContribution: number,
  annualIncome: number | undefined,
): SavingsRateFeedback | null {
  if (!annualIncome || annualIncome <= 0) {
    return null;
  }
  const rate = (annualContribution / annualIncome) * 100;

  let band: SavingsRateBand;
  let label: string;
  let description: string;

  if (rate < 15) {
    band = 'poor';
    label = 'Poor';
    description = 'Below ~10% — most FIRE goals are out of reach at this rate. Consider trimming expenses or raising income.';
  } else if (rate < 25) {
    band = 'fair';
    label = 'Fair';
    description = 'Around 20% — aligns with the classic 50/30/20 rule. Decent baseline, but FIRE will take decades.';
  } else if (rate < 40) {
    band = 'good';
    label = 'Good';
    description = 'Around 30% — solid trajectory toward financial independence within a normal working life.';
  } else if (rate < 60) {
    band = 'excellent';
    label = 'Excellent';
    description = '~50% — aggressive FIRE pace, financial independence within 15–20 years is plausible.';
  } else {
    band = 'unrealistic';
    label = 'Unrealistic / overly frugal';
    description = '60%+ — sustainable for very few people. Double-check the income and contribution figures.';
  }

  return { rate, band, label, description };
}
