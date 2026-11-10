/**
 * CSV Export/Import utilities for FIRE Calculator data
 */

import { CalculatorInputs, MonteCarloFixedParameters, SimulationLogEntry } from '../types/calculator';
import { Asset, AssetClass, AllocationMode } from '../types/assetAllocation';
import { NetWorthTrackerData } from '../types/netWorthTracker';
import type { QuestionnaireResults } from '../types/questionnaire';

/**
 * Export FIRE Calculator inputs to CSV format
 */
export function exportFireCalculatorToCSV(inputs: CalculatorInputs): string {
  const escapeCSV = (value: any): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [
    ['FIRE Calculator Data Export'],
    ['Generated', new Date().toISOString()],
    [],
    ['Field', 'Value'],
    ['Initial Savings', escapeCSV(inputs.initialSavings)],
    ['Stocks Percent', escapeCSV(inputs.stocksPercent)],
    ['Bonds Percent', escapeCSV(inputs.bondsPercent)],
    ['Cash Percent', escapeCSV(inputs.cashPercent)],
    ['Current Annual Expenses', escapeCSV(inputs.currentAnnualExpenses)],
    ['FIRE Annual Expenses', escapeCSV(inputs.fireAnnualExpenses)],
    ['Annual Labor Income', escapeCSV(inputs.annualLaborIncome)],
    ['Labor Income Growth Rate', escapeCSV(inputs.laborIncomeGrowthRate)],
    ['Savings Rate', escapeCSV(inputs.savingsRate)],
    ['Desired Withdrawal Rate', escapeCSV(inputs.desiredWithdrawalRate)],
    ['Years Of Expenses', escapeCSV(inputs.yearsOfExpenses)],
    ['FIRE Type', escapeCSV(inputs.fireType)],
    ['Lean Expense Multiplier', escapeCSV(inputs.leanExpenseMultiplier)],
    ['Fat Expense Multiplier', escapeCSV(inputs.fatExpenseMultiplier)],
    ['Barista Annual Income', escapeCSV(inputs.baristaAnnualIncome)],
    ['Coast Target Age', escapeCSV(inputs.coastTargetAge)],
    ['Expected Stock Return', escapeCSV(inputs.expectedStockReturn)],
    ['Expected Bond Return', escapeCSV(inputs.expectedBondReturn)],
    ['Expected Cash Return', escapeCSV(inputs.expectedCashReturn)],
    ['Year of Birth', escapeCSV(inputs.yearOfBirth)],
    ['Retirement Age', escapeCSV(inputs.retirementAge)],
    ['State Pension Income', escapeCSV(inputs.statePensionIncome)],
    ['Private Pension Income', escapeCSV(inputs.privatePensionIncome)],
    ['Other Income', escapeCSV(inputs.otherIncome)],
    ['Stop Working At FIRE', escapeCSV(inputs.stopWorkingAtFIRE)],
    ['Max Age', escapeCSV(inputs.maxAge)],
    ['Use Asset Allocation Value', escapeCSV(inputs.useAssetAllocationValue)],
    ['Use Expense Tracker Expenses', escapeCSV(inputs.useExpenseTrackerExpenses)],
    ['Use Expense Tracker Income', escapeCSV(inputs.useExpenseTrackerIncome)],
  ];

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Import FIRE Calculator inputs from CSV format
 */
export function importFireCalculatorFromCSV(csv: string): CalculatorInputs {
  const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
  const data: Record<string, any> = {};

  // Skip header lines and parse data
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header and metadata lines
    if (line.startsWith('FIRE Calculator') || line.startsWith('Generated') || line === 'Field,Value' || !line.includes(',')) {
      continue;
    }

    // Parse CSV line properly handling quoted values
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;
    
    const key = line.substring(0, commaIdx).trim();
    let value = line.substring(commaIdx + 1).trim();
    
    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }

    // Map field names to property names
    const fieldMap: Record<string, string> = {
      'Initial Savings': 'initialSavings',
      'Stocks Percent': 'stocksPercent',
      'Bonds Percent': 'bondsPercent',
      'Cash Percent': 'cashPercent',
      'Current Annual Expenses': 'currentAnnualExpenses',
      'FIRE Annual Expenses': 'fireAnnualExpenses',
      'Annual Labor Income': 'annualLaborIncome',
      'Labor Income Growth Rate': 'laborIncomeGrowthRate',
      'Savings Rate': 'savingsRate',
      'Desired Withdrawal Rate': 'desiredWithdrawalRate',
      'Years Of Expenses': 'yearsOfExpenses',
      'FIRE Type': 'fireType',
      'Lean Expense Multiplier': 'leanExpenseMultiplier',
      'Fat Expense Multiplier': 'fatExpenseMultiplier',
      'Barista Annual Income': 'baristaAnnualIncome',
      'Coast Target Age': 'coastTargetAge',
      'Expected Stock Return': 'expectedStockReturn',
      'Expected Bond Return': 'expectedBondReturn',
      'Expected Cash Return': 'expectedCashReturn',
      'Year of Birth': 'yearOfBirth',
      'Retirement Age': 'retirementAge',
      'State Pension Income': 'statePensionIncome',
      'Private Pension Income': 'privatePensionIncome',
      'Other Income': 'otherIncome',
      'Stop Working At FIRE': 'stopWorkingAtFIRE',
      'Max Age': 'maxAge',
      'Use Asset Allocation Value': 'useAssetAllocationValue',
      'Use Expense Tracker Expenses': 'useExpenseTrackerExpenses',
      'Use Expense Tracker Income': 'useExpenseTrackerIncome',
    };

    const propName = fieldMap[key];
    if (propName) {
      if (propName === 'stopWorkingAtFIRE' || propName === 'useAssetAllocationValue' || 
          propName === 'useExpenseTrackerExpenses' || propName === 'useExpenseTrackerIncome') {
        data[propName] = value.toLowerCase() === 'true';
      } else if (propName === 'fireType') {
        data[propName] = value;
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          data[propName] = numValue;
        }
      }
    }
  }

  // Validate required fields
  const required = [
    'initialSavings', 'stocksPercent', 'bondsPercent', 'cashPercent',
    'currentAnnualExpenses', 'fireAnnualExpenses', 'annualLaborIncome', 'yearOfBirth'
  ];

  for (const field of required) {
    if (data[field] === undefined) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return data as CalculatorInputs;
}

