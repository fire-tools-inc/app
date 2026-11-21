/**
 * Applies a workbook import plan to the app's stores.
 *
 * Rules:
 * - Entries created by an import use ids starting with "wb-", so importing
 *   the same workbook again refreshes them instead of duplicating them.
 * - "keep" leaves months that contain user-entered data untouched.
 *   "replace" overwrites the Net Worth categories the workbook provides and,
 *   in the Expense Tracker, a month's income or expense list when the
 *   workbook has entries of that kind for the month.
 * - Operations, notes and categories the workbook does not provide survive.
 * - Commits are all-or-nothing: a failed write restores earlier stores.
 */

import type { Asset, AllocationMode, AssetClass } from '../types/assetAllocation';
import type { CalculatorInputs } from '../types/calculator';
import {
  createEmptyMonthData,
  createEmptyYearData,
  type ExpenseTrackerData,
} from '../types/expenseTracker';
import {
  createEmptyMonthlySnapshot,
  createEmptyNetWorthYearData,
  type MonthlySnapshot,
  type NetWorthTrackerData,
} from '../types/netWorthTracker';
import {
  clearAssetAllocation,
  clearExpenseTrackerData,
  clearFireCalculatorInputs,
  clearNetWorthTrackerData,
  saveAssetAllocation,
  saveExpenseTrackerData,
  saveFireCalculatorInputs,
  saveNetWorthTrackerData,
} from './cookieStorage';
import { DEFAULT_ASSET_CLASS_TARGETS, syncNetWorthToAssetAllocation } from './dataSync';
import { DEFAULT_INPUTS } from './defaults';
import { calculateYearsOfExpenses } from './fireCalculator';
import { logger } from './logger';
import { calculateMonthlyNetWorth } from './netWorthCalculator';
import {
  EXPENSE_WORKBOOK_ID_PREFIX,
  NET_WORTH_WORKBOOK_ID_PREFIX,
  OPERATIONS_WORKBOOK_ID_PREFIX,
  normalizeText,
  tickerKey,
  type WorkbookImportPlan,
  type WorkbookImportedMonth,
  type WorkbookTarget,
} from './workbookImport';

export type AssetClassTargets = Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
export type ExistingMonthPolicy = 'keep' | 'replace';

export interface WorkbookImportSelection {
  netWorth: boolean;
  cashflow: boolean;
  allocation: boolean;
  fire: boolean;
  existingMonths: ExistingMonthPolicy;
}

export interface WorkbookImportCurrentData {
  netWorth: NetWorthTrackerData | null;
  expenseTracker: ExpenseTrackerData | null;
  assets: Asset[] | null;
  assetClassTargets: AssetClassTargets | null;
  fireCalculator: CalculatorInputs | null;
}

export interface WorkbookImportPreview {
  balanceMonths: number;
  totalOnlyMonths: number;
  /** Net Worth months in the workbook that already contain user-entered entries. */
  conflictingMonths: number;
  /** Expense Tracker months where the workbook's incomes or expenses meet user-entered ones. */
  conflictingCashflowMonths: number;
  incomes: number;
  expenses: number;
  firstMonth: { year: number; month: number } | null;
  lastMonth: { year: number; month: number } | null;
  latestBalanceMonth: { year: number; month: number } | null;
}

export interface WorkbookImportSummary {
  monthsAdded: number;
  monthsReplaced: number;
  monthsKept: number;
  incomesImported: number;
  expensesImported: number;
  cashflowMonthsKept: number;
  allocationAssets: number;
  fireUpdated: boolean;
  latestMonth: { year: number; month: number } | null;
}

export interface WorkbookImportResult {
  netWorth?: NetWorthTrackerData;
  expenseTracker?: ExpenseTrackerData;
  assetAllocation?: { assets: Asset[]; assetClassTargets: AssetClassTargets };
  fireCalculator?: CalculatorInputs;
  summary: WorkbookImportSummary;
}

