/**
 * Downloadable Fire Tools workbook template and AI agent prompt.
 * The prompt text lives in docs/user/spreadsheet-import-agent-prompt.md so the
 * user guide, the template README sheet and the in-app copy button agree.
 */

import promptDocument from '../../docs/user/spreadsheet-import-agent-prompt.md?raw';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types/currency';
import { downloadFile } from './dataExportImport';
import { writeXlsxWorkbook, XLSX_MIME_TYPE, type XlsxWriteSheet, type XlsxWriteValue } from './xlsxWriter';

export const WORKBOOK_TEMPLATE_FILENAME = 'fire-tools-net-worth-template.xlsx';

/** The copy-ready prompt: everything after the first horizontal rule. */
export function getWorkbookAgentPrompt(): string {
  const parts = promptDocument.split(/\r?\n---\r?\n/);
  return (parts.length > 1 ? parts.slice(1).join('\n---\n') : promptDocument).trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_HEADERS = ['Category', 'Name', 'Ticker', 'Currency', ...MONTHS, 'Notes'];
const YEAR_COLUMN_WIDTHS = [18, 34, 14, 10, ...MONTHS.map(() => 11), 36];

export const TEMPLATE_CATEGORIES: Array<[string, string]> = [
  ['ETF', 'Exchange-traded or index funds holding shares (market value)'],
  ['Stock', 'Individual shares (market value)'],
  ['Bond ETF', 'Bond or money-market funds (market value)'],
  ['Bond', 'Individual bonds (market value)'],
  ['Crypto', 'Crypto assets (market value)'],
  ['Private equity', 'Unlisted companies or your own business equity'],
  ['Real estate', 'Property market value'],
  ['Commodity', 'Gold and other commodities'],
  ['Vehicle', 'Cars, motorbikes, boats'],
  ['Collectible', 'Watches, wine, collections'],
  ['Art', 'Art'],
  ['Other asset', 'Anything else you own'],
  ['Cash', 'Current or checking accounts and physical cash'],
  ['Savings', 'Savings and deposit accounts'],
  ['Brokerage cash', 'Uninvested cash at a broker'],
  ['Pension', 'Pension pots (put state, employer or private in the name)'],
  ['Debt', 'Mortgages, loans, credit cards (negative balance)'],
  ['Tax', 'Taxes owed (negative) or refunds due to you (positive)'],
  ['Income', 'Money received in the month: salary, freelance, dividends, rent'],
  ['Expense', 'Money spent in the month, per category or one "Monthly spending" row'],
  ['Tax paid', 'Taxes paid in the month'],
  ['Shares', 'Units held for the row Ticker (enables price refresh)'],
  ['Price', 'Unit price for the row Ticker'],
  ['FX', 'Exchange rate, Name like EURUSD meaning 1 EUR = value USD'],
  ['Net worth', 'Total reported by a source, only used as a check'],
  ['Target spending', 'Monthly spending planned after financial independence'],
  ['Withdrawal rate', 'Desired withdrawal rate in percent, e.g. 3.5'],
];

const SCAFFOLD_CATEGORIES = [
  'ETF', 'ETF', 'Stock', 'Bond ETF', 'Crypto', 'Cash', 'Savings', 'Brokerage cash', 'Pension',
  'Debt', 'Tax', 'Income', 'Income', 'Expense', 'Expense', 'Tax paid', 'Shares', 'FX',
  'Net worth', 'Target spending', 'Withdrawal rate',
];
const CURRENCYLESS = new Set(['Shares', 'FX', 'Withdrawal rate']);

function header(values: string[]): XlsxWriteValue[] {
  return values.map((value) => ({ value, style: 'header' as const }));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function series(build: (index: number) => number | null): Array<number | null> {
  return MONTHS.map((_, index) => {
    const value = build(index);
    return value === null ? null : round2(value);
  });
}

/** Fictional EUR/USD example data showing every common row type. */
function exampleRows(): XlsxWriteValue[][] {
  const currency = 'EUR';
  const units = series((i) => 100 + Math.floor(i / 2) * 2);
  const unitPrice = [90, 91.5, 89.8, 92.4, 94, 95.1, 96.3, 95.7, 97.2, 98.8, 100.4, 101.9];
  const corpPriceUsd = [180, 184, 176, 182, 190, 188, 195, 199, 193, 201, 207, 210];
  const fxUsd = [1.08, 1.09, 1.07, 1.08, 1.1, 1.09, 1.1, 1.11, 1.1, 1.12, 1.11, 1.12];
  const cryptoUsd = [400, 520, 480, 610, 650, 580, 700, 760, 720, 800, 870, 900];

  // USD rows are converted with the FX row, as Fire Tools does on import.
  const etf = series((i) => (units[i] as number) * unitPrice[i]);
  const corp = series((i) => 10 * corpPriceUsd[i]);
  const bonds = series((i) => 3000 + i * 25);
  const crypto = series((i) => cryptoUsd[i]);
  const checking = series((i) => 2500 + (i % 3) * 120);
  const savings = series((i) => 8000 + i * 150);
  const brokerCash = series((i) => (i % 2 === 0 ? 300 : 180));
  const pension = series((i) => 12000 + i * 220);
  const carLoan = series((i) => -(9000 - i * 250));
  const taxDue = series((i) => (i < 3 ? -1200 : null));
  const netWorth = series((i) => (etf[i] as number) + (bonds[i] as number) + (checking[i] as number)
    + (savings[i] as number) + (brokerCash[i] as number) + (pension[i] as number) + (carLoan[i] as number)
    + (taxDue[i] ?? 0) + ((corp[i] as number) + (crypto[i] as number)) / fxUsd[i]);

  const row = (category: string, name: string, ticker: string, rowCurrency: string, values: Array<number | null>, notes = ''): XlsxWriteValue[] => [
    category, name, ticker, rowCurrency, ...values, notes,
  ];
  const constant = (value: number) => series(() => value);
  return [
    row('ETF', 'Global equity ETF', 'DEMO-GLB', currency, etf, 'Fictional example'),
    row('Shares', 'Global equity ETF units', 'DEMO-GLB', '', units),
    row('Stock', 'Example Corp shares', 'DEMO-CORP', 'USD', corp),
    row('Shares', 'Example Corp units', 'DEMO-CORP', '', constant(10)),
    row('Bond ETF', 'Government bond ETF', '', currency, bonds),
    row('Crypto', 'Crypto wallet', '', 'USD', crypto),
    row('Cash', 'Example Bank current account', '', currency, checking),
    row('Savings', 'Example Bank savings', '', currency, savings),
    row('Brokerage cash', 'Example Broker cash', '', currency, brokerCash),
    row('Pension', 'Employer pension plan', '', currency, pension),
    row('Debt', 'Car loan', '', currency, carLoan),
    row('Tax', 'Income tax due', '', currency, taxDue, 'Paid in April'),
    row('Income', 'Salary (net)', '', currency, constant(3200)),
    row('Income', 'Dividends', '', currency, series((i) => (i % 3 === 2 ? 45 : null))),
    row('Expense', 'Rent', '', currency, constant(1100)),
    row('Expense', 'Groceries', '', currency, series((i) => 330 + (i % 4) * 15)),
    row('Expense', 'Monthly spending', '', currency, series((i) => 640 + (i % 5) * 20), 'Everything else'),
    row('Tax paid', 'Income tax payment', '', currency, series((i) => (i === 3 ? 1200 : null))),
    row('FX', 'EURUSD', '', '', fxUsd),
    row('Net worth', 'Reported total (check)', '', currency, netWorth),
    row('Target spending', 'Monthly spending after FIRE', '', currency, constant(2500)),
    row('Withdrawal rate', 'Desired withdrawal rate', '', '', constant(3.5)),
  ];
}

export interface WorkbookTemplateOptions {
  year: number;
  currency: SupportedCurrency;
}

/** Build the downloadable template workbook. */
export function buildWorkbookTemplate({ year, currency }: WorkbookTemplateOptions): Uint8Array {
  const currencyList = `"${SUPPORTED_CURRENCIES.map((item) => item.code).join(',')}"`;

  const readme: XlsxWriteValue[][] = [
    [{ value: 'Fire Tools net worth import template', style: 'title' }],
    ['Fill this workbook from your statements, then import it in Fire Tools: Settings > Data > Import spreadsheet, or Net Worth Tracker > Data Management.'],
    ['Fire Tools only reads year sheets (named like 2024), History and Allocation. README and Example are ignored.'],
    [],
    [{ value: 'How to fill it', style: 'section' }],
    [`1. Make one sheet per year, named with the year only. Copy the "${year}" sheet for earlier years.`],
    ['2. Add one row per account, holding, liability or cash-flow item and pick its Category (list below).'],
    ['3. Enter month-end balances or the month total in Jan-Dec, in the row Currency. Leave unknown months empty.'],
    ['4. Liabilities are negative: Debt balances and taxes you owe.'],
    ['5. Optional: a Shares row with the same Ticker turns a holding into units x price so prices can refresh.'],
    ['6. Optional: FX rows (e.g. EURUSD) give month-end exchange rates. Otherwise the app rates are used.'],
    ['7. Do not add total rows; rows named "Total..." are skipped. Never count the same money twice.'],
    ['8. History sheet: older months with only a total (Month as YYYY-MM). Allocation sheet: target allocation.'],
    [`9. Values are converted to your Fire Tools currency (${currency}) on import.`],
    [],
    header(['Category', 'Meaning']),
    ...TEMPLATE_CATEGORIES.map(([category, meaning]) => [category, meaning]),
    [],
    [{ value: 'Using an AI assistant', style: 'section' }],
    ['Copy the prompt below into your assistant together with your statements, then paste its result into this workbook.'],
    [],
    ...getWorkbookAgentPrompt().split(/\r?\n/).map((line) => [line ? { value: line, style: 'muted' as const } : null]),
  ];
  const categoryStart = readme.findIndex((row) => row[0] === TEMPLATE_CATEGORIES[0][0]) + 1;
  const categoryRange = `README!$A$${categoryStart}:$A$${categoryStart + TEMPLATE_CATEGORIES.length - 1}`;

  const yearValidations = [
    { range: 'A2:A500', source: categoryRange },
    { range: 'D2:D500', source: currencyList },
  ];
  const yearSheet = (name: string, rows: XlsxWriteValue[][]): XlsxWriteSheet => ({
    name,
    rows: [header(YEAR_HEADERS), ...rows],
    columnWidths: YEAR_COLUMN_WIDTHS,
    freezeRows: 1,
    freezeColumns: 2,
    listValidations: yearValidations,
  });

  const sheets: XlsxWriteSheet[] = [
    { name: 'README', rows: readme, columnWidths: [22, 100] },
    yearSheet('Example', exampleRows()),
    yearSheet(String(year), SCAFFOLD_CATEGORIES.map((category) => [category, null, null, CURRENCYLESS.has(category) ? null : currency])),
    {
      name: 'History',
      rows: [header(['Month', 'Net worth', 'Currency', 'Notes'])],
      columnWidths: [12, 16, 10, 40],
      freezeRows: 1,
      listValidations: [{ range: 'C2:C1000', source: currencyList }],
    },
    {
      name: 'Allocation',
      rows: [
        header(['Asset class', 'Ticker', 'Name', 'Target mode', 'Target %', 'Target amount']),
        ...['Stocks', 'Bonds', 'Cash', 'Crypto', 'Real estate', 'Commodities'].map((assetClass) => [assetClass]),
      ],
      columnWidths: [16, 14, 30, 14, 10, 14],
      freezeRows: 1,
      listValidations: [
        { range: 'A2:A200', source: '"Stocks,Bonds,Cash,Crypto,Real estate,Commodities"' },
        { range: 'D2:D200', source: '"PERCENTAGE,SET,OFF"' },
      ],
    },
  ];
  return writeXlsxWorkbook(sheets);
}

/** Generate the template and hand it to the browser/Electron download flow. */
export function downloadWorkbookTemplate(options: WorkbookTemplateOptions): void {
  const bytes = buildWorkbookTemplate(options);
  downloadFile(new Blob([new Uint8Array(bytes)], { type: XLSX_MIME_TYPE }), WORKBOOK_TEMPLATE_FILENAME, XLSX_MIME_TYPE);
}