/**
 * Export Asset Allocation with metadata to CSV format
 */
export function exportAssetAllocationToCSV(
  assets: Asset[],
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>
): string {
  const escapeCSV = (value: any): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [
    ['Asset Allocation Export'],
    ['Generated', new Date().toISOString()],
    [],
    ['Asset Class Targets'],
    ['Asset Class', 'Target Mode', 'Target Percent'],
  ];

  // Add asset class targets
  Object.entries(assetClassTargets).forEach(([assetClass, target]) => {
    rows.push([
      escapeCSV(assetClass),
      escapeCSV(target.targetMode),
      escapeCSV(target.targetPercent?.toString() || ''),
    ]);
  });

  rows.push([]);
  rows.push(['Assets']);
  rows.push([
    'ID', 'Name', 'Ticker', 'ISIN', 'Asset Class', 'Sub Asset Type',
    'Current Value', 'Target Mode', 'Target Percent', 'Target Value',
    'Institution Code', 'Institution Name'
  ]);

  // Add assets
  assets.forEach(asset => {
    rows.push([
      escapeCSV(asset.id),
      escapeCSV(asset.name),
      escapeCSV(asset.ticker),
      escapeCSV(asset.isin || ''),
      escapeCSV(asset.assetClass),
      escapeCSV(asset.subAssetType),
      escapeCSV(asset.currentValue.toString()),
      escapeCSV(asset.targetMode),
      escapeCSV(asset.targetPercent?.toString() || ''),
      escapeCSV(asset.targetValue?.toString() || ''),
      escapeCSV(asset.institutionCode || ''),
      escapeCSV(asset.institutionName || ''),
    ]);
  });

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Import Asset Allocation from CSV format
 */
export function importAssetAllocationFromCSV(csv: string): {
  assets: Asset[];
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
} {
  const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
  const assets: Asset[] = [];
  const assetClassTargets: Record<string, { targetMode: AllocationMode; targetPercent?: number }> = {};

  let section: 'none' | 'targets' | 'assets' = 'none';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect sections
    if (line === 'Asset Class,Target Mode,Target Percent') {
      section = 'targets';
      continue;
    }
    if (line.startsWith('ID,Name,Ticker,ISIN')) {
      section = 'assets';
      continue;
    }

    // Skip headers and metadata
    if (line.startsWith('Asset Allocation') || line.startsWith('Generated') || 
        line === 'Asset Class Targets' || line === 'Assets') {
      continue;
    }

    // Parse asset class targets
    if (section === 'targets' && line.includes(',')) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const assetClass = parts[0].trim();
        const targetMode = parts[1].trim() as AllocationMode;
        const targetPercent = parts[2] ? parseFloat(parts[2].trim()) : undefined;

        if (assetClass && targetMode) {
          assetClassTargets[assetClass] = { targetMode, targetPercent };
        }
      }
    }

    // Parse assets
    if (section === 'assets' && line.includes(',')) {
      // Handle quoted fields (names with commas)
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      if (parts.length >= 7) {
        const asset: Asset = {
          id: parts[0],
          name: parts[1],
          ticker: parts[2],
          isin: parts[3] || undefined,
          assetClass: parts[4] as AssetClass,
          subAssetType: parts[5] as any,
          currentValue: parseFloat(parts[6]) || 0,
          targetMode: parts[7] as AllocationMode,
          targetPercent: parts[8] ? parseFloat(parts[8]) : undefined,
          targetValue: parts[9] ? parseFloat(parts[9]) : undefined,
          institutionCode: parts[10] || undefined,
          institutionName: parts[11] || undefined,
        };

        assets.push(asset);
      }
    }
  }

  if (assets.length === 0) {
    throw new Error('No assets found in CSV file');
  }

  // Validate asset class targets
  const validAssetClasses: AssetClass[] = ['STOCKS', 'BONDS', 'CASH', 'CRYPTO', 'REAL_ESTATE'];
  const validatedTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {} as Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
  
  for (const [key, value] of Object.entries(assetClassTargets)) {
    if (validAssetClasses.includes(key as AssetClass)) {
      validatedTargets[key as AssetClass] = value;
    }
  }

  return { assets, assetClassTargets: validatedTargets };
}

