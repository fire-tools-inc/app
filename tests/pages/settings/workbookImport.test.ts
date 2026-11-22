import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { readXlsxWorkbook, shiftFormula, XlsxReadError } from '../../../src/utils/xlsxReader';
import { writeXlsxWorkbook, type XlsxWriteValue } from '../../../src/utils/xlsxWriter';
import {
  parseLocaleNumber,
  parseNetWorthWorkbook,
  reconcileWorkbookPlan,
  type WorkbookImportPlan,
} from '../../../src/utils/workbookImport';
import {
  applyWorkbookImport,
  commitWorkbookImport,
  previewWorkbookImport,
  type WorkbookImportCurrentData,
  type WorkbookImportSelection,
  type WorkbookImportStorage,
} from '../../../src/utils/workbookImportApply';
import { buildWorkbookTemplate, getWorkbookAgentPrompt } from '../../../src/utils/workbookTemplate';
import { createEmptyMonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import { createEmptyMonthData } from '../../../src/types/expenseTracker';
import { DEFAULT_FALLBACK_RATES } from '../../../src/types/currency';
import { expectDiagnostic } from '../../shared/diagnostics';

// All fixtures are fictional: invented tickers, institutions and amounts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OPTIONS = { targetCurrency: 'EUR' as const, fallbackRates: DEFAULT_FALLBACK_RATES };
const ALL: WorkbookImportSelection = { netWorth: true, cashflow: true, allocation: true, fire: true, existingMonths: 'keep' };
const EMPTY: WorkbookImportCurrentData = { netWorth: null, expenseTracker: null, assets: null, assetClassTargets: null, fireCalculator: null };
const NOW = new Date(2024, 2, 15);

const serial = (year: number, month: number) => (Date.UTC(year, month - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;

/** Row with label, name, currency, an unused previous-year column and Jan/Feb values. */
function legacyRow(label: string | null, name: string | null, currency: string | null, jan?: XlsxWriteValue, feb?: XlsxWriteValue): XlsxWriteValue[] {
  return [label, name, currency, null, jan ?? null, feb ?? null];
}

function legacyWorkbook(): Uint8Array {
  const yearSheet: XlsxWriteValue[][] = [
    ['Item type', 'Item', 'Curr', 'Prev', ...MONTHS, 'Year'],
    legacyRow('Assets', '(entered by hand)', null),
    legacyRow('ETFs', null, null),
    legacyRow(null, 'ALFA (World index)', 'EUR', { value: 1000, formula: 'E20*10' }, { value: 1010, formula: 'F20*10' }),
    legacyRow('pension pot', 'Fund units (global)', 'EUR', 500, 510),
    legacyRow('Single stocks', null, null),
    legacyRow(null, 'Subtotal', 'EUR', { value: 200, formula: 'SUM(E8:E8)/E21' }, { value: 200, formula: 'SUM(F8:F8)/F21' }),
    legacyRow(null, 'BETA', 'USD', 216, 220),
    legacyRow('Cash & liquid savings', null, null),
    legacyRow(null, 'Demo Bank', 'EUR', 1000, 1100),
    legacyRow(null, 'Demo Broker EUR', 'EUR', 50, '60,5'),
    legacyRow('Taxes', null, null),
    legacyRow(null, 'Tax due 2024', 'EUR', -100, -100),
    legacyRow('Valuables', null, null),
    legacyRow(null, 'Car', 'EUR', 3000, 2950),
    legacyRow('Net worth', '(auto calculated)', null),
    legacyRow('Net worth (EUR)', null, 'EUR', 5650, 5730.5),
    legacyRow(null, 'Net worth change', null, 0, 80.5),
    legacyRow('Prices', null, null),
    legacyRow(null, 'AMS:ALFX', 'EUR', 100, 101),
    legacyRow(null, 'EURUSD', null, 1.08, 1.1),
    legacyRow('Cash flow', null, null),
    legacyRow('Job', 'Net salary', 'EUR', 2000, 2000),
    legacyRow('Side work', 'Consulting workshops', '/', 300, 0),
    legacyRow('Taxes', null, null),
    legacyRow(null, 'Income tax settled', 'EUR', null, 150),
    legacyRow('Pensions', null, null),
    legacyRow('state', 'Public pension (old age)', 'EUR', { value: 4000, formula: 'D28' }, { value: 4000, formula: 'E28' }),
    legacyRow('work', 'Workplace fund', 'EUR', { value: 500, formula: 'SUM(E5:E5)' }, { value: 510, formula: 'SUM(F5:F5)' }),
    legacyRow('Summary', null, null),
    legacyRow(null, 'Total spending', 'EUR', 1500, 1600),
    legacyRow('FIRE targets', null, null),
    legacyRow(null, 'Target monthly spending', 'EUR', 2000, 2000),
    legacyRow(null, 'Desired withdrawal rate', '/', 0.035, 0.035),
    legacyRow('Constants', null, null),
    legacyRow(null, 'Year', 2024 as unknown as string),
  ];
  return writeXlsxWorkbook([
    { name: '2024', rows: yearSheet },
    {
      name: 'Net worth history',
      rows: [
        ['Month', 'EUR', 'USD', 'Notes'],
        [serial(2024, 1), 5650, 6102, 'Moved banks'],
        [serial(2023, 12), 5400, 5900, null],
        [serial(2023, 11), 5300, 5800, 'First entry'],
      ],
    },
    {
      name: 'Allocation targets',
      rows: [
        ['Target allocation', 2024],
        ['Group', 'Tickers', 'Share', null, null, null, null, 'Target'],
        ['Stocks', null, 0.8],
        ['Bonds', null, 0.2],
        ['Crypto', null, 'OFF'],
        ['Private Equities', null, 'OFF'],
        ['Cash at bank', null, 'SET', null, null, null, null, 1500],
        ['Cash at broker', null, 0],
        ['Total', null, 1],
        [],
        ['Stocks', 'Tickers', 'Share'],
        ['World index', 'ALFA', 1],
        ['Single stock', 'BETA', 'OFF'],
        ['Total Stocks'],
      ],
    },
    { name: 'Old income (deprecated)', rows: [['Type', 'Jan'], ['Salary', 1]] },
  ]);
}

function parseLegacy(): WorkbookImportPlan {
  return parseNetWorthWorkbook(readXlsxWorkbook(legacyWorkbook()), OPTIONS);
}

function monthOf(plan: WorkbookImportPlan, year: number, month: number) {
  const found = plan.months.find((item) => item.year === year && item.month === month);
  if (!found) throw new Error(`missing ${year}-${month}`);
  return found;
}

describe('xlsx reader', () => {
  it('rejects files that are not xlsx archives', () => {
    expect(() => readXlsxWorkbook(strToU8('Month,Net worth\n2024-01,1'))).toThrow(XlsxReadError);
  });

  it('expands shared formulas relative to their anchor cell', () => {
    const sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1"><f t="shared" ref="A1:B1" si="0">SUM(A3:A4)+$C$1</f><v>3</v></c><c r="B1"><f t="shared" si="0"/><v>4</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>0</v></c></row></sheetData></worksheet>';
    const bytes = zipSync({
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="1"/><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    });
    const workbook = readXlsxWorkbook(bytes);
    const [data] = workbook.sheets;
    expect(workbook.date1904).toBe(true);
    expect(data.rows.get(1)?.get(2)).toEqual({ value: 4, formula: 'SUM(B3:B4)+$C$1' });
    expect(data.rows.get(2)?.get(1)?.value).toBe('Rich text');
    expect(shiftFormula('IF(A1>0,"B2",LOG10(A1))', 1, 0)).toBe('IF(A2>0,"B2",LOG10(A2))');
  });

  it('parses numbers written with either decimal separator or a percent sign', () => {
    expect(parseLocaleNumber('111,48')).toBe(111.48);
    expect(parseLocaleNumber('1.234,56')).toBe(1234.56);
    expect(parseLocaleNumber('1,234.56')).toBe(1234.56);
    expect(parseLocaleNumber('€ -2,500')).toBe(-2500);
    expect(parseLocaleNumber('(120)')).toBe(-120);
    expect(parseLocaleNumber('3.5%')).toBeCloseTo(0.035);
    expect(parseLocaleNumber('n/a')).toBeNull();
  });
});

describe('month-column workbook parsing', () => {
  it('maps sections to balances, skips subtotals and matches the reported totals', () => {
    const plan = parseLegacy();
    expect(plan.yearSheets).toEqual(['2024']);
    expect(plan.historySheet).toBe('Net worth history');
    expect(plan.allocationSheet).toBe('Allocation targets');
    expect(plan.ignoredSheets).toEqual(['Old income (deprecated)']);

    const jan = monthOf(plan, 2024, 1);
    expect(jan.assets.map((asset) => [asset.name, asset.assetClass, asset.ticker, asset.shares, asset.pricePerShare])).toEqual([
      ['ALFA (World index)', 'ETF', 'ALFX.AS', 10, 100],
      ['Fund units (global)', 'ETF', '', 1, 500],
      ['BETA', 'STOCKS', '', 1, 200],
      ['Car', 'VEHICLE', '', 1, 3000],
    ]);
    expect(jan.cashEntries.map((entry) => [entry.accountName, entry.accountType, entry.balance])).toEqual([
      ['Demo Bank', 'CHECKING', 1000],
      ['Demo Broker EUR', 'BROKERAGE', 50],
    ]);
    expect(jan.taxes).toMatchObject([{ name: 'Tax due 2024', amount: 100, isPaid: false }]);
    expect(jan.pensions).toMatchObject([{ name: 'Public pension (old age)', pensionType: 'STATE', currentValue: 4000 }]);
    expect(jan.incomes.map((income) => [income.description, income.source, income.amount])).toEqual([
      ['Net salary', 'SALARY', 2000],
      ['Consulting workshops', 'FREELANCE', 300],
    ]);
    expect(jan.expenses).toMatchObject([{ amount: 1500, category: 'NO_CATEGORY' }]);
    expect(jan.note).toBe('Moved banks');

    const feb = monthOf(plan, 2024, 2);
    expect(feb.cashEntries[1].balance).toBe(60.5);
    expect(feb.operations).toMatchObject([{ type: 'TAX_PAID', amount: 150 }]);
    expect(feb.assets[0].acquisitionPrice).toBe(100);

    expect(plan.months.filter((month) => month.year === 2024 && month.hasBalances)).toHaveLength(2);
    expect(plan.months.filter((month) => month.totalOnly).map((month) => [month.year, month.month, month.reportedNetWorth, month.note]))
      .toEqual([[2023, 11, 5300, 'First entry'], [2023, 12, 5400, undefined]]);
    expect(plan.fire).toEqual({ annualExpenses: 24000, withdrawalRate: 3.5 });
    expect(reconcileWorkbookPlan(plan)).toEqual({ checked: 2, mismatches: [] });
    expect(plan.pensionsInNetWorth).toBe(false);
  });

  it('reads class, cash and ticker targets from the allocation sheet', () => {
    const { allocation } = parseLegacy();
    expect(allocation?.classTargets).toEqual({
      STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 80 },
      BONDS: { targetMode: 'PERCENTAGE', targetPercent: 20 },
      CRYPTO: { targetMode: 'OFF' },
      CASH: { targetMode: 'SET' },
    });
    expect(allocation?.cashTargets).toEqual([
      { scope: 'bank', targetMode: 'SET', targetValue: 1500 },
      { scope: 'broker', targetMode: 'PERCENTAGE', targetPercent: 0 },
    ]);
    expect(allocation?.assetTargets.map((target) => [target.keys[0], target.targetMode, target.targetPercent]))
      .toEqual([['ALFA', 'PERCENTAGE', 100], ['BETA', 'OFF', undefined]]);
  });

  it('converts with the app rates and reports it when a workbook has no exchange rate', () => {
    const bytes = writeXlsxWorkbook([{
      name: '2025',
      rows: [
        ['Category', 'Name', 'Ticker', 'Currency', ...MONTHS],
        ['Savings', 'Dollar account', null, 'USD', 100],
        ['Savings', 'Krona account', null, 'SEK', 100],
        ['Mystery', 'Unknown row', null, 'EUR', 5],
      ],
    }]);
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(bytes), OPTIONS);
    expect(plan.months[0].cashEntries).toMatchObject([{ accountName: 'Dollar account', balance: 85, accountType: 'SAVINGS' }]);
    expect(plan.warnings.map((warning) => warning.code).sort()).toEqual(['fallbackRate', 'unknownCategory', 'unsupportedCurrency']);
  });
});

describe('review regressions', () => {
  const templateSheet = (rows: XlsxWriteValue[][]) => writeXlsxWorkbook([{ name: '2025', rows: [['Category', 'Name', 'Ticker', 'Currency', ...MONTHS], ...rows] }]);

  it('imports template balances when the optional net worth check row is empty', () => {
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(templateSheet([
      ['Cash', 'Demo account', null, 'EUR', 100, 120],
      ['Net worth', null, null, 'EUR'],
    ])), OPTIONS);
    expect(plan.months.map((month) => [month.month, month.hasBalances, month.cashEntries.length])).toEqual([[1, true, 1], [2, true, 1]]);
  });

  it('does not mistake a transaction list for the history sheet', () => {
    const bytes = writeXlsxWorkbook([
      { name: '2025', rows: [['Category', 'Name', 'Ticker', 'Currency', ...MONTHS], ['Cash', 'Demo account', null, 'EUR', 100]] },
      { name: 'Transactions', rows: [['Date', 'Description', 'Amount'], ['2024-01-03', 'Coffee', 4.5], ['2024-02-01', 'Rent', 900]] },
    ]);
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(bytes), OPTIONS);
    expect(plan.historySheet).toBeNull();
    expect(plan.months.filter((month) => month.totalOnly)).toEqual([]);
  });

  it('keeps cash percentage targets as shares within the cash class', () => {
    const bytes = writeXlsxWorkbook([
      { name: '2025', rows: [
        ['Category', 'Name', 'Ticker', 'Currency', ...MONTHS],
        ['ETF', 'Demo fund', null, 'EUR', 9000],
        ['Cash', 'Demo bank', null, 'EUR', 600],
        ['Brokerage cash', 'Demo broker', null, 'EUR', 400],
      ] },
      { name: 'Allocation', rows: [
        ['Group', 'Tickers', 'Share'],
        ['Stocks', null, 0.9],
        ['Cash at bank', null, 0.06],
        ['Cash at broker', null, 0.04],
      ] },
    ]);
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(bytes), OPTIONS);
    expect(plan.allocation?.classTargets.CASH).toEqual({ targetMode: 'PERCENTAGE', targetPercent: 10 });
    const result = applyWorkbookImport(plan, EMPTY, ALL, new Date(2025, 5, 1));
    const cash = result.assetAllocation?.assets.filter((asset) => asset.assetClass === 'CASH') ?? [];
    expect(cash.map((asset) => [asset.name, asset.targetPercent])).toEqual([['Demo bank', 60], ['Demo broker', 40]]);
  });

  it('applies allocation targets to existing holdings when the workbook has no breakdown month', () => {
    const bytes = writeXlsxWorkbook([{ name: 'Allocation', rows: [
      ['Asset class', 'Ticker', 'Name', 'Target mode', 'Target %', 'Target amount'],
      ['Stocks', null, null, 'PERCENTAGE', 85],
      ['Stocks', 'DEMO-A', null, 'PERCENTAGE', 100],
    ] }]);
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(bytes), OPTIONS);
    const existing = [{ id: 'a1', name: 'Demo A', ticker: 'DEMO-A', assetClass: 'STOCKS' as const, subAssetType: 'ETF' as const, currentValue: 1000, targetMode: 'OFF' as const }];
    const result = applyWorkbookImport(plan, { ...EMPTY, assets: existing }, ALL, NOW);
    expect(result.assetAllocation?.assets).toMatchObject([{ id: 'a1', targetMode: 'PERCENTAGE', targetPercent: 100 }]);
    expect(result.assetAllocation?.assetClassTargets.STOCKS).toEqual({ targetMode: 'PERCENTAGE', targetPercent: 85 });
  });

  it('counts pensions in net worth only when the workbook totals do', () => {
    const workbook = (reported: number) => readXlsxWorkbook(writeXlsxWorkbook([{ name: '2024', rows: [
      ['Item type', 'Item', 'Curr', 'Prev', ...MONTHS, 'Year'],
      legacyRow('Cash & liquid savings', null, null),
      legacyRow(null, 'Demo Bank', 'EUR', 1000),
      legacyRow('Pensions', null, null),
      legacyRow('state', 'Public pension (old age)', 'EUR', 4000),
      legacyRow('Net worth', '(auto calculated)', null),
      legacyRow('Net worth (EUR)', null, 'EUR', reported),
    ] }]));
    const included = parseNetWorthWorkbook(workbook(5000), OPTIONS);
    expect(included.pensionsInNetWorth).toBe(true);
    const settings = { showPensionInNetWorth: false, includeUnrealizedGains: true };
    const current = { ...EMPTY, netWorth: { years: [], currentYear: 2024, currentMonth: 1, defaultCurrency: 'EUR' as const, settings } };
    expect(applyWorkbookImport(included, current, ALL, NOW).netWorth?.settings).toEqual({ ...settings, showPensionInNetWorth: true });
    expect(parseNetWorthWorkbook(workbook(1000), OPTIONS).pensionsInNetWorth).toBe(false);
  });

  it('counts cash-flow months that already contain user entries', () => {
    const plan = parseLegacy();
    const expenseTracker = {
      years: [{ year: 2024, months: [{ ...createEmptyMonthData(2024, 1), expenses: [
        { id: 'txn-user', type: 'expense' as const, date: '2024-01-04', amount: 30, description: 'Dinner', category: 'DINING_OUT', expenseType: 'WANT' as const },
      ] }] }],
      currentYear: 2024, currentMonth: 3, currency: 'EUR' as const, globalBudgets: [],
    };
    expect(previewWorkbookImport(plan, { ...EMPTY, expenseTracker }, NOW).conflictingCashflowMonths).toBe(1);
    const kept = applyWorkbookImport(plan, { ...EMPTY, expenseTracker }, ALL, NOW);
    expect(kept.summary.cashflowMonthsKept).toBe(1);
    expect(kept.expenseTracker?.years[0].months[0].expenses.map((entry) => entry.description)).toEqual(['Dinner']);
  });
});