function isImported(entry: { id: string }): boolean {
  return entry.id.startsWith(NET_WORTH_WORKBOOK_ID_PREFIX);
}

/** Entries from the yearly expenses workbook: detailed, so they outrank monthly totals. */
function isExpenseWorkbookEntry(entry: { id: string }): boolean {
  return entry.id.startsWith(EXPENSE_WORKBOOK_ID_PREFIX);
}

function periodValue(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function snapshotHasUserData(snapshot: MonthlySnapshot): boolean {
  // Operations from the operations workbook are kept on refresh, so they do not block it.
  const operations = snapshot.operations.filter((op) => !op.id.startsWith(OPERATIONS_WORKBOOK_ID_PREFIX));
  return [
    snapshot.assets, snapshot.cashEntries, snapshot.pensions,
    snapshot.debts ?? [], snapshot.taxes ?? [], operations,
  ].some((entries) => entries.some((entry) => !isImported(entry)));
}

/** Latest month with a full breakdown, not later than `now`. */
function latestBalanceMonth(plan: WorkbookImportPlan, now: Date): WorkbookImportedMonth | null {
  const limit = periodValue(now.getFullYear(), now.getMonth() + 1);
  const candidates = plan.months.filter((month) => month.hasBalances && !month.totalOnly);
  const current = candidates.filter((month) => periodValue(month.year, month.month) <= limit);
  const pool = current.length ? current : candidates;
  return pool[pool.length - 1] ?? null;
}

function toSnapshot(month: WorkbookImportedMonth, isFrozen: boolean): MonthlySnapshot {
  return {
    ...createEmptyMonthlySnapshot(month.year, month.month),
    assets: structuredClone(month.assets),
    cashEntries: structuredClone(month.cashEntries),
    pensions: structuredClone(month.pensions),
    debts: structuredClone(month.debts),
    taxes: structuredClone(month.taxes),
    operations: structuredClone(month.operations),
    isFrozen,
    ...(month.note ? { monthNote: month.note } : {}),
  };
}

export function previewWorkbookImport(
  plan: WorkbookImportPlan,
  current: WorkbookImportCurrentData,
  now = new Date(),
): WorkbookImportPreview {
  const balanceMonths = plan.months.filter((month) => month.hasBalances);
  let conflictingMonths = 0;
  for (const month of balanceMonths) {
    const snapshot = current.netWorth?.years.find((year) => year.year === month.year)
      ?.months.find((item) => item.month === month.month);
    if (snapshot && snapshotHasUserData(snapshot)) conflictingMonths++;
  }
  let conflictingCashflowMonths = 0;
  for (const month of plan.months) {
    const monthData = current.expenseTracker?.years.find((year) => year.year === month.year)
      ?.months.find((item) => item.month === month.month);
    if (!monthData) continue;
    const incomeConflict = month.incomes.length > 0 && monthData.incomes.some((entry) => !isImported(entry));
    const expenseConflict = month.expenses.length > 0 && monthData.expenses.some((entry) => !isImported(entry));
    if (incomeConflict || expenseConflict) conflictingCashflowMonths++;
  }
  const first = plan.months[0];
  const last = plan.months[plan.months.length - 1];
  const latest = latestBalanceMonth(plan, now);
  return {
    balanceMonths: balanceMonths.filter((month) => !month.totalOnly).length,
    totalOnlyMonths: balanceMonths.filter((month) => month.totalOnly).length,
    conflictingMonths,
    conflictingCashflowMonths,
    incomes: plan.months.reduce((sum, month) => sum + month.incomes.length, 0),
    expenses: plan.months.reduce((sum, month) => sum + month.expenses.length, 0),
    firstMonth: first ? { year: first.year, month: first.month } : null,
    lastMonth: last ? { year: last.year, month: last.month } : null,
    latestBalanceMonth: latest ? { year: latest.year, month: latest.month } : null,
  };
}

function mergeNetWorth(
  plan: WorkbookImportPlan,
  current: NetWorthTrackerData | null,
  policy: ExistingMonthPolicy,
  now: Date,
  summary: WorkbookImportSummary,
): NetWorthTrackerData {
  const data: NetWorthTrackerData = current
    ? structuredClone(current)
    : {
      years: [],
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      defaultCurrency: plan.currency,
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
    };
  const provided = {
    assets: plan.months.some((month) => !month.totalOnly && month.assets.length > 0),
    cash: plan.months.some((month) => month.cashEntries.length > 0),
    pensions: plan.months.some((month) => month.pensions.length > 0),
    debts: plan.months.some((month) => month.debts.length > 0),
    taxes: plan.months.some((month) => month.taxes.length > 0),
  };
  const nowPeriod = periodValue(now.getFullYear(), now.getMonth() + 1);

  for (const month of plan.months) {
    if (!month.hasBalances) continue;
    const isPast = periodValue(month.year, month.month) < nowPeriod;
    let yearData = data.years.find((year) => year.year === month.year);
    if (!yearData) {
      yearData = createEmptyNetWorthYearData(month.year);
      data.years.push(yearData);
    }
    const existing = yearData.months.find((item) => item.month === month.month);
    if (!existing) {
      yearData.months.push(toSnapshot(month, isPast));
      summary.monthsAdded++;
      continue;
    }
    const hasUserData = snapshotHasUserData(existing);
    if (hasUserData && policy === 'keep') {
      summary.monthsKept++;
      continue;
    }
    const replaceAll = month.totalOnly || !hasUserData;
    if (replaceAll || provided.assets) existing.assets = structuredClone(month.assets);
    if (replaceAll || provided.cash) existing.cashEntries = structuredClone(month.cashEntries);
    if (replaceAll || provided.pensions) existing.pensions = structuredClone(month.pensions);
    if (replaceAll || provided.debts) existing.debts = structuredClone(month.debts);
    if (replaceAll || provided.taxes) existing.taxes = structuredClone(month.taxes);
    existing.operations = [...existing.operations.filter((op) => !isImported(op)), ...structuredClone(month.operations)];
    if (month.note) existing.monthNote = month.note;
    existing.isFrozen = existing.isFrozen || isPast;
    if (hasUserData) summary.monthsReplaced++;
    else summary.monthsAdded++;
  }

  data.years.sort((a, b) => a.year - b.year);
  for (const year of data.years) year.months.sort((a, b) => a.month - b.month);
  data.defaultCurrency = plan.currency;
  // Match the workbook's own totals, which may track pensions without counting them.
  if (plan.pensionsInNetWorth !== null) data.settings = { ...data.settings, showPensionInNetWorth: plan.pensionsInNetWorth };
  return data;
}

function mergeCashflow(
  plan: WorkbookImportPlan,
  current: ExpenseTrackerData | null,
  policy: ExistingMonthPolicy,
  now: Date,
  summary: WorkbookImportSummary,
): ExpenseTrackerData {
  const data: ExpenseTrackerData = current
    ? structuredClone(current)
    : {
      years: [],
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      currency: plan.currency,
      globalBudgets: [],
    };
  const keptMonths = new Set<string>();

  for (const month of plan.months) {
    if (month.incomes.length === 0 && month.expenses.length === 0) continue;
    let yearData = data.years.find((year) => year.year === month.year);
    if (!yearData) {
      yearData = createEmptyYearData(month.year);
      data.years.push(yearData);
    }
    let monthData = yearData.months.find((item) => item.month === month.month);
    if (!monthData) {
      monthData = createEmptyMonthData(month.year, month.month);
      yearData.months.push(monthData);
    }

    // Income totals from the expenses workbook give way to these detailed rows.
    const currentIncomes = monthData.incomes.filter((entry) => !isImported(entry));
    const userIncomes = currentIncomes.filter((entry) => !isExpenseWorkbookEntry(entry));
    if (month.incomes.length === 0) {
      monthData.incomes = currentIncomes;
    } else if (userIncomes.length > 0 && policy === 'keep') {
      monthData.incomes = currentIncomes;
      keptMonths.add(`${month.year}-${month.month}`);
    } else {
      monthData.incomes = policy === 'replace' ? structuredClone(month.incomes) : [...userIncomes, ...structuredClone(month.incomes)];
      summary.incomesImported += month.incomes.length;
    }

    // Detailed expenses from the expenses workbook always win over a monthly total.
    const userExpenses = monthData.expenses.filter((entry) => !isImported(entry));
    if (month.expenses.length === 0) {
      monthData.expenses = userExpenses;
    } else if (userExpenses.some(isExpenseWorkbookEntry) || (userExpenses.length > 0 && policy === 'keep')) {
      monthData.expenses = userExpenses;
      keptMonths.add(`${month.year}-${month.month}`);
    } else {
      monthData.expenses = policy === 'replace' ? structuredClone(month.expenses) : [...userExpenses, ...structuredClone(month.expenses)];
      summary.expensesImported += month.expenses.length;
    }
  }

  data.years.sort((a, b) => a.year - b.year);
  for (const year of data.years) year.months.sort((a, b) => a.month - b.month);
  summary.cashflowMonthsKept = keptMonths.size;
  return data;
}

function applyTarget(asset: Asset, target: WorkbookTarget): void {
  asset.targetMode = target.targetMode;
  asset.targetPercent = target.targetMode === 'PERCENTAGE' ? target.targetPercent : undefined;
  asset.targetValue = target.targetMode === 'SET' ? target.targetValue : undefined;
}

function assetKeys(asset: Asset, month: WorkbookImportedMonth | undefined): string[] {
  const keys = month?.holdingKeys[asset.id] ?? [];
  return [...keys, tickerKey(asset.ticker), `name:${normalizeText(asset.name)}`].filter(Boolean);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Asset Allocation from the latest imported month (or, without one, the
 * existing holdings) with the workbook's class, holding and cash targets.
 */
function buildAllocation(
  plan: WorkbookImportPlan,
  snapshot: MonthlySnapshot | undefined,
  importedMonth: WorkbookImportedMonth | undefined,
  current: WorkbookImportCurrentData,
): { assets: Asset[]; assetClassTargets: AssetClassTargets } {
  const assets = snapshot
    ? syncNetWorthToAssetAllocation({
      years: [{ year: snapshot.year, months: [snapshot] }],
      currentYear: snapshot.year,
      currentMonth: snapshot.month,
      defaultCurrency: plan.currency,
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
    })
    : structuredClone(current.assets ?? []);

  const previousTargets = new Map<string, Asset>();
  if (snapshot) {
    for (const asset of current.assets ?? []) {
      for (const key of assetKeys(asset, undefined)) if (!previousTargets.has(key)) previousTargets.set(key, asset);
    }
  }

  for (const asset of assets) {
    const keys = assetKeys(asset, importedMonth);
    const target = plan.allocation?.assetTargets.find((item) => item.keys.some((key) => keys.includes(key)));
    if (target) {
      applyTarget(asset, target);
      continue;
    }
    const previous = keys.map((key) => previousTargets.get(key)).find(Boolean);
    if (previous) applyTarget(asset, previous);
  }

  // Cash scopes (e.g. bank vs broker) share one class: fixed amounts make the
  // class SET; otherwise asset percentages are shares within the cash class.
  const cashTargets = plan.allocation?.cashTargets ?? [];
  const classIsSet = cashTargets.some((target) => target.targetMode === 'SET');
  const percentTotal = cashTargets
    .filter((target) => target.targetMode === 'PERCENTAGE')
    .reduce((sum, target) => sum + (target.targetPercent ?? 0), 0);
  const percentScopes = cashTargets.filter((target) => target.targetMode === 'PERCENTAGE').length;
  const investedTotal = assets
    .filter((asset) => asset.assetClass !== 'CASH')
    .reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0);
  for (const cashTarget of cashTargets) {
    const scoped = assets.filter((asset) => asset.assetClass === 'CASH' && (
      cashTarget.scope === 'all'
      || (cashTarget.scope === 'broker') === (asset.subAssetType === 'BROKERAGE_ACCOUNT')
    ));
    const total = scoped.reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0);
    for (const asset of scoped) {
      const share = total > 0 ? Math.max(0, asset.currentValue) / total : 1 / scoped.length;
      if (cashTarget.targetMode === 'OFF') {
        applyTarget(asset, { targetMode: 'OFF' });
      } else if (cashTarget.targetMode === 'SET') {
        applyTarget(asset, { targetMode: 'SET', targetValue: roundTo((cashTarget.targetValue ?? 0) * share, 2) });
      } else if (classIsSet) {
        const scopeValue = ((cashTarget.targetPercent ?? 0) / 100) * investedTotal;
        applyTarget(asset, { targetMode: 'SET', targetValue: roundTo(scopeValue * share, 2) });
      } else {
        const scopeShare = percentTotal > 0 ? (cashTarget.targetPercent ?? 0) / percentTotal : 1 / percentScopes;
        applyTarget(asset, { targetMode: 'PERCENTAGE', targetPercent: roundTo(scopeShare * share * 100, 4) });
      }
    }
  }

  const assetClassTargets: AssetClassTargets = structuredClone(current.assetClassTargets ?? DEFAULT_ASSET_CLASS_TARGETS);
  for (const [assetClass, target] of Object.entries(plan.allocation?.classTargets ?? {}) as Array<[AssetClass, WorkbookTarget]>) {
    assetClassTargets[assetClass] = target.targetMode === 'PERCENTAGE'
      ? { targetMode: 'PERCENTAGE', targetPercent: target.targetPercent }
      : { targetMode: target.targetMode };
  }
  return { assets, assetClassTargets };
}

