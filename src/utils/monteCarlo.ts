import { 
  CalculatorInputs, 
  MonteCarloInputs, 
  MonteCarloResult, 
  MonteCarloResultWithLogs,
  MonteCarloFixedParameters,
  SimulationRun,
  SimulationLogEntry,
  SimulationYearData,
  SimulationFailureReason
} from '../types/calculator';

// Cache for the second normal variate produced by the Box-Muller transform
let cachedNormal: number | null = null;

/**
 * Calculate statistics from simulation results
 */
function calculateSimulationStats(simulations: SimulationRun[]): {
  successCount: number;
  failureCount: number;
  successRate: number;
  medianYearsToFIRE: number;
} {
  const successCount = simulations.filter(s => s.success).length;
  const failureCount = simulations.length - successCount;
  const successRate = (successCount / simulations.length) * 100;
  
  // Calculate median years to FIRE for successful simulations
  const successfulYears = simulations
    .filter(s => s.yearsToFIRE !== null)
    .map(s => s.yearsToFIRE as number)
    .sort((a, b) => a - b);
  
  let medianYearsToFIRE = 0;
  if (successfulYears.length > 0) {
    const midIndex = Math.floor(successfulYears.length / 2);
    if (successfulYears.length % 2 === 0) {
      medianYearsToFIRE = (successfulYears[midIndex - 1] + successfulYears[midIndex]) / 2;
    } else {
      medianYearsToFIRE = successfulYears[midIndex];
    }
  }
  
  return { successCount, failureCount, successRate, medianYearsToFIRE };
}

/**
 * Generate a random return based on expected return and volatility.
 * Exported so other simulators (e.g. withdrawal rate longevity) can reuse
 * the same Box-Muller implementation and behave consistently.
 */
export function generateRandomReturn(expectedReturn: number, volatility: number): number {
  let z: number;

  if (cachedNormal !== null) {
    // Use the cached normal variate from the previous call
    z = cachedNormal;
    cachedNormal = null;
  } else {
    // Box-Muller transform for normal distribution
    // Ensure u1 is never 0 to avoid Math.log(0)
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();

    const radius = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;

    const z0 = radius * Math.cos(theta);
    const z1 = radius * Math.sin(theta);

    z = z0;
    // Cache the second independent normal variate for the next call
    cachedNormal = z1;
  }
  
  return expectedReturn + (volatility * z);
}

/**
 * Run a single Monte Carlo simulation
 * If captureLog is true, it will return detailed yearly data for logging
 */