describe('applying an import', () => {
  it('backfills every store from empty data', () => {
    const plan = parseLegacy();
    const result = applyWorkbookImport(plan, EMPTY, ALL, NOW);

    const years = result.netWorth?.years ?? [];
    expect(years.map((year) => [year.year, year.months.map((month) => [month.month, month.isFrozen])])).toEqual([
      [2023, [[11, true], [12, true]]],
      [2024, [[1, true], [2, true]]],
    ]);
    expect(result.summary).toMatchObject({ monthsAdded: 4, monthsKept: 0, incomesImported: 3, expensesImported: 2, latestMonth: { year: 2024, month: 2 } });
    // The workbook's totals leave its pension out, so the app must too.
    expect(result.netWorth?.settings.showPensionInNetWorth).toBe(false);

    const allocation = result.assetAllocation;
    const target = (name: string) => allocation?.assets.find((asset) => asset.name === name);
    expect(target('ALFA (World index)')).toMatchObject({ targetMode: 'PERCENTAGE', targetPercent: 100, shares: 10 });
    expect(target('BETA')).toMatchObject({ targetMode: 'OFF' });
    expect(target('Demo Bank')).toMatchObject({ targetMode: 'SET', targetValue: 1500 });
    // In a fixed-amount cash class, percentage scopes become amounts (0% -> 0).
    expect(target('Demo Broker EUR')).toMatchObject({ targetMode: 'SET', targetValue: 0 });
    expect(target('Car')).toBeUndefined();
    expect(allocation?.assetClassTargets.STOCKS).toEqual({ targetMode: 'PERCENTAGE', targetPercent: 80 });
    const feb = years[1].months[1];
    expect(feb.assets[0].targetPercent).toBe(100);

    expect(result.fireCalculator).toMatchObject({
      fireAnnualExpenses: 24000, desiredWithdrawalRate: 3.5, yearsOfExpenses: 28.57, initialSavings: 5730.5,
    });
    expect(result.expenseTracker?.years[0].months.map((month) => month.incomes.length)).toEqual([2, 1]);
  });

  it('is idempotent when the same workbook is imported again', () => {
    const plan = parseLegacy();
    const first = applyWorkbookImport(plan, EMPTY, ALL, NOW);
    const second = applyWorkbookImport(plan, {
      ...EMPTY, netWorth: first.netWorth ?? null, expenseTracker: first.expenseTracker ?? null,
    }, ALL, NOW);
    expect(second.netWorth).toEqual(first.netWorth);
    expect(second.expenseTracker).toEqual(first.expenseTracker);
  });

  it('keeps user months by default and replaces only provided categories on request', () => {
    const plan = parseLegacy();
    const userMonth = {
      ...createEmptyMonthlySnapshot(2024, 1),
      cashEntries: [{ id: 'nw-user-cash', accountName: 'Manual wallet', accountType: 'OTHER' as const, balance: 42, currency: 'EUR' as const }],
      debts: [{ id: 'nw-user-debt', name: 'Manual loan', debtType: 'OTHER' as const, currentBalance: 10, currency: 'EUR' as const }],
      operations: [{ id: 'nw-user-op', date: '2024-01-05', type: 'DIVIDEND' as const, description: 'Manual', amount: 5, currency: 'EUR' as const }],
      monthNote: 'mine',
    };
    const netWorth: NetWorthTrackerData = {
      years: [{ year: 2024, months: [userMonth] }], currentYear: 2024, currentMonth: 3, defaultCurrency: 'EUR',
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
    };
    const current = { ...EMPTY, netWorth };
    expect(previewWorkbookImport(plan, current, NOW).conflictingMonths).toBe(1);

    const kept = applyWorkbookImport(plan, current, ALL, NOW);
    expect(kept.netWorth?.years[1].months[0]).toEqual(userMonth);
    expect(kept.summary).toMatchObject({ monthsKept: 1, monthsAdded: 3 });

    // Only imported detailed months may change how pensions count in net worth.
    const februaryKept = { ...createEmptyMonthlySnapshot(2024, 2), cashEntries: userMonth.cashEntries };
    const allKept = applyWorkbookImport(plan, {
      ...current, netWorth: { ...netWorth, years: [{ year: 2024, months: [userMonth, februaryKept] }] },
    }, ALL, NOW);
    expect(allKept.summary).toMatchObject({ monthsKept: 2, monthsAdded: 2 });
    expect(allKept.netWorth?.settings.showPensionInNetWorth).toBe(true);

    const replaced = applyWorkbookImport(plan, current, { ...ALL, existingMonths: 'replace' }, NOW);
    const jan = replaced.netWorth?.years[1].months[0];
    expect(jan?.cashEntries.map((entry) => entry.accountName)).toEqual(['Demo Bank', 'Demo Broker EUR']);
    expect(jan?.debts).toEqual(userMonth.debts);
    expect(jan?.operations).toEqual(userMonth.operations);
    expect(jan?.monthNote).toBe('Moved banks');
    expect(replaced.summary.monthsReplaced).toBe(1);
  });

  it('restores earlier stores when a later write fails', () => {
    const plan = parseLegacy();
    const result = applyWorkbookImport(plan, EMPTY, ALL, NOW);
    const storage: WorkbookImportStorage = {
      saveNetWorth: vi.fn(), clearNetWorth: vi.fn(),
      saveExpenseTracker: vi.fn(() => { throw new Error('quota exceeded'); }), clearExpenseTracker: vi.fn(),
      saveAssetAllocation: vi.fn(), clearAssetAllocation: vi.fn(),
      saveFireInputs: vi.fn(), clearFireInputs: vi.fn(),
    };
    expect(() => commitWorkbookImport(result, EMPTY, storage)).toThrow('quota exceeded');
    expect(storage.saveNetWorth).toHaveBeenCalledTimes(1);
    expect(storage.clearNetWorth).toHaveBeenCalledTimes(1);
    expect(storage.saveAssetAllocation).not.toHaveBeenCalled();
  });

  it('logs and continues when a rollback step fails', () => {
    const result = applyWorkbookImport(parseLegacy(), EMPTY, { ...ALL, cashflow: false, allocation: false }, NOW);
    const storage: WorkbookImportStorage = {
      saveNetWorth: vi.fn(), clearNetWorth: vi.fn(() => { throw new Error('locked'); }),
      saveExpenseTracker: vi.fn(), clearExpenseTracker: vi.fn(),
      saveAssetAllocation: vi.fn(), clearAssetAllocation: vi.fn(),
      saveFireInputs: vi.fn(() => { throw new Error('cookies disabled'); }), clearFireInputs: vi.fn(),
    };
    expect(() => commitWorkbookImport(result, EMPTY, storage)).toThrow('cookies disabled');
    expectDiagnostic('error', 'could not restore a store after a failed workbook import');
  });
});