/** Build the next store values without saving them. */
export function applyWorkbookImport(
  plan: WorkbookImportPlan,
  current: WorkbookImportCurrentData,
  selection: WorkbookImportSelection,
  now = new Date(),
): WorkbookImportResult {
  const summary: WorkbookImportSummary = {
    monthsAdded: 0, monthsReplaced: 0, monthsKept: 0, incomesImported: 0, expensesImported: 0,
    cashflowMonthsKept: 0, allocationAssets: 0, fireUpdated: false, latestMonth: null,
  };
  const result: WorkbookImportResult = { summary };
  const latest = latestBalanceMonth(plan, now);
  summary.latestMonth = latest ? { year: latest.year, month: latest.month } : null;

  if (selection.netWorth) {
    result.netWorth = mergeNetWorth(plan, current.netWorth, selection.existingMonths, now, summary);
  }
  if (selection.cashflow) {
    result.expenseTracker = mergeCashflow(plan, current.expenseTracker, selection.existingMonths, now, summary);
  }

  // The allocation mirrors the latest month as the Net Worth Tracker will show it.
  const latestSnapshot = latest
    ? result.netWorth?.years.find((year) => year.year === latest.year)?.months.find((month) => month.month === latest.month)
      ?? toSnapshot(latest, false)
    : undefined;

  if (selection.allocation && (latestSnapshot || plan.allocation)) {
    const allocation = buildAllocation(plan, latestSnapshot, latest ?? undefined, current);
    result.assetAllocation = allocation;
    summary.allocationAssets = allocation.assets.length;
    // Keep targets on the snapshot so later Net Worth -> Allocation syncs preserve them.
    const targetsById = new Map(allocation.assets.map((asset) => [asset.id, asset]));
    for (const entry of latestSnapshot ? [...latestSnapshot.assets, ...latestSnapshot.cashEntries] : []) {
      const asset = targetsById.get(entry.id);
      if (!asset) continue;
      entry.targetMode = asset.targetMode;
      entry.targetPercent = asset.targetPercent;
      entry.targetValue = asset.targetValue;
    }
  }

  if (selection.fire && (plan.fire || latestSnapshot)) {
    const inputs: CalculatorInputs = { ...(current.fireCalculator ?? DEFAULT_INPUTS) };
    if (plan.fire?.annualExpenses !== undefined) inputs.fireAnnualExpenses = plan.fire.annualExpenses;
    if (plan.fire?.withdrawalRate !== undefined) {
      inputs.desiredWithdrawalRate = plan.fire.withdrawalRate;
      inputs.yearsOfExpenses = calculateYearsOfExpenses(plan.fire.withdrawalRate);
    }
    if (latestSnapshot) {
      inputs.initialSavings = Math.round(calculateMonthlyNetWorth(latestSnapshot, { includePension: false }).netWorth * 100) / 100;
    }
    result.fireCalculator = inputs;
    summary.fireUpdated = true;
  }

  return result;
}