function runSingleSimulation(
  inputs: CalculatorInputs,
  mcInputs: MonteCarloInputs,
  simulationId: number,
  captureLog: boolean = false
): SimulationRun & { logEntry?: SimulationLogEntry } {
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - inputs.yearOfBirth;
  
  // Validate asset allocation
  const allocationSum = inputs.stocksPercent + inputs.bondsPercent + inputs.cashPercent;
  if (Math.abs(allocationSum - 100) > 0.01) {
    throw new Error(`Asset allocation must sum to 100%, currently ${allocationSum.toFixed(2)}%`);
  }
  
  if (inputs.desiredWithdrawalRate <= 0) {
    throw new Error('desiredWithdrawalRate must be greater than 0');
  }
  
  const fireTarget = inputs.fireAnnualExpenses / (inputs.desiredWithdrawalRate / 100);
  
  let portfolioValue = inputs.initialSavings;
  let laborIncome = inputs.annualLaborIncome;
  let isFIREAchieved = false;
  let yearsToFIRE: number | null = null;
  let yearFIREAchieved: number | null = null;
  let ageFIREAchieved: number | null = null;
  
  // Track for failure criteria
  let fireLost = false;
  let fireRecovered = false;
  let sequenceOfReturnsRisk = false;
  let withdrawalRateBreach = false;
  let forcedReturnToWork = false;
  let healthcareExpenseShock = false;
  
  // Track portfolio at FIRE achievement for sequence of returns risk
  let portfolioAtFIRE: number | null = null;
  
  // Base inflation rate from cash return (typically negative, e.g., -2%)
  const baseInflationRate = Math.abs(inputs.expectedCashReturn) / 100;
  
  // Track expenses with inflation adjustment
  let currentExpenses = inputs.currentAnnualExpenses;
  let fireExpenses = inputs.fireAnnualExpenses;
  
  // Track cumulative inflation for real value calculation
  let cumulativeInflation = 1;
  
  // Collect yearly data for logging
  const yearlyData: SimulationYearData[] = [];
  
  const maxYears = Math.min(50, 100 - currentAge);
  
  for (let i = 0; i < maxYears; i++) {
    const year = currentYear + i;
    const age = currentAge + i;
    
    // Check for Black Swan event
    const isBlackSwan = Math.random() < (mcInputs.blackSwanProbability / 100);
    
    // Generate random returns
    const stockReturn = isBlackSwan ? 
      mcInputs.blackSwanImpact / 100 :
      generateRandomReturn(inputs.expectedStockReturn / 100, mcInputs.stockVolatility / 100);
    
    const bondReturn = isBlackSwan ?
      mcInputs.blackSwanImpact / 200 : // bonds less affected
      generateRandomReturn(inputs.expectedBondReturn / 100, mcInputs.bondVolatility / 100);
    
    // Vary inflation with +/- 1% delta from base rate
    const inflationDelta = (Math.random() * 2 - 1) / 100; // -1% to +1%
    const simulatedInflation = baseInflationRate + inflationDelta;
    
    const cashReturn = -simulatedInflation; // Cash return is negative of inflation
    
    // Calculate portfolio return
    const portfolioReturn = (
      (inputs.stocksPercent / 100) * stockReturn +
      (inputs.bondsPercent / 100) * bondReturn +
      (inputs.cashPercent / 100) * cashReturn
    );
    
    // Check if FIRE is achieved
    if (!isFIREAchieved && portfolioValue >= fireTarget) {
      isFIREAchieved = true;
      yearsToFIRE = i;
      yearFIREAchieved = year;
      ageFIREAchieved = age;
      portfolioAtFIRE = portfolioValue;
    }
    
    // Track if FIRE was lost and recovered
    if (isFIREAchieved && !fireLost && portfolioValue < fireTarget) {
      fireLost = true;
    }
    if (fireLost && portfolioValue >= fireTarget) {
      fireRecovered = true;
    }
    
    // If stopWorkingAtFIRE is enabled, stop working once FIRE is achieved.
    // Otherwise, keep working regardless of FIRE status.
    const isWorking = inputs.stopWorkingAtFIRE ? !isFIREAchieved : true;
    
    // Calculate investment yield
    const investmentYield = portfolioValue * portfolioReturn;
    
    // Calculate income
    const currentLaborIncome = isWorking ? laborIncome : 0;
    const pensionIncome = age >= inputs.retirementAge ? 
      inputs.statePensionIncome + inputs.privatePensionIncome : 0;
    const otherIncomeTotal = pensionIncome + inputs.otherIncome;
    const totalIncome = currentLaborIncome + investmentYield + otherIncomeTotal;
    
    // Calculate expenses with inflation adjustment
    // Healthcare expense shock: increase expenses by 30% after age 75
    let expenses = isFIREAchieved ? fireExpenses : currentExpenses;
    if (age >= 75) {
      expenses = expenses * 1.3; // 30% increase for healthcare costs
      if (isFIREAchieved && !isWorking && portfolioValue > 0) {
        const healthcareWithdrawalRate = (expenses / portfolioValue) * 100;
        if (healthcareWithdrawalRate > 8) {
          healthcareExpenseShock = true;
        }
      }
    }
    
    // Calculate current withdrawal rate if post-FIRE and not working
    let currentWithdrawalRate: number | undefined;
    if (isFIREAchieved && !isWorking && portfolioValue > 0) {
      currentWithdrawalRate = (expenses / portfolioValue) * 100;
      
      // Check for withdrawal rate breach (> 6%)
      if (currentWithdrawalRate > 6) {
        withdrawalRateBreach = true;
      }
      
      // Check for forced return to work (portfolio < 3 years of expenses)
      if (portfolioValue < expenses * 3) {
        forcedReturnToWork = true;
      }
    }
    
    // Sequence of returns risk: check first 10 years post-FIRE
    if (isFIREAchieved && yearFIREAchieved !== null && portfolioAtFIRE !== null) {
      const yearsPostFIRE = year - yearFIREAchieved;
      if (yearsPostFIRE > 0 && yearsPostFIRE <= 10) {
        // If portfolio drops below 50% of value at FIRE achievement
        if (portfolioValue < portfolioAtFIRE * 0.5) {
          sequenceOfReturnsRisk = true;
        }
      }
    }
    
    // Capture yearly data for logging if enabled
    if (captureLog) {
      yearlyData.push({
        year,
        age,
        stockReturn: stockReturn * 100, // Convert back to percentage for display
        bondReturn: bondReturn * 100,
        cashReturn: cashReturn * 100,
        simulatedInflation: simulatedInflation * 100,
        portfolioReturn: portfolioReturn * 100,
        isBlackSwan,
        expenses,
        laborIncome: currentLaborIncome,
        totalIncome,
        portfolioValue,
        isFIREAchieved,
        withdrawalRate: currentWithdrawalRate,
      });
    }
    
    // Calculate net change in portfolio
    let portfolioChange: number;
    if (isWorking) {
      // While working: save a percentage of labor income, plus all investment returns
      // The savings rate already accounts for expenses (if you save 30%, you spend 70%)
      const laborSavings = laborIncome * (inputs.savingsRate / 100);
      portfolioChange = laborSavings + investmentYield;
    } else {
      // Not working: live off portfolio (income - expenses, including investment returns)
      portfolioChange = totalIncome - expenses;
    }
    
    // Update portfolio
    portfolioValue = portfolioValue + portfolioChange;
    
    // Grow labor income
    if (isWorking) {
      laborIncome = laborIncome * (1 + inputs.laborIncomeGrowthRate / 100);
    }
    
    // Apply inflation to expenses for next year
    currentExpenses = currentExpenses * (1 + simulatedInflation);
    fireExpenses = fireExpenses * (1 + simulatedInflation);
    
    // Track cumulative inflation
    cumulativeInflation = cumulativeInflation * (1 + simulatedInflation);
    
    // Check for failure: portfolio depleted (<= 0)
    if (portfolioValue <= 0) {
      const failureReasons: SimulationFailureReason[] = ['portfolio_depleted'];
      
      const failureResult: SimulationRun & { logEntry?: SimulationLogEntry } = {
        simulationId,
        success: false,
        yearsToFIRE: null,
        finalPortfolio: 0,
        failureReasons,
      };
      
      if (captureLog) {
        failureResult.logEntry = {
          simulationId,
          timestamp: new Date().toISOString(),
          success: false,
          yearsToFIRE: null,
          finalPortfolio: 0,
          yearlyData,
          failureReasons,
        };
      }
      
      return failureResult;
    }
  }
  
  // Collect all failure reasons
  const failureReasons: SimulationFailureReason[] = [];
  
  // Check for unsustainable ending portfolio (< 50% of inflation-adjusted FIRE target)
  const inflationAdjustedFireTarget = (inputs.fireAnnualExpenses * cumulativeInflation) / (inputs.desiredWithdrawalRate / 100);
  if (portfolioValue < inflationAdjustedFireTarget * 0.5) {
    failureReasons.push('unsustainable_ending');
  }
  
  // Check if FIRE was achieved too late (after state pension age)
  if (isFIREAchieved && ageFIREAchieved !== null && ageFIREAchieved >= inputs.retirementAge) {
    failureReasons.push('fire_too_late');
  }
  
  // Check if FIRE was lost and never recovered
  if (fireLost && !fireRecovered) {
    failureReasons.push('fire_lost');
  }
  
  // Add other failure reasons if triggered
  if (sequenceOfReturnsRisk) {
    failureReasons.push('sequence_of_returns_risk');
  }
  if (withdrawalRateBreach) {
    failureReasons.push('withdrawal_rate_breach');
  }
  if (forcedReturnToWork) {
    failureReasons.push('forced_return_to_work');
  }
  if (healthcareExpenseShock) {
    failureReasons.push('healthcare_expense_shock');
  }
  
  // Determine success: 
  // 1. FIRE was achieved during simulation OR final portfolio >= inflation-adjusted FIRE target
  // 2. No critical failures
  const criticalFailures: SimulationFailureReason[] = [
    'portfolio_depleted',
    'fire_lost',
    'unsustainable_ending',
    'forced_return_to_work',
  ];
  
  const hasCriticalFailure = failureReasons.some(r => criticalFailures.includes(r));
  const finalFireTarget = fireExpenses / (inputs.desiredWithdrawalRate / 100);
  const isSuccess = (isFIREAchieved || portfolioValue >= finalFireTarget) && !hasCriticalFailure;
  
  // If FIRE wasn't achieved during simulation but final portfolio is sufficient,
  // mark yearsToFIRE as maxYears to indicate FIRE was reached at simulation end
  if (!isFIREAchieved && isSuccess) {
    yearsToFIRE = maxYears;
  }
  
  const result: SimulationRun & { logEntry?: SimulationLogEntry } = {
    simulationId,
    success: isSuccess,
    yearsToFIRE: isSuccess ? yearsToFIRE : null,
    finalPortfolio: portfolioValue,
    failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
  };
  
  if (captureLog) {
    result.logEntry = {
      simulationId,
      timestamp: new Date().toISOString(),
      success: isSuccess,
      yearsToFIRE: isSuccess ? yearsToFIRE : null,
      finalPortfolio: portfolioValue,
      yearlyData,
      failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
    };
  }
  
  return result;
}

