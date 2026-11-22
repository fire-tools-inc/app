import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationsWorkbookImportDialog } from '../../../src/components/OperationsWorkbookImportDialog';
import { readXlsxWorkbook } from '../../../src/utils/xlsxReader';
import { writeXlsxWorkbook, type XlsxWriteValue } from '../../../src/utils/xlsxWriter';
import {
  applyOperationsImport,
  buildOperationsTemplate,
  getOperationsAgentPrompt,
  parseOperationsWorkbook,
  previewOperationsImport,
  type OperationsWorkbookPlan,
} from '../../../src/utils/operationsWorkbook';
import { applyWorkbookImport } from '../../../src/utils/workbookImportApply';
import { parseNetWorthWorkbook } from '../../../src/utils/workbookImport';
import {
  createEmptyMonthlySnapshot,
  type AssetHolding,
  type NetWorthTrackerData,
} from '../../../src/types/netWorthTracker';
import { DEFAULT_FALLBACK_RATES } from '../../../src/types/currency';

// Fictional securities, ISINs and amounts.
const OPTIONS = { targetCurrency: 'EUR' as const, fallbackRates: DEFAULT_FALLBACK_RATES };
const serial = (year: number, month: number, day: number) => (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;

function ledger(): Uint8Array {
  const rows: XlsxWriteValue[][] = [
    [null, null, null, 'Weekdays only', null, null, 'Auto'],
    ['ID', 'Security', 'Action', 'Date', 'ISIN ', 'Asset type', 'Currency', 'Ticker', 'Broker', 'Fee (buy)', 'Price (buy)', 'Fee (sell)', 'Price (sell)', 'Qty', 'Exchange', 'FX (buy)', 'FX (now)'],
    [{ value: 'T1', formula: 'CONCAT("T",ROW(A1))' }, 'Alfa World ETF', 'BUY', serial(2024, 1, 10), 'XX0000000011', 'ETF', 'EUR', 'ALFA', 'Demo Broker', 1, 100, 0, 0, 10, 'AMS', 1, 1],
    ['T2', 'Alfa World ETF', 'BUY', '15/02/2024', 'XX0000000011', 'ETF', 'EUR', 'ALFA', 'Demo Broker', 2, 110, 0, 0, 5, 'AMS', 1, 1],
    ['T3', 'Beta Corp', 'IPO_BUY', '20/02/2024', 'XX0000000022', 'Single Stock', 'USD', 'BETA', 'Demo Broker', 1, 50, 0, 0, 4, 'NASDAQ', 0.9, 0.92],
    ['T4', 'Alfa World ETF', 'SELL', '03/04/2024', 'XX0000000011', 'ETF', 'EUR', 'ALFA', 'Demo Broker', 0, 0, 1.5, 120, 3, 'AMS', 1, 1],
    ['T5', 'Gamma Fund', 'BUY', serial(2024, 6, 3), 'XX0000000033', 'ETF', 'EUR', 'GAMA', 'Demo Broker', 1, 20, 0, 0, 10, 'EPA', 1, 1],
    ['T6', 'Mystery', 'SWAP', serial(2024, 1, 5), null, null, 'EUR', 'MYST', 'Demo Broker', 0, 1, 0, 0, 1, null, 1, 1],
    ['T7', 'Beta Corp', 'BUY', serial(2024, 7, 1), null, 'Single Stock', 'USD', 'BETA', 'Demo Broker', 1, 55, 0, 0, 2, 'NASDAQ', 0.9, 0.92],
  ];
  return writeXlsxWorkbook([{ name: 'Operations', rows }, { name: 'Summary', rows: [['Total P/L']] }]);
}

function parse(): OperationsWorkbookPlan {
  return parseOperationsWorkbook(readXlsxWorkbook(ledger()), OPTIONS);
}

function holding(id: string, ticker: string, shares: number, price: number): AssetHolding {
  return { id, ticker, name: ticker, shares, pricePerShare: price, currency: 'EUR', assetClass: 'ETF' };
}

function netWorth(): NetWorthTrackerData {
  const month = (m: number, assets: AssetHolding[]) => ({ ...createEmptyMonthlySnapshot(2024, m), assets, isFrozen: true });
  return {
    years: [{ year: 2024, months: [
      month(1, [holding('h1', 'ALFA.AS', 10, 101)]),
      { ...month(2, [holding('h2', 'ALFA.AS', 15, 108), holding('h3', 'BETA', 4, 47)]),
        operations: [{ id: 'nw-user-op', date: '2024-02-01', type: 'DIVIDEND' as const, description: 'Manual dividend', amount: 3, currency: 'EUR' as const }] },
      month(4, [holding('h4', 'ALFA.AS', 12, 121), holding('h5', 'BETA', 4, 51)]),
    ] }],
    currentYear: 2024, currentMonth: 4, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
  };
}

describe('investment operations parsing', () => {
  it('reads the ledger below a notes row with buy and sell columns, dates and FX', () => {
    const plan = parse();
    expect(plan.sheets).toEqual(['Operations']);
    expect(plan.ignoredSheets).toEqual(['Summary']);
    expect(plan.operations.map((op) => [op.date, op.type, op.ticker, op.quantity, op.amount])).toEqual([
      ['2024-01-10', 'PURCHASE', 'ALFA', 10, 1001],
      ['2024-02-15', 'PURCHASE', 'ALFA', 5, 552],
      ['2024-02-20', 'PURCHASE', 'BETA', 4, 180.9],
      ['2024-04-03', 'SALE', 'ALFA', 3, 358.5],
      ['2024-06-03', 'PURCHASE', 'GAMA', 10, 201],
      ['2024-07-01', 'PURCHASE', 'BETA', 2, 99.9],
    ]);
    expect(plan.operations[5].isin).toBe('XX0000000022');
    expect(plan.operations[2]).toMatchObject({ isin: 'XX0000000022', nativeAmount: 201, currency: 'USD' });
    expect(plan.warnings.map((warning) => [warning.code, warning.row])).toEqual([['ambiguousDate', 6], ['unknownAction', 8]]);
  });
});

describe('applying investment operations', () => {
  it('records operations in existing months and derives average cost', () => {
    const plan = parse();
    expect(previewOperationsImport(plan, netWorth())).toMatchObject({ operations: 6, instruments: 3, withoutMonth: 2 });
    const result = applyOperationsImport(plan, { netWorth: netWorth(), assets: null }, { recordOperations: true, updateCostBasis: true });
    expect(result.summary).toMatchObject({ operationsImported: 4, operationsWithoutMonth: 2, holdingsUpdated: 5 });
    const [jan, feb, apr] = result.netWorth?.years[0].months ?? [];
    expect(jan.operations).toMatchObject([{ type: 'PURCHASE', amount: 1001, relatedAssetId: 'h1', description: 'BUY 10 × ALFA' }]);
    expect(feb.operations.map((op) => op.id)).toEqual(['nw-user-op', 'wbo-operations-4', 'wbo-operations-5']);
    expect(feb.operations[2].note).toContain('total 201 USD');
    expect(jan.assets[0]).toMatchObject({ acquisitionPrice: 100.1, isin: 'XX0000000011' });
    expect(feb.assets[0].acquisitionPrice).toBeCloseTo(103.5333, 4);
    expect(feb.assets[1].acquisitionPrice).toBeCloseTo(45.225, 4);
    expect(apr.assets[0].acquisitionPrice).toBeCloseTo(103.5333, 4);
    expect(apr.operations).toMatchObject([{ type: 'SALE', amount: 358.5 }]);

    const again = applyOperationsImport(plan, { netWorth: result.netWorth ?? null, assets: null }, { recordOperations: true, updateCostBasis: true });
    expect(again.netWorth).toEqual(result.netWorth);
  });

  it('updates Asset Allocation holdings only when quantities match', () => {
    const assets = [
      { id: 'a1', name: 'Alfa', ticker: 'ALFA', assetClass: 'STOCKS' as const, subAssetType: 'ETF' as const, currentValue: 1452, shares: 12, targetMode: 'OFF' as const },
      { id: 'a2', name: 'Gamma', ticker: 'GAMA', assetClass: 'STOCKS' as const, subAssetType: 'ETF' as const, currentValue: 500, shares: 25, targetMode: 'OFF' as const },
    ];
    const result = applyOperationsImport(parse(), { netWorth: null, assets }, { recordOperations: true, updateCostBasis: true });
    expect(result.summary).toMatchObject({ operationsWithoutMonth: 6, allocationAssetsUpdated: 1 });
    expect(result.assets?.[0]).toMatchObject({ isin: 'XX0000000011' });
    expect(result.assets?.[0].acquisitionPrice).toBeCloseTo(103.5333, 4);
    expect(result.assets?.[1].acquisitionPrice).toBeUndefined();
  });

  it('lets a net worth workbook refresh months that only hold imported operations', () => {
    const withOps = applyOperationsImport(parse(), { netWorth: netWorth(), assets: null }, { recordOperations: true, updateCostBasis: false }).netWorth;
    const jan = withOps?.years[0].months[0];
    if (!jan || !withOps) throw new Error('missing data');
    jan.assets = [];
    const book = writeXlsxWorkbook([{ name: '2024', rows: [
      ['Category', 'Name', 'Ticker', 'Currency', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      ['Cash', 'Demo account', null, 'EUR', 500],
    ] }]);
    const plan = parseNetWorthWorkbook(readXlsxWorkbook(book), OPTIONS);
    const empty = { expenseTracker: null, assets: null, assetClassTargets: null, fireCalculator: null };
    const result = applyWorkbookImport(plan, { ...empty, netWorth: withOps }, { netWorth: true, cashflow: false, allocation: false, fire: false, existingMonths: 'keep' }, new Date(2024, 5, 1));
    expect(result.summary.monthsKept).toBe(0);
    const refreshed = result.netWorth?.years[0].months[0];
    expect(refreshed?.cashEntries).toMatchObject([{ accountName: 'Demo account' }]);
    expect(refreshed?.operations.map((op) => op.id)).toEqual(['wbo-operations-3']);
  });
});

describe('investment operations review regressions', () => {
  const sheet = (rows: XlsxWriteValue[][]) => readXlsxWorkbook(writeXlsxWorkbook([{ name: 'Ledger', rows: [
    ['Date', 'Action', 'Ticker', 'Qty', 'Price', 'Fee', 'Net amount', 'Currency', 'FX rate'], ...rows,
  ] }]));

  it('keeps same-day row order, reads taxes on dividends as taxes and does not add fees to net amounts', () => {
    const filler = Array.from({ length: 7 }, (_, index) => [`2024-01-0${index + 1}`, 'DIVIDEND', 'ZETA', null, null, null, 1, 'EUR']);
    const plan = parseOperationsWorkbook(sheet([
      ['2024-01-10', 'BUY', 'ALFA', 10, 100, 1, 1001, 'EUR'],
      ...filler,
      ['2024-03-05', 'BUY', 'ALFA', 10, 200, 0, null, 'EUR'],
      ['2024-03-05', 'SELL', 'ALFA', 10, 210, 0, null, 'EUR'],
      ['2024-03-06', 'Dividend tax', 'ALFA', null, null, null, 1.5, 'EUR'],
    ]), OPTIONS);
    expect(plan.operations.find((op) => op.row === 2)?.amount).toBe(1001);
    expect(plan.operations.filter((op) => op.date === '2024-03-05').map((op) => op.row)).toEqual([10, 11]);
    expect(plan.operations[plan.operations.length - 1]).toMatchObject({ type: 'TAX_PAID', amount: 1.5 });
    const assets = [{ id: 'a', name: 'Alfa', ticker: 'ALFA', assetClass: 'STOCKS' as const, subAssetType: 'ETF' as const, currentValue: 2100, shares: 10, targetMode: 'OFF' as const }];
    const result = applyOperationsImport(plan, { netWorth: null, assets }, { recordOperations: false, updateCostBasis: true });
    expect(result.assets?.[0].acquisitionPrice).toBeCloseTo(150.05, 4);
  });

  it('writes average cost in the currency the holding is priced in', () => {
    const plan = parseOperationsWorkbook(sheet([['2024-01-10', 'BUY', 'BETA', 4, 50, 1, null, 'USD', 0.9]]), OPTIONS);
    const usd = { id: 'u', name: 'Beta', ticker: 'BETA', assetClass: 'STOCKS' as const, subAssetType: 'SINGLE_STOCK' as const, currentValue: 200, shares: 4, originalCurrency: 'USD' as const, targetMode: 'OFF' as const };
    const eur = { ...usd, id: 'e', originalCurrency: 'EUR' as const };
    const gbp = { ...usd, id: 'g', originalCurrency: 'GBP' as const };
    const result = applyOperationsImport(plan, { netWorth: null, assets: [usd, eur, gbp] }, { recordOperations: false, updateCostBasis: true });
    expect(result.assets?.map((asset) => asset.acquisitionPrice)).toEqual([50.25, 45.225, undefined]);
  });
});

describe('investment operations template', () => {
  it('has an example ledger that imports as documented', () => {
    const workbook = readXlsxWorkbook(buildOperationsTemplate({ currency: 'EUR' }));
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['README', 'Example', 'Operations']);
    expect(parseOperationsWorkbook(workbook, OPTIONS).operations).toEqual([]);
    const example = workbook.sheets[1];
    const plan = parseOperationsWorkbook({ ...workbook, sheets: [{ ...example, name: 'Ledger' }] }, OPTIONS);
    expect(plan.warnings).toEqual([]);
    expect(plan.operations.map((op) => [op.type, op.amount])).toEqual([
      ['PURCHASE', 955.25], ['PURCHASE', 838.58], ['DIVIDEND', 3.81], ['SALE', 405.55], ['OTHER', 3],
    ]);
    expect(getOperationsAgentPrompt()).toMatch(/^You are helping me build a Fire Tools investment operations workbook/);
  });
});

describe('OperationsWorkbookImportDialog', () => {
  afterEach(() => cleanup());

  it('previews the ledger and saves operations through the page', async () => {
    const onApply = vi.fn((_next: NetWorthTrackerData) => true);
    render(<OperationsWorkbookImportDialog isOpen onClose={vi.fn()} getCurrent={() => netWorth()} onApply={onApply} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [new File([new Uint8Array(ledger())], 'ledger.xlsx')] } });
    expect(await screen.findByText('Operations: 6')).toBeTruthy();
    expect(screen.getByText(/2 operations fall in months without a Net Worth snapshot/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Import complete')).toBeTruthy();
    const saved = onApply.mock.calls[0][0];
    expect(saved.years[0].months.flatMap((month) => month.operations).filter((op) => op.id.startsWith('wbo-'))).toHaveLength(4);
  });
});
