import type { Asset, ChartData } from '../types/assetAllocation';
import type { CalculatorInputs, FireType } from '../types/calculator';
import type { SupportedCurrency } from '../types/currency';
import type { ExpenseTrackerData, TransactionSummary } from '../types/expenseTracker';
import type { MonthlySnapshot, NetWorthTrackerData } from '../types/netWorthTracker';
import {
  calculateAssetClassSummaries,
  calculateFIREPortfolioData,
  calculateTotalValue,
  prepareAssetClassChartData,
} from './allocationCalculator';
import { loadSettings, type UserSettings } from './cookieSettings';
import {
  loadAssetAllocation,
  loadExpenseTrackerData,
  loadFireCalculatorInputs,
  loadNetWorthTrackerData,
} from './cookieStorage';
import { calculateTransactionSummary } from './expenseCalculator';
import { calculateFIRE } from './fireCalculator';
import { calculateMonthlyNetWorth, type MonthlyNetWorthResult } from './netWorthCalculator';

export interface DashboardSources {
  assets: Asset[] | null;
  netWorth: NetWorthTrackerData | null;
  cashflow: ExpenseTrackerData | null;
  inputs: CalculatorInputs | null;
  settings: UserSettings;
}

export interface DashboardNetWorthPoint extends MonthlyNetWorthResult {
  period: string;
}

export interface DashboardCashflowPoint extends TransactionSummary {
  period: string;
}

export interface DashboardFireSummary {
  target: number;
  portfolioValue: number;
  progress: number;
  remaining: number;
  yearsToFIRE: number;
  fireType: FireType;
  usesAllocation: boolean;
}

export interface DashboardData {
  settings: UserSettings;
  currentPeriod: string;
  netWorth: {
    latest: DashboardNetWorthPoint | null;
    history: DashboardNetWorthPoint[];
    change: number | null;
    currency: SupportedCurrency;
  };
  allocation: {
    total: number | null;
    chartData: ChartData[];
    hasNegativeBalances: boolean;
  };
  cashflow: {
    current: DashboardCashflowPoint | null;
    history: DashboardCashflowPoint[];
    currency: SupportedCurrency;
  };
  fire: DashboardFireSummary | null;
  firePlanInvalid: boolean;
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function hasSnapshotData(snapshot: MonthlySnapshot): boolean {
  return snapshot.isFrozen || [
    snapshot.assets, snapshot.cashEntries, snapshot.pensions,
    snapshot.operations, snapshot.debts ?? [], snapshot.taxes ?? [],
  ].some(entries => entries.length > 0);
}

export function formatDashboardMonth(period: string, language: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(language, {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function buildDashboardData(sources: DashboardSources, now = new Date()): DashboardData {
  const { settings, inputs } = sources;
  const currency = settings.currencySettings.defaultCurrency;
  const currentPeriod = periodKey(now.getFullYear(), now.getMonth() + 1);
  const history = (sources.netWorth?.years ?? [])
    .flatMap(year => year.months)
    .filter(snapshot => hasSnapshotData(snapshot) && periodKey(snapshot.year, snapshot.month) <= currentPeriod)
    .map(snapshot => ({
      period: periodKey(snapshot.year, snapshot.month),
      ...calculateMonthlyNetWorth(snapshot, {
        includePension: sources.netWorth?.settings?.showPensionInNetWorth ?? true,
      }),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const latest = history[history.length - 1] ?? null;
  const previous = history[history.length - 2];

  const activeAssets = sources.assets?.filter(asset => asset.targetMode !== 'OFF') ?? [];
  const portfolioTotal = calculateTotalValue(activeAssets);
  const classSummaries = calculateAssetClassSummaries(activeAssets, portfolioTotal, portfolioTotal);
  const positiveClassTotal = classSummaries.reduce((sum, summary) => sum + Math.max(0, summary.currentTotal), 0);
  const allocation = {
    total: sources.assets?.length ? portfolioTotal : null,
    chartData: prepareAssetClassChartData(classSummaries).map(entry => ({
      ...entry, percentage: (entry.value / positiveClassTotal) * 100,
    })),
    hasNegativeBalances: classSummaries.some(summary => summary.currentTotal < 0),
  };
  const cashflowHistory = (sources.cashflow?.years ?? [])
    .flatMap(year => year.months)
    .filter(month => (month.incomes.length > 0 || month.expenses.length > 0)
      && periodKey(month.year, month.month) <= currentPeriod)
    .map(month => ({
      period: periodKey(month.year, month.month),
      ...calculateTransactionSummary(month.incomes, month.expenses),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  let fire: DashboardFireSummary | null = null;
  let firePlanInvalid = false;
  if (inputs) {
    const firePortfolio = inputs.useAssetAllocationValue
      ? calculateFIREPortfolioData(sources.assets ?? [], settings)
      : undefined;
    const effectiveInputs = firePortfolio ? {
      ...inputs,
      initialSavings: firePortfolio.totalValue,
      stocksPercent: firePortfolio.stocksPercent,
      bondsPercent: firePortfolio.bondsPercent,
      cashPercent: firePortfolio.cashPercent,
    } : inputs;
    const result = calculateFIRE(effectiveInputs);
    firePlanInvalid = Boolean(result.validationErrors?.length);
    if (!firePlanInvalid) {
      fire = {
        target: result.fireTarget,
        portfolioValue: effectiveInputs.initialSavings,
        progress: result.fireTarget > 0 ? (effectiveInputs.initialSavings / result.fireTarget) * 100 : 100,
        remaining: Math.max(0, result.fireTarget - effectiveInputs.initialSavings),
        yearsToFIRE: result.yearsToFIRE,
        fireType: result.fireType,
        usesAllocation: Boolean(firePortfolio),
      };
    }
  }

  return {
    settings,
    currentPeriod,
    netWorth: {
      latest, history,
      change: latest && previous ? latest.netWorth - previous.netWorth : null,
      currency: sources.netWorth?.defaultCurrency ?? currency,
    },
    allocation,
    cashflow: {
      current: cashflowHistory.find(point => point.period === currentPeriod) ?? null,
      history: cashflowHistory.slice(-6),
      currency: sources.cashflow?.currency ?? currency,
    },
    fire,
    firePlanInvalid,
  };
}

export function loadDashboardData(): DashboardData {
  return buildDashboardData({
    assets: loadAssetAllocation().assets,
    netWorth: loadNetWorthTrackerData(),
    cashflow: loadExpenseTrackerData(),
    inputs: loadFireCalculatorInputs(),
    settings: loadSettings(),
  });
}