/**
 * Run Monte Carlo simulations
 */
export function runMonteCarloSimulation(
  inputs: CalculatorInputs,
  mcInputs: MonteCarloInputs
): MonteCarloResult {
  const simulations: SimulationRun[] = [];
  
  for (let i = 0; i < mcInputs.numSimulations; i++) {
    const result = runSingleSimulation(inputs, mcInputs, i + 1);
    simulations.push(result);
  }
  
  const stats = calculateSimulationStats(simulations);
  
  return {
    ...stats,
    simulations,
  };
}

/**
 * Run Monte Carlo simulations with detailed logging
 */
export function runMonteCarloSimulationWithLogs(
  inputs: CalculatorInputs,
  mcInputs: MonteCarloInputs
): MonteCarloResultWithLogs {
  const simulations: SimulationRun[] = [];
  const logs: SimulationLogEntry[] = [];
  
  for (let i = 0; i < mcInputs.numSimulations; i++) {
    const result = runSingleSimulation(inputs, mcInputs, i + 1, true);
    simulations.push({
      simulationId: result.simulationId,
      success: result.success,
      yearsToFIRE: result.yearsToFIRE,
      finalPortfolio: result.finalPortfolio,
    });
    
    if (result.logEntry) {
      logs.push(result.logEntry);
    }
  }
  
  const stats = calculateSimulationStats(simulations);
  
  // Fixed parameters to include in exports
  const fixedParameters: MonteCarloFixedParameters = {
    initialSavings: inputs.initialSavings,
    stocksPercent: inputs.stocksPercent,
    bondsPercent: inputs.bondsPercent,
    cashPercent: inputs.cashPercent,
    currentAnnualExpenses: inputs.currentAnnualExpenses,
    fireAnnualExpenses: inputs.fireAnnualExpenses,
    annualLaborIncome: inputs.annualLaborIncome,
    savingsRate: inputs.savingsRate,
    desiredWithdrawalRate: inputs.desiredWithdrawalRate,
    expectedStockReturn: inputs.expectedStockReturn,
    expectedBondReturn: inputs.expectedBondReturn,
    expectedCashReturn: inputs.expectedCashReturn,
    numSimulations: mcInputs.numSimulations,
    stockVolatility: mcInputs.stockVolatility,
    bondVolatility: mcInputs.bondVolatility,
    blackSwanProbability: mcInputs.blackSwanProbability,
    blackSwanImpact: mcInputs.blackSwanImpact,
    stopWorkingAtFIRE: inputs.stopWorkingAtFIRE,
  };
  
  return {
    ...stats,
    simulations,
    logs,
    fixedParameters,
  };
}
