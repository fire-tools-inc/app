/**
 * FIRE Calculator Types
 */

/**
 * Supported FIRE variants.
 *
 * - standard: Classic FIRE — portfolio sustains fireAnnualExpenses at the desired withdrawal rate.
 * - lean:     Frugal FIRE — fireAnnualExpenses scaled down by leanExpenseMultiplier (smaller nest egg).
 * - fat:      Luxurious FIRE — fireAnnualExpenses scaled up by fatExpenseMultiplier (larger nest egg).
 * - barista:  Part-time work covers the gap; portfolio only funds (expenses - baristaAnnualIncome).
 * - coast:    Save enough today so the portfolio grows untouched to standard FIRE by coastTargetAge.
 */
export type FireType = 'standard' | 'lean' | 'barista' | 'coast' | 'fat';

export const FIRE_TYPES: readonly FireType[] = ['standard', 'lean', 'barista', 'coast', 'fat'] as const;

export interface CalculatorInputs {
  // Initial Values
  initialSavings: number;
  
  // Asset Allocation (must sum to 100)
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
  
  // Expenses
  currentAnnualExpenses: number;
  fireAnnualExpenses: number;
  
  // Income
  annualLaborIncome: number;
  laborIncomeGrowthRate: number;
  
  // Savings
  savingsRate: number;
  
  // FIRE Target
  desiredWithdrawalRate: number;
  yearsOfExpenses: number; // Years of expenses needed for FIRE (default: ~33.33, equivalent to 3% withdrawal rate)

  // FIRE Variant Selection
  fireType: FireType;
  leanExpenseMultiplier: number;   // Lean FIRE: scales fireAnnualExpenses (default 0.7 → 70% of expenses)
  fatExpenseMultiplier: number;    // Fat FIRE:  scales fireAnnualExpenses (default 2.0 → 200% of expenses)
  baristaAnnualIncome: number;     // Barista FIRE: part-time annual income covering part of expenses
  coastTargetAge: number;          // Coast FIRE: age at which the portfolio should reach standard FIRE target
  
  // Expected Returns
  expectedStockReturn: number;
  expectedBondReturn: number;
  expectedCashReturn: number; // typically negative (inflation)
  
  // Personal Info
  yearOfBirth: number;
  retirementAge: number;
  
  // Other Income
  statePensionIncome: number;
  privatePensionIncome: number;
  otherIncome: number;
  
  // Options
  stopWorkingAtFIRE: boolean;
  maxAge: number; // Maximum age for projections (default 100)
  useAssetAllocationValue: boolean; // When true, use asset allocation total as portfolio value
  useExpenseTrackerExpenses: boolean; // When true, calculate current expenses from last 12 months of expense tracker
  useExpenseTrackerIncome: boolean; // When true, calculate labor income from last 12 months of expense tracker
}

export interface YearProjection {
  year: number;
  age: number;
  laborIncome: number;
  investmentYield: number;
  totalIncome: number;
  expenses: number;
  netSavings: number;
  portfolioValue: number;
  fireTarget: number;
  isFIRE: boolean;
  // Additional income breakdown for chart display
  statePensionIncome: number;
  privatePensionIncome: number;
  otherIncome: number;
}

export interface CalculationResult {
  projections: YearProjection[];
  yearsToFIRE: number;
  fireTarget: number;
  finalPortfolioValue: number;
  fireType: FireType;
  effectiveFireExpenses: number; // Expenses used to derive fireTarget (after lean/fat scaling)
  validationErrors?: string[];
}

export interface MonteCarloInputs {
  numSimulations: number;
  stockVolatility: number;
  bondVolatility: number;
  blackSwanProbability: number;
  blackSwanImpact: number;
}

export interface MonteCarloResult {
  successCount: number;
  failureCount: number;
  successRate: number;
  medianYearsToFIRE: number;
  simulations: SimulationRun[];
}

/**
 * Failure reasons for Monte Carlo simulations
 */
export type SimulationFailureReason = 
  | 'portfolio_depleted'           // Portfolio dropped to <= 0
  | 'sequence_of_returns_risk'     // Bad returns in first 10 years post-FIRE
  | 'unsustainable_ending'         // Final portfolio < 50% of FIRE target
  | 'fire_too_late'                // FIRE achieved after retirement age
  | 'withdrawal_rate_breach'       // Required withdrawal rate > 6%
  | 'fire_lost'                    // Portfolio dropped below FIRE target and never recovered
  | 'forced_return_to_work'        // Portfolio dropped below 3 years of expenses
  | 'healthcare_expense_shock';    // Late-life expenses exceeded capacity

export interface SimulationRun {
  simulationId: number;
  success: boolean;
  yearsToFIRE: number | null;
  finalPortfolio: number;
  failureReasons?: SimulationFailureReason[];
}

/**
 * Yearly data for a single Monte Carlo simulation
 */
export interface SimulationYearData {
  year: number;
  age: number;
  stockReturn: number;
  bondReturn: number;
  cashReturn: number;
  simulatedInflation: number;  // Simulated inflation rate for this year
  portfolioReturn: number;
  isBlackSwan: boolean;
  expenses: number;
  laborIncome: number;
  totalIncome: number;
  portfolioValue: number;
  isFIREAchieved: boolean;
  withdrawalRate?: number;  // Current withdrawal rate if post-FIRE
}

/**
 * Detailed log entry for a single Monte Carlo simulation run
 */
export interface SimulationLogEntry {
  simulationId: number;
  timestamp: string;
  success: boolean;
  yearsToFIRE: number | null;
  finalPortfolio: number;
  yearlyData: SimulationYearData[];
  failureReasons?: SimulationFailureReason[];
}

/**
 * Result with optional detailed logs
 */
export interface MonteCarloResultWithLogs extends MonteCarloResult {
  logs: SimulationLogEntry[];
  fixedParameters: MonteCarloFixedParameters;
}

/**
 * Fixed parameters that are logged once (in the first log entry)
 */
export interface MonteCarloFixedParameters {
  initialSavings: number;
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
  currentAnnualExpenses: number;
  fireAnnualExpenses: number;
  annualLaborIncome: number;
  savingsRate: number;
  desiredWithdrawalRate: number;
  expectedStockReturn: number;
  expectedBondReturn: number;
  expectedCashReturn: number;
  numSimulations: number;
  stockVolatility: number;
  bondVolatility: number;
  blackSwanProbability: number;
  blackSwanImpact: number;
  stopWorkingAtFIRE: boolean;
}