/**
 * Export Expense Tracker data to CSV format
 */
export { exportExpenseTrackerToCSV, importExpenseTrackerFromCSV } from './expenseCsv';

/**
 * Export Net Worth Tracker data to JSON format
 * Using JSON instead of CSV due to the complex nested structure
 */
export function exportNetWorthTrackerToJSON(data: NetWorthTrackerData): string {
  const exportData = {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    type: 'NetWorthTracker',
    data: data,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Import Net Worth Tracker data from JSON format
 */
export function importNetWorthTrackerFromJSON(json: string): NetWorthTrackerData {
  const parsed = JSON.parse(json);
  
  // Check if this is our export format or raw data
  if (parsed.type === 'NetWorthTracker' && parsed.data) {
    return parsed.data as NetWorthTrackerData;
  }
  
  // Assume it's raw data
  return parsed as NetWorthTrackerData;
}

/**
 * Export Questionnaire Results to CSV format
 */
export function exportQuestionnaireResultsToCSV(results: QuestionnaireResults): string {
  const escapeCSV = (value: any): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: string[][] = [
    ['FIRE Questionnaire Results Export'],
    ['Generated', new Date().toISOString()],
    ['Completed At', results.completedAt],
    [],
    ['Results Summary'],
    ['Field', 'Value'],
    ['FIRE Persona', results.persona],
    ['Risk Tolerance', results.riskTolerance],
    ['Safe Withdrawal Rate (%)', results.safeWithdrawalRate.toString()],
    ['Suggested Savings Rate (%)', results.suggestedSavingsRate.toString()],
    [],
    ['Persona Explanation'],
    [escapeCSV(results.personaExplanation)],
    [],
    ['Asset Allocation Targets'],
    ['Asset Class', 'Percentage'],
    ['Stocks', results.assetAllocation.stocks.toString()],
    ['Bonds', results.assetAllocation.bonds.toString()],
    ['Cash', results.assetAllocation.cash.toString()],
  ];

  if (results.assetAllocation.crypto !== undefined) {
    rows.push(['Crypto', results.assetAllocation.crypto.toString()]);
  }
  if (results.assetAllocation.realEstate !== undefined) {
    rows.push(['Real Estate', results.assetAllocation.realEstate.toString()]);
  }

  rows.push([]);
  rows.push(['Suitable Asset Types']);
  results.suitableAssets.forEach(asset => {
    rows.push([escapeCSV(asset)]);
  });

  rows.push([]);
  rows.push(['Questionnaire Responses']);
  rows.push(['Question ID', 'Selected Option']);
  results.responses.forEach(response => {
    rows.push([escapeCSV(response.questionId), escapeCSV(response.selectedOptionId)]);
  });

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Export Monte Carlo simulation logs to CSV format
 * Includes fixed parameters in header, then each simulation as rows with yearly data
 */
export function exportMonteCarloLogsToCSV(
  logs: SimulationLogEntry[],
  fixedParameters: MonteCarloFixedParameters
): string {
  const escapeCSV = (value: unknown): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: string[][] = [
    ['Monte Carlo Simulation Logs'],
    ['Generated', new Date().toISOString()],
    [],
    ['Fixed Parameters (apply to all simulations)'],
    ['Parameter', 'Value'],
    ['Initial Savings', escapeCSV(fixedParameters.initialSavings)],
    ['Stocks Percent', escapeCSV(fixedParameters.stocksPercent)],
    ['Bonds Percent', escapeCSV(fixedParameters.bondsPercent)],
    ['Cash Percent', escapeCSV(fixedParameters.cashPercent)],
    ['Current Annual Expenses', escapeCSV(fixedParameters.currentAnnualExpenses)],
    ['FIRE Annual Expenses', escapeCSV(fixedParameters.fireAnnualExpenses)],
    ['Annual Labor Income', escapeCSV(fixedParameters.annualLaborIncome)],
    ['Savings Rate', escapeCSV(fixedParameters.savingsRate)],
    ['Desired Withdrawal Rate', escapeCSV(fixedParameters.desiredWithdrawalRate)],
    ['Expected Stock Return', escapeCSV(fixedParameters.expectedStockReturn)],
    ['Expected Bond Return', escapeCSV(fixedParameters.expectedBondReturn)],
    ['Expected Cash Return', escapeCSV(fixedParameters.expectedCashReturn)],
    ['Number of Simulations', escapeCSV(fixedParameters.numSimulations)],
    ['Stock Volatility', escapeCSV(fixedParameters.stockVolatility)],
    ['Bond Volatility', escapeCSV(fixedParameters.bondVolatility)],
    ['Black Swan Probability', escapeCSV(fixedParameters.blackSwanProbability)],
    ['Black Swan Impact', escapeCSV(fixedParameters.blackSwanImpact)],
    ['Stop Working at FIRE', escapeCSV(fixedParameters.stopWorkingAtFIRE)],
    [],
    ['Simulation Results Summary'],
    ['Simulation ID', 'Success', 'Years to FIRE', 'Final Portfolio', 'Timestamp'],
  ];

  // Add simulation summaries
  logs.forEach(log => {
    rows.push([
      escapeCSV(log.simulationId),
      escapeCSV(log.success),
      escapeCSV(log.yearsToFIRE ?? 'N/A'),
      escapeCSV(log.finalPortfolio.toFixed(2)),
      escapeCSV(log.timestamp),
    ]);
  });

  rows.push([]);
  rows.push(['Detailed Yearly Data']);
  rows.push([
    'Simulation ID',
    'Year',
    'Age',
    'Stock Return (%)',
    'Bond Return (%)',
    'Cash Return (%)',
    'Portfolio Return (%)',
    'Black Swan Event',
    'Expenses',
    'Labor Income',
    'Total Income',
    'Portfolio Value',
    'FIRE Achieved',
  ]);

  // Add yearly data for each simulation
  logs.forEach(log => {
    log.yearlyData.forEach(yearData => {
      rows.push([
        escapeCSV(log.simulationId),
        escapeCSV(yearData.year),
        escapeCSV(yearData.age),
        escapeCSV(yearData.stockReturn.toFixed(2)),
        escapeCSV(yearData.bondReturn.toFixed(2)),
        escapeCSV(yearData.cashReturn.toFixed(2)),
        escapeCSV(yearData.portfolioReturn.toFixed(2)),
        escapeCSV(yearData.isBlackSwan),
        escapeCSV(yearData.expenses.toFixed(2)),
        escapeCSV(yearData.laborIncome.toFixed(2)),
        escapeCSV(yearData.totalIncome.toFixed(2)),
        escapeCSV(yearData.portfolioValue.toFixed(2)),
        escapeCSV(yearData.isFIREAchieved),
      ]);
    });
  });

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Export Monte Carlo simulation logs to JSON format
 */
export function exportMonteCarloLogsToJSON(
  logs: SimulationLogEntry[],
  fixedParameters: MonteCarloFixedParameters
): string {
  const exportData = {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    type: 'MonteCarloSimulationLogs',
    fixedParameters,
    simulations: logs,
  };
  return JSON.stringify(exportData, null, 2);
}