export interface WorkbookImportStorage {
  saveNetWorth: (data: NetWorthTrackerData) => void;
  clearNetWorth: () => void;
  saveExpenseTracker: (data: ExpenseTrackerData) => void;
  clearExpenseTracker: () => void;
  saveAssetAllocation: (assets: Asset[], targets: AssetClassTargets) => void;
  clearAssetAllocation: () => void;
  saveFireInputs: (inputs: CalculatorInputs) => void;
  clearFireInputs: () => void;
}

export const browserWorkbookImportStorage: WorkbookImportStorage = {
  saveNetWorth: saveNetWorthTrackerData,
  clearNetWorth: clearNetWorthTrackerData,
  saveExpenseTracker: saveExpenseTrackerData,
  clearExpenseTracker: clearExpenseTrackerData,
  saveAssetAllocation,
  clearAssetAllocation,
  saveFireInputs: saveFireCalculatorInputs,
  clearFireInputs: clearFireCalculatorInputs,
};

/** Save every changed store, restoring earlier stores if any write fails. */
export function commitWorkbookImport(
  result: WorkbookImportResult,
  previous: WorkbookImportCurrentData,
  storage: WorkbookImportStorage = browserWorkbookImportStorage,
): void {
  const undo: Array<() => void> = [];
  try {
    if (result.netWorth) {
      storage.saveNetWorth(result.netWorth);
      undo.push(() => (previous.netWorth ? storage.saveNetWorth(previous.netWorth) : storage.clearNetWorth()));
    }
    if (result.expenseTracker) {
      storage.saveExpenseTracker(result.expenseTracker);
      undo.push(() => (previous.expenseTracker ? storage.saveExpenseTracker(previous.expenseTracker) : storage.clearExpenseTracker()));
    }
    if (result.assetAllocation) {
      storage.saveAssetAllocation(result.assetAllocation.assets, result.assetAllocation.assetClassTargets);
      undo.push(() => (previous.assets && previous.assetClassTargets
        ? storage.saveAssetAllocation(previous.assets, previous.assetClassTargets)
        : storage.clearAssetAllocation()));
    }
    if (result.fireCalculator) {
      storage.saveFireInputs(result.fireCalculator);
      undo.push(() => (previous.fireCalculator ? storage.saveFireInputs(previous.fireCalculator) : storage.clearFireInputs()));
    }
  } catch (error) {
    for (const step of undo.reverse()) {
      try {
        step();
      } catch (rollbackError) {
        logger.error('workbook-import', 'rollback-failed', 'could not restore a store after a failed workbook import', {
          pii: { error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) },
        });
      }
    }
    throw error;
  }
}