describe('workbook template', () => {
  it('produces a workbook whose example sheet imports with matching totals', () => {
    const workbook = readXlsxWorkbook(buildWorkbookTemplate({ year: 2026, currency: 'EUR' }));
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['README', 'Example', '2026', 'History', 'Allocation']);

    const untouched = parseNetWorthWorkbook(workbook, OPTIONS);
    expect(untouched.months).toEqual([]);
    expect(untouched.warnings).toEqual([]);
    expect(untouched.yearSheets).toEqual(['2026']);

    const example = workbook.sheets[1];
    const plan = parseNetWorthWorkbook({ ...workbook, sheets: [{ ...example, name: '2025' }] }, OPTIONS);
    expect(plan.months.filter((month) => month.hasBalances)).toHaveLength(12);
    expect(reconcileWorkbookPlan(plan)).toEqual({ checked: 12, mismatches: [] });
    const [etf, corp] = plan.months[0].assets;
    expect(etf).toMatchObject({ ticker: 'DEMO-GLB', shares: 100, pricePerShare: 90 });
    expect(corp).toMatchObject({ ticker: 'DEMO-CORP', shares: 10 });
    expect(plan.months[0].debts).toMatchObject([{ debtType: 'CAR_LOAN', currentBalance: 9000 }]);
    expect(plan.fire).toEqual({ annualExpenses: 30000, withdrawalRate: 3.5 });
    expect(plan.warnings).toEqual([]);
  });

  it('embeds the documented agent prompt in the README sheet', () => {
    const prompt = getWorkbookAgentPrompt();
    expect(prompt.startsWith('You are helping me build a Fire Tools net worth workbook')).toBe(true);
    const readme = readXlsxWorkbook(buildWorkbookTemplate({ year: 2026, currency: 'GBP' })).sheets[0];
    const text = [...readme.rows.values()].map((row) => row.get(1)?.value).join('\n');
    expect(text).toContain(prompt.split('\n')[0]);
  });
});
