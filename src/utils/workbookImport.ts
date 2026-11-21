/**
 * Workbook import parser.
 *
 * Converts an .xlsx workbook into an import plan without touching storage.
 * Supported layouts:
 * - Year sheets named after the year (e.g. "2025") with Jan–Dec columns.
 *   Rows are typed either by an explicit Category column (Fire Tools
 *   template) or by section header rows such as "Assets", "Cash", "Pension".
 * - An optional history sheet with Month + net worth columns for older,
 *   total-only months.
 * - An optional allocation sheet with asset class and ticker targets.
 *
 * All amounts are converted into the app's default currency, using the
 * workbook's own monthly exchange-rate rows when available.
 */

import {
  getCell,
  serialToDate,
  type XlsxCell,
  type XlsxSheet,
  type XlsxWorkbook,
} from './xlsxReader';
import { convertAmount } from './currencyConverter';
import { calculateMonthlyNetWorth } from './netWorthCalculator';
import { SUPPORTED_CURRENCIES, type ExchangeRates, type SupportedCurrency } from '../types/currency';
import type {
  AssetHolding,
  CashEntry,
  DebtEntry,
  FinancialOperation,
  MonthlySnapshot,
  PensionEntry,
  TaxEntry,
} from '../types/netWorthTracker';
import {
  EXPENSE_CATEGORIES,
  NO_CATEGORY_ID,
  type ExpenseEntry,
  type IncomeEntry,
  type IncomeSource,
} from '../types/expenseTracker';
import type { AllocationMode, AssetClass, SubAssetType } from '../types/assetAllocation';

/** Ids of entries created by the net worth workbook import. */
export const NET_WORTH_WORKBOOK_ID_PREFIX = 'wb-';
/** Ids of entries created by the yearly expenses workbook import. */
export const EXPENSE_WORKBOOK_ID_PREFIX = 'wbe-';

export interface WorkbookParseOptions {
  /** Currency every imported amount is converted into. */
  targetCurrency: SupportedCurrency;
  /** App exchange rates relative to `targetCurrency`, used when the workbook has no rate. */
  fallbackRates: ExchangeRates;
}

export type WorkbookWarningCode =
  | 'unsupportedCurrency'
  | 'fallbackRate'
  | 'unknownCategory'
  | 'negativeIncome'
  | 'duplicateYearSheet'
  | 'historyConverted'
  | 'invalidHistoryDate';

export interface WorkbookWarning {
  code: WorkbookWarningCode;
  sheet: string;
  row?: number;
  detail?: string;
}

export interface WorkbookImportedMonth {
  year: number;
  month: number;
  assets: AssetHolding[];
  cashEntries: CashEntry[];
  pensions: PensionEntry[];
  debts: DebtEntry[];
  taxes: TaxEntry[];
  operations: FinancialOperation[];
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  note?: string;
  /** Total reported by the workbook, converted to the target currency. */
  reportedNetWorth?: number;
  /** True for months that only have a total from the history sheet. */
  totalOnly: boolean;
  /** True when this month contains balance-sheet entries (assets, cash, ...). */
  hasBalances: boolean;
  /** Matching keys (ticker and name) per imported holding id, for allocation targets. */
  holdingKeys: Record<string, string[]>;
}

export interface WorkbookTarget {
  targetMode: AllocationMode;
  targetPercent?: number;
  targetValue?: number;
}

export interface WorkbookAssetTarget extends WorkbookTarget {
  keys: string[];
  assetClass?: AssetClass;
}

export interface WorkbookCashTarget extends WorkbookTarget {
  scope: 'all' | 'bank' | 'broker';
}

export interface WorkbookAllocationPlan {
  classTargets: Partial<Record<AssetClass, WorkbookTarget>>;
  assetTargets: WorkbookAssetTarget[];
  cashTargets: WorkbookCashTarget[];
}

export interface WorkbookFirePlan {
  /** Annual FIRE spending target in the target currency. */
  annualExpenses?: number;
  /** Desired withdrawal rate as a percentage (e.g. 3.5). */
  withdrawalRate?: number;
}

export interface WorkbookReconciliation {
  checked: number;
  mismatches: Array<{ year: number; month: number; reported: number; imported: number }>;
}

export interface WorkbookImportPlan {
  currency: SupportedCurrency;
  months: WorkbookImportedMonth[];
  allocation: WorkbookAllocationPlan | null;
  fire: WorkbookFirePlan | null;
  yearSheets: string[];
  historySheet: string | null;
  allocationSheet: string | null;
  ignoredSheets: string[];
  warnings: WorkbookWarning[];
}

type RowRole =
  | { role: 'asset'; assetClass: AssetHolding['assetClass']; allocationClass: AssetClass; subAssetType: SubAssetType }
  | { role: 'cash'; accountType: CashEntry['accountType'] }
  | { role: 'pension'; pensionType: PensionEntry['pensionType'] }
  | { role: 'debt'; debtType: DebtEntry['debtType'] }
  | { role: 'tax' }
  | { role: 'income'; source: IncomeSource }
  | { role: 'expense'; category: string }
  | { role: 'taxPaid' }
  | { role: 'price' }
  | { role: 'shares' }
  | { role: 'fx' }
  | { role: 'netWorth' }
  | { role: 'fireMonthlyTarget' }
  | { role: 'fireAnnualTarget' }
  | { role: 'withdrawalRate' };

type Block = 'assets' | 'cash' | 'finance' | 'cashflow' | 'pension' | 'summary' | 'fire' | 'ignore';

interface Section {
  block: Block;
  /** Role inferred from the latest sub-section header, if any. */
  sub: RowRole | 'physical' | null;
  /** Lower-cased sub-section label, used as an income/expense hint. */
  subLabel: string;
}

interface ParsedRow {
  row: number;
  role: RowRole;
  /** Section block for month-column layouts; null for explicit categories. */
  block: Block | null;
  name: string;
  label: string;
  currency: SupportedCurrency | null;
  ticker: string;
  notes: string;
  values: Array<number | null>;
  cells: Array<XlsxCell | undefined>;
}

const MONEY_ROLES = new Set<RowRole['role']>([
  'asset', 'cash', 'pension', 'debt', 'tax', 'income', 'expense', 'taxPaid',
]);
const BALANCE_ROLES = new Set<RowRole['role']>(['asset', 'cash', 'pension', 'debt', 'tax']);
const SUPPORTED_CODES = new Set<string>(SUPPORTED_CURRENCIES.map((currency) => currency.code));

// ---------------------------------------------------------------------------
// Text and number helpers
// ---------------------------------------------------------------------------

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(cell: XlsxCell | undefined): string {
  if (!cell || cell.value === null) return '';
  return String(cell.value).trim();
}

/** Parse a number written with either decimal separator, currency symbols or a percent sign. */
export function parseLocaleNumber(text: string): number | null {
  let value = text.trim().replace(/[\s\u00a0\u202f']/g, '').replace(/[€$£¥]|chf|eur|usd|gbp|jpy|aud|cad/gi, '');
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  let percent = false;
  if (value.endsWith('%')) {
    percent = true;
    value = value.slice(0, -1);
  }
  if (!/^[-+]?[\d.,]+$/.test(value) || !/\d/.test(value)) return null;
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    value = lastComma > lastDot
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '');
  } else if (lastComma >= 0) {
    value = /^[-+]?\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, '') : value.replace(/,/g, '.');
  } else if ((value.match(/\./g) ?? []).length > 1) {
    value = value.replace(/\./g, '');
  }
  let parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (percent) parsed /= 100;
  return negative ? -Math.abs(parsed) : parsed;
}

export function parseNumericCell(cell: XlsxCell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.value === 'number') return Number.isFinite(cell.value) ? cell.value : null;
  if (typeof cell.value === 'string') return parseLocaleNumber(cell.value);
  return null;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad(month: number): string {
  return String(month).padStart(2, '0');
}

/** Normalise a ticker or symbol into a comparable key, dropping exchange prefixes/suffixes. */
export function tickerKey(value: string): string {
  const upper = value.trim().toUpperCase();
  const withoutPrefix = upper.includes(':') ? upper.slice(upper.lastIndexOf(':') + 1) : upper;
  return withoutPrefix.replace(/\.[A-Z]{1,3}$/, '').replace(/[^A-Z0-9]/g, '');
}

function nameKey(value: string): string {
  return `name:${normalizeText(value)}`;
}

/** Google/Bloomberg-style "EXCHANGE:SYMBOL" to a Yahoo Finance symbol, when the exchange is known. */
const EXCHANGE_SUFFIX: Record<string, string> = {
  NASDAQ: '', NYSE: '', NYSEARCA: '', NYSEAMERICAN: '', BATS: '', AMEX: '',
  AMS: '.AS', EPA: '.PA', ETR: '.DE', XETRA: '.DE', FRA: '.F', LON: '.L', BIT: '.MI',
  SWX: '.SW', VIE: '.VI', BME: '.MC', EBR: '.BR', ELI: '.LS', TSE: '.TO', ASX: '.AX',
  HKG: '.HK', TYO: '.T', STO: '.ST', CPH: '.CO', HEL: '.HE', OSL: '.OL',
};

function marketTicker(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed.includes(':')) return /^[A-Z0-9.\-^=]{1,15}$/.test(trimmed) ? trimmed : '';
  const [exchange, code] = trimmed.split(':', 2);
  const suffix = EXCHANGE_SUFFIX[exchange];
  return suffix === undefined || !code ? '' : `${code}${suffix}`;
}

// ---------------------------------------------------------------------------
// Month header detection
// ---------------------------------------------------------------------------

const MONTH_LOCALES = ['en', 'it', 'de', 'fr', 'es'];
let monthNameIndex: Map<string, number> | null = null;

function stripPeriod(value: string): string {
  return value.replace(/\.$/, '');
}

function getMonthNameIndex(): Map<string, number> {
  if (monthNameIndex) return monthNameIndex;
  const index = new Map<string, number>();
  for (const locale of MONTH_LOCALES) {
    for (const style of ['long', 'short'] as const) {
      const formatter = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
      for (let month = 1; month <= 12; month++) {
        const name = stripPeriod(normalizeText(formatter.format(new Date(Date.UTC(2021, month - 1, 15)))));
        if (!index.has(name)) index.set(name, month);
        if (style === 'long' && name.length >= 3 && !index.has(name.slice(0, 3))) index.set(name.slice(0, 3), month);
      }
    }
  }
  index.set('sept', 9);
  monthNameIndex = index;
  return index;
}

/** Month number for a month name or abbreviation in any supported UI language. */
export function monthFromName(value: string): number | null {
  return getMonthNameIndex().get(stripPeriod(normalizeText(value))) ?? null;
}

function monthFromHeader(cell: XlsxCell | undefined, date1904: boolean): number | null {
  if (!cell || cell.value === null) return null;
  if (typeof cell.value === 'number') {
    if (cell.value > 20000 && cell.value < 80000) return serialToDate(cell.value, date1904)?.month ?? null;
    return null;
  }
  const text = stripPeriod(normalizeText(cell.value));
  const iso = /^\d{4}-(\d{1,2})(?:-\d{1,2})?$/.exec(text);
  if (iso) {
    const month = Number(iso[1]);
    return month >= 1 && month <= 12 ? month : null;
  }
  return getMonthNameIndex().get(text) ?? null;
}

interface MonthHeader {
  row: number;
  columns: number[];
}

function findMonthHeader(sheet: XlsxSheet, date1904: boolean): MonthHeader | null {
  const lastRow = Math.min(sheet.maxRow, 15);
  for (let row = 1; row <= lastRow; row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const columns: number[] = [];
    for (const column of [...cells.keys()].sort((a, b) => a - b)) {
      const month = monthFromHeader(cells.get(column), date1904);
      if (month === columns.length + 1) columns.push(column);
      if (columns.length === 12) return { row, columns };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function assetRole(assetClass: AssetHolding['assetClass'], allocationClass: AssetClass, subAssetType: SubAssetType): RowRole {
  return { role: 'asset', assetClass, allocationClass, subAssetType };
}

function physicalAssetRole(name: string): RowRole {
  const text = normalizeText(name);
  if (/\b(car|vehicle|motor|motorbike|motorcycle|scooter|boat|van)\b/.test(text)) return assetRole('VEHICLE', 'VEHICLE', 'CAR');
  if (/\b(art|artwork|painting|sculpture)\b/.test(text)) return assetRole('ART', 'ART', 'OTHER_ART');
  if (/collect|watch|wine|jewel|coin|memorabilia|card/.test(text)) return assetRole('COLLECTIBLE', 'COLLECTIBLE', 'OTHER_COLLECTIBLE');
  return assetRole('OTHER', 'STOCKS', 'NONE');
}

function accountTypeFromName(name: string): CashEntry['accountType'] {
  const text = normalizeText(name);
  if (/broker|trading account|investment account/.test(text)) return 'BROKERAGE';
  if (/saving|risparmi|sparkonto|epargne|ahorro|deposit account/.test(text)) return 'SAVINGS';
  if (/credit card/.test(text)) return 'CREDIT_CARD';
  return 'CHECKING';
}

function pensionTypeFromName(name: string): PensionEntry['pensionType'] {
  const text = normalizeText(name);
  if (/state|public|social security|old.?age|government|national/.test(text)) return 'STATE';
  if (/employer|occupational|workplace|401k|403b|second pillar|2nd pillar|company/.test(text)) return 'EMPLOYER';
  if (/private|personal|\bira\b|sipp|third pillar|3rd pillar/.test(text)) return 'PRIVATE';
  return 'OTHER';
}

function debtTypeFromName(name: string): DebtEntry['debtType'] {
  const text = normalizeText(name);
  if (/mortgage|home loan/.test(text)) return 'MORTGAGE';
  if (/credit card/.test(text)) return 'CREDIT_CARD';
  if (/student/.test(text)) return 'STUDENT_LOAN';
  if (/\bcar\b|auto loan|vehicle/.test(text)) return 'CAR_LOAN';
  if (/loan/.test(text)) return 'PERSONAL_LOAN';
  return 'OTHER';
}

function taxTypeFromName(name: string): TaxEntry['taxType'] {
  const text = normalizeText(name);
  if (/capital gain|dividend|withholding/.test(text)) return 'CAPITAL_GAINS_TAX';
  if (/property|real estate|house/.test(text)) return 'PROPERTY_TAX';
  if (/income/.test(text)) return 'INCOME_TAX';
  return 'OTHER';
}

function incomeSourceFrom(text: string): IncomeSource {
  const value = normalizeText(text);
  if (/dividend|interest|coupon|financial|investment|capital gain/.test(value)) return 'INVESTMENTS';
  if (/rent|rental|lease/.test(value)) return 'RENTAL';
  if (/pension|annuity/.test(value)) return 'PENSION';
  if (/benefit|unemployment|social security|welfare|allowance/.test(value)) return 'SOCIAL_SECURITY';
  if (/bonus/.test(value)) return 'BONUS';
  if (/gift|donation|\btips?\b/.test(value)) return 'GIFT';
  if (/salary|employment|wage|payroll|paycheck|stipend/.test(value)) return 'SALARY';
  if (/freelanc|self.?employ|consult|coaching|mentor|client|contract|content|affiliate|royalt|course|book|creator/.test(value)) return 'FREELANCE';
  if (/business|company|revenue|sales/.test(value)) return 'BUSINESS';
  return 'OTHER';
}

const EXPENSE_KEYWORDS: Array<[RegExp, string]> = [
  [/\brent\b|housing|\bhouse\b|\bhome\b|mortgage payment/, 'HOUSING'],
  [/utilit|electric|energy|\bwater\b|gas bill|internet|\bphone\b/, 'UTILITIES'],
  [/transport|\bfuel\b|petrol|\btrain\b|\bbus\b|\btaxi\b|parking/, 'TRANSPORTATION'],
  [/grocer|supermarket|food shopping/, 'GROCERIES'],
  [/restaurant|dining|going out|takeaway|\bbars?\b/, 'DINING_OUT'],
  [/health|doctor|medical|pharmacy|dental/, 'HEALTHCARE'],
  [/insurance/, 'INSURANCE'],
  [/entertainment|cinema|movies|games/, 'ENTERTAINMENT'],
  [/shopping|clothes|clothing/, 'SHOPPING'],
  [/personal care|self.?care|beauty|haircut/, 'PERSONAL_CARE'],
  [/education|course|school|tuition/, 'EDUCATION'],
  [/debt payment|loan payment/, 'DEBT_PAYMENTS'],
  [/business/, 'BUSINESS'],
  [/\bfees?\b|bank charge/, 'FEES'],
  [/leisure|sport|gym|hobb/, 'LIFESTYLE_LEISURE'],
  [/collectible/, 'COLLECTIBLES'],
  [/music/, 'MUSIC'],
  [/travel|flight|hotel/, 'TRAVEL'],
  [/holiday|vacation/, 'HOLIDAYS'],
  [/gift|donation|charity/, 'GIFTS_DONATIONS'],
  [/subscription|streaming/, 'SUBSCRIPTIONS'],
];

function expenseCategoryFromName(name: string): string {
  const text = normalizeText(name);
  for (const [pattern, category] of EXPENSE_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return NO_CATEGORY_ID;
}

const COMPUTED_NAME = /^(nw|net ?worth) change$|^change ?%?$|^%$|^delta$/;
const AGGREGATE_NAME = /\btotals?\b|\bsubtotal\b|\(auto(matic)?\)|\bsum\b/;
const NET_WORTH_LABEL = /^(nw|net ?worth)(\s*\(([a-z]{3})\))?$/;
const FX_PAIR = /^([A-Z]{3})\s*[/:-]?\s*([A-Z]{3})$/;

function fxPair(name: string): [string, string] | null {
  const match = FX_PAIR.exec(name.trim().toUpperCase());
  return match && SUPPORTED_CODES.has(match[1]) && SUPPORTED_CODES.has(match[2]) ? [match[1], match[2]] : null;
}

/** Explicit Category column values used by the Fire Tools template. */
function roleFromCategory(category: string, name: string): RowRole | null {
  const text = normalizeText(category);
  if (!text) return null;
  if (/^(bonds? etfs?|bond funds?|money market( etf| fund)?)$/.test(text)) return assetRole('BONDS', 'BONDS', /money/.test(text) ? 'MONEY_ETF' : 'ETF');
  if (/^(etfs?|funds?|index funds?|mutual funds?)$/.test(text)) return assetRole('ETF', 'STOCKS', 'ETF');
  if (/^(stocks?|equit(y|ies)|single stocks?|individual stocks?)$/.test(text)) return assetRole('STOCKS', 'STOCKS', 'SINGLE_STOCK');
  if (/^bonds?$/.test(text)) return assetRole('BONDS', 'BONDS', 'SINGLE_BOND');
  if (/^crypto(currenc(y|ies))?$/.test(text)) return assetRole('CRYPTO', 'CRYPTO', 'COIN');
  if (/^(private equity|business|company)$/.test(text)) return assetRole('PRIVATE_EQUITY', 'STOCKS', 'PRIVATE_EQUITY');
  if (/^(real estate|property)$/.test(text)) return assetRole('REAL_ESTATE', 'REAL_ESTATE', 'PROPERTY');
  if (/^commodit(y|ies)$/.test(text)) return assetRole('COMMODITIES', 'COMMODITIES', 'COMMODITY_ETF');
  if (/^vehicles?$/.test(text)) return assetRole('VEHICLE', 'VEHICLE', 'CAR');
  if (/^collectibles?$/.test(text)) return assetRole('COLLECTIBLE', 'COLLECTIBLE', 'OTHER_COLLECTIBLE');
  if (/^art$/.test(text)) return assetRole('ART', 'ART', 'OTHER_ART');
  if (/^other assets?$/.test(text)) return assetRole('OTHER', 'STOCKS', 'NONE');
  if (/^(cash|checking|current account|bank)$/.test(text)) return { role: 'cash', accountType: 'CHECKING' };
  if (/^savings?$/.test(text)) return { role: 'cash', accountType: 'SAVINGS' };
  if (/^(brokerage cash|broker cash|brokerage)$/.test(text)) return { role: 'cash', accountType: 'BROKERAGE' };
  if (/^other cash$/.test(text)) return { role: 'cash', accountType: 'OTHER' };
  if (/^pensions?$/.test(text)) return { role: 'pension', pensionType: pensionTypeFromName(name) };
  if (/^(debts?|loans?|mortgage|liabilit(y|ies))$/.test(text)) return { role: 'debt', debtType: text === 'mortgage' ? 'MORTGAGE' : debtTypeFromName(name) };
  if (/^tax(es)?$/.test(text)) return { role: 'tax' };
  if (/^tax(es)? paid$/.test(text)) return { role: 'taxPaid' };
  if (/^incomes?$/.test(text)) return { role: 'income', source: incomeSourceFrom(name) };
  if (/^(expenses?|spending)$/.test(text)) return { role: 'expense', category: expenseCategoryFromName(name) };
  if (/^(shares|units|quantity)$/.test(text)) return { role: 'shares' };
  if (/^prices?$/.test(text)) return { role: 'price' };
  if (/^(fx|exchange rate|currency rate)$/.test(text)) return { role: 'fx' };
  if (/^net ?worth$/.test(text)) return { role: 'netWorth' };
  if (/^target spending$/.test(text)) return { role: 'fireMonthlyTarget' };
  if (/^withdrawal rate$/.test(text)) return { role: 'withdrawalRate' };
  return null;
}

/** Section header labels used by month-column personal finance workbooks. */
function classifyHeader(label: string, rowText: string, current: Section): Section | null {
  const text = normalizeText(label);
  if (!text) return null;
  const sub = subSectionRole(text, current.block);
  if (sub !== undefined) return { block: sub === 'cash' ? 'cash' : current.block, sub: sub === 'cash' ? null : sub, subLabel: text };

  const keep = (block: Block): Section => ({ block, sub: null, subLabel: '' });
  if (/^net ?worth\b/.test(text)) return keep(/auto/.test(normalizeText(rowText)) ? 'ignore' : 'assets');
  if (/cash ?flow|^incomes?\b|^entrate/.test(text)) return keep('cashflow');
  if (/^(assets?|investments?|holdings|portfolio|attivi|patrimonio)\b/.test(text)) return keep('assets');
  if (/cash|liquid/.test(text)) return keep('cash');
  if (/^(finance|prices?|market|quotes|exchange rates?|fx)\b/.test(text)) return keep('finance');
  if (/^(pensions?|retirement|previdenza)\b/.test(text)) return keep('pension');
  if (/synth|syntethic|summary|overview|riepilogo/.test(text)) return keep('summary');
  if (/^fire\b|financial independence/.test(text)) return keep('fire');
  if (/^(liabilit|debts?|loans?)/.test(text)) return { block: 'cash', sub: { role: 'debt', debtType: 'OTHER' }, subLabel: text };
  if (/^(consts?|constants|settings|parameters|assumptions|simple|allocation|notes?)\b/.test(text)) return keep('ignore');
  // Unknown headers stay within the current block as a generic group.
  return { block: current.block, sub: null, subLabel: text };
}

/**
 * Sub-section header meaning within a block. Returns undefined when the label
 * is not a sub-section of the current block, or 'cash' to switch to cash.
 */
function subSectionRole(text: string, block: Block): RowRole | 'physical' | 'cash' | null | undefined {
  if (block === 'assets') {
    if (/bond|monetary|money market|treasur/.test(text)) {
      return /etf|fund/.test(text) ? assetRole('BONDS', 'BONDS', 'ETF') : assetRole('BONDS', 'BONDS', 'SINGLE_BOND');
    }
    if (/etf|fund/.test(text)) return assetRole('ETF', 'STOCKS', 'ETF');
    if (/stock|share|equit|azion/.test(text)) return assetRole('STOCKS', 'STOCKS', 'SINGLE_STOCK');
    if (/crypto/.test(text)) return assetRole('CRYPTO', 'CRYPTO', 'COIN');
    if (/private equity|startup|angel|business|compan/.test(text)) return assetRole('PRIVATE_EQUITY', 'STOCKS', 'PRIVATE_EQUITY');
    if (/real estate|propert|immobil/.test(text)) return assetRole('REAL_ESTATE', 'REAL_ESTATE', 'PROPERTY');
    if (/commodit|gold|metal/.test(text)) return assetRole('COMMODITIES', 'COMMODITIES', 'COMMODITY_ETF');
    if (/extras?|physical|valuables|collect/.test(text)) return 'physical';
    if (/^(cash|liquid)/.test(text)) return 'cash';
    if (/tax/.test(text)) return { role: 'tax' };
    if (/debt|loan|liabilit|mortgage/.test(text)) return { role: 'debt', debtType: debtTypeFromName(text) };
    if (/^others?\b/.test(text)) return assetRole('OTHER', 'STOCKS', 'NONE');
    return undefined;
  }
  if (block === 'cash') {
    if (/tax/.test(text)) return { role: 'tax' };
    if (/extras?|physical|valuables|collect/.test(text)) return 'physical';
    if (/debt|loan|liabilit|mortgage|credit card/.test(text)) return { role: 'debt', debtType: debtTypeFromName(text) };
    if (/^others?\b/.test(text)) return { role: 'cash', accountType: 'OTHER' };
    if (/broker/.test(text)) return { role: 'cash', accountType: 'BROKERAGE' };
    if (/saving/.test(text)) return { role: 'cash', accountType: 'SAVINGS' };
    return undefined;
  }
  if (block === 'cashflow') {
    if (/tax/.test(text)) return { role: 'taxPaid' };
    if (/expense|spending|outflow|uscite|spese/.test(text)) return { role: 'expense', category: NO_CATEGORY_ID };
    if (/^(pensions?|fire|synth|syntethic|summary|finance|consts?|constants|net ?worth|assets?)\b/.test(text)) return undefined;
    return null;
  }
  return undefined;
}

function roleFromSection(section: Section, label: string, name: string): RowRole | null {
  const nameText = normalizeText(name);
  const combined = `${section.subLabel} ${label} ${name}`;
  switch (section.block) {
    case 'assets':
    case 'cash': {
      if (section.sub === 'physical') return physicalAssetRole(name);
      if (section.sub) {
        if (section.sub.role === 'cash' && section.sub.accountType !== 'OTHER') {
          const fromName = accountTypeFromName(name);
          return { role: 'cash', accountType: fromName === 'CHECKING' ? section.sub.accountType : fromName };
        }
        if (section.sub.role === 'debt') return { role: 'debt', debtType: debtTypeFromName(name) };
        return section.sub;
      }
      return section.block === 'assets' ? assetRole('OTHER', 'STOCKS', 'NONE') : { role: 'cash', accountType: accountTypeFromName(name) };
    }
    case 'finance':
      return fxPair(name) ? { role: 'fx' } : { role: 'price' };
    case 'cashflow': {
      if (section.sub && typeof section.sub === 'object') {
        if (section.sub.role === 'expense') return { role: 'expense', category: expenseCategoryFromName(name) };
        return section.sub;
      }
      return { role: 'income', source: incomeSourceFrom(combined) };
    }
    case 'pension':
      return { role: 'pension', pensionType: pensionTypeFromName(`${label} ${name}`) };
    case 'summary':
      return /spend|expens|outflow|uscite|spese/.test(nameText) ? { role: 'expense', category: NO_CATEGORY_ID } : null;
    case 'fire': {
      if (/(target|desired).*(allowance|spending|expenses|budget)|allowance/.test(nameText) && !/current/.test(nameText)) {
        return /year|annual/.test(nameText) ? { role: 'fireAnnualTarget' } : { role: 'fireMonthlyTarget' };
      }
      if (/(desired|target).*(\bwr\b|withdrawal)/.test(nameText)) return { role: 'withdrawalRate' };
      return null;
    }
    default:
      return null;
  }
}

/** Rows (in the same sheet) referenced by a formula, ignoring other sheets and string literals. */
const SAME_SHEET_REFERENCE = /(?<![A-Za-z0-9_.$!:])\$?[A-Z]{1,3}\$?(\d+)(?::\$?[A-Z]{1,3}\$?(\d+))?(?![\d(A-Za-z_!])/g;

export function referencedRows(formula: string): number[] {
  const rows: number[] = [];
  formula.split('"').forEach((segment, index) => {
    if (index % 2 === 1) return;
    for (const match of segment.matchAll(SAME_SHEET_REFERENCE)) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      const [from, to] = start <= end ? [start, end] : [end, start];
      if (to - from > 5000) continue;
      for (let row = from; row <= to; row++) rows.push(row);
    }
  });
  return rows;
}

/** Quantity from formulas such as `E40*25` or `12.5*E41` that reference a price row. */
function quantityFromFormula(formula: string | undefined, priceRows: Set<number>): { quantity: number; priceRow: number } | null {
  if (!formula) return null;
  const compact = formula.replace(/\s+/g, '').replace(/^\((.*)\)$/, '$1');
  const match = /^\$?[A-Z]{1,3}\$?(\d+)\*(\d+(?:\.\d+)?)$/.exec(compact) ?? /^(\d+(?:\.\d+)?)\*\$?[A-Z]{1,3}\$?(\d+)$/.exec(compact);
  if (!match) return null;
  const [row, quantity] = compact.startsWith('$') || /^[A-Z]/.test(compact)
    ? [Number(match[1]), Number(match[2])]
    : [Number(match[2]), Number(match[1])];
  if (!priceRows.has(row) || !(quantity > 0)) return null;
  return { quantity, priceRow: row };
}

// ---------------------------------------------------------------------------
// Year sheets
// ---------------------------------------------------------------------------

interface HeaderColumns {
  category?: number;
  name: number;
  label?: number;
  ticker?: number;
  currency?: number;
  notes?: number;
}

function findHeaderColumns(sheet: XlsxSheet, header: MonthHeader): HeaderColumns {
  const cells = sheet.rows.get(header.row) ?? new Map<number, XlsxCell>();
  const monthColumns = new Set(header.columns);
  const result: Partial<HeaderColumns> = {};
  for (const [column, cell] of cells) {
    if (monthColumns.has(column)) continue;
    const text = stripPeriod(normalizeText(cell.value));
    if (/^(category|type|kind|categoria|tipo|kategorie|typ|categorie)$/.test(text)) result.category ??= column;
    else if (/^(name|item|description|account|holding|nome|descrizione|bezeichnung|nom|nombre)$/.test(text)) result.name ??= column;
    else if (/^(ticker|symbol|simbolo)$/.test(text)) result.ticker ??= column;
    else if (/^(cur|curr|currency|ccy|valuta|wahrung|devise|moneda|divisa)$/.test(text)) result.currency ??= column;
    else if (/^(notes?|comments?)$/.test(text)) result.notes ??= column;
  }
  const firstMonth = header.columns[0];
  const name = result.name
    ?? (result.currency && result.currency > 1 ? result.currency - 1 : Math.min(2, Math.max(1, firstMonth - 1)));
  const label = result.category === undefined && name !== 1 ? 1 : undefined;
  return { ...result, name, label };
}

interface MonthAccumulator {
  months: Map<string, WorkbookImportedMonth>;
}

function getMonth(acc: MonthAccumulator, year: number, month: number): WorkbookImportedMonth {
  const key = `${year}-${pad(month)}`;
  let entry = acc.months.get(key);
  if (!entry) {
    entry = {
      year, month, assets: [], cashEntries: [], pensions: [], debts: [], taxes: [], operations: [],
      incomes: [], expenses: [], totalOnly: false, hasBalances: false, holdingKeys: {},
    };
    acc.months.set(key, entry);
  }
  return entry;
}

interface FireAccumulator {
  monthlyTarget?: { at: number; value: number };
  annualTarget?: { at: number; value: number };
  withdrawalRate?: { at: number; value: number };
}

function keepLatest(slot: { at: number; value: number } | undefined, at: number, value: number) {
  return !slot || at >= slot.at ? { at, value } : slot;
}

function parseYearSheet(
  sheet: XlsxSheet,
  year: number,
  header: MonthHeader,
  options: WorkbookParseOptions,
  acc: MonthAccumulator,
  fire: FireAccumulator,
  warnings: WorkbookWarning[],
): void {
  const columns = findHeaderColumns(sheet, header);
  const explicit = columns.category !== undefined;

  // Base currency: the currency of a "NW (XXX)" row, else the target currency.
  let baseCurrency: SupportedCurrency = options.targetCurrency;
  for (let row = header.row + 1; row <= sheet.maxRow; row++) {
    const label = normalizeText(cellText(getCell(sheet, row, columns.label ?? columns.name)));
    const match = NET_WORTH_LABEL.exec(label);
    const code = match?.[3]?.toUpperCase();
    if (code && SUPPORTED_CODES.has(code)) {
      baseCurrency = code as SupportedCurrency;
      break;
    }
  }

  const parsedRows: ParsedRow[] = [];
  let section: Section = { block: 'assets', sub: null, subLabel: '' };
  for (let row = header.row + 1; row <= sheet.maxRow; row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const label = columns.label ? cellText(cells.get(columns.label)) : '';
    let name = cellText(cells.get(columns.name));
    const currencyText = columns.currency ? cellText(cells.get(columns.currency)) : '';
    const ticker = columns.ticker ? cellText(cells.get(columns.ticker)) : '';
    const notes = columns.notes ? cellText(cells.get(columns.notes)) : '';
    const monthCells = header.columns.map((column) => cells.get(column));
    const values = monthCells.map(parseNumericCell);
    const hasValues = values.some((value) => value !== null);

    let role: RowRole | null;
    if (explicit) {
      const category = cellText(cells.get(columns.category as number));
      if (!category) continue;
      role = roleFromCategory(category, name || ticker);
      if (!role) {
        if (hasValues) warnings.push({ code: 'unknownCategory', sheet: sheet.name, row, detail: category });
        continue;
      }
      if (!name) name = ticker;
    } else {
      if (label && !hasValues && !currencyText) {
        section = classifyHeader(label, `${label} ${name}`, section) ?? section;
        continue;
      }
      const netWorthMatch = NET_WORTH_LABEL.exec(normalizeText(label || name));
      if (netWorthMatch && !normalizeText(name).includes('change')) {
        role = { role: 'netWorth' };
        if (!name) name = label;
      } else {
        if (!name) name = label;
        if (!name || COMPUTED_NAME.test(normalizeText(name))) continue;
        role = roleFromSection(section, label, name);
      }
      if (!role) continue;
    }
    if (!name && role.role !== 'netWorth') continue;

    let currency: SupportedCurrency | null = null;
    const currencyCode = currencyText.toUpperCase();
    if (SUPPORTED_CODES.has(currencyCode)) {
      currency = currencyCode as SupportedCurrency;
    } else if (role.role === 'netWorth') {
      const code = NET_WORTH_LABEL.exec(normalizeText(label || name))?.[3]?.toUpperCase();
      currency = code && SUPPORTED_CODES.has(code) ? code as SupportedCurrency : baseCurrency;
    } else if (!currencyCode || /^[-/–]+$/.test(currencyCode)) {
      currency = baseCurrency;
    } else if (MONEY_ROLES.has(role.role) || role.role === 'price' || role.role === 'fireMonthlyTarget' || role.role === 'fireAnnualTarget') {
      if (hasValues) warnings.push({ code: 'unsupportedCurrency', sheet: sheet.name, row, detail: currencyText });
      continue;
    }

    parsedRows.push({ row, role, block: explicit ? null : section.block, name, label, currency, ticker, notes, values, cells: monthCells });
  }

  // Skip subtotal rows: named totals or formulas summing other entry rows.
  const entryRows = new Set(parsedRows.filter((row) => MONEY_ROLES.has(row.role.role)).map((row) => row.row));
  const rows = parsedRows.filter((parsed) => {
    if (!MONEY_ROLES.has(parsed.role.role)) return true;
    const name = normalizeText(parsed.name);
    // Summary rows are month totals by design, so only their formulas can mark them as subtotals.
    if (explicit ? /^(sub)?totals?\b/.test(name) : parsed.block !== 'summary' && AGGREGATE_NAME.test(name)) return false;
    return !parsed.cells.some((cell) => cell?.formula
      && referencedRows(cell.formula).some((row) => row !== parsed.row && entryRows.has(row)));
  });

  // Exchange rates per month: "EURUSD" = 1.08 means 1 EUR = 1.08 USD.
  const fx: Array<Map<string, number>> = header.columns.map(() => new Map());
  for (const parsed of rows) {
    if (parsed.role.role !== 'fx') continue;
    const pair = fxPair(parsed.name);
    if (!pair) continue;
    parsed.values.forEach((value, index) => {
      if (value !== null && value > 0) fx[index].set(`${pair[0]}/${pair[1]}`, value);
    });
  }

  const fallbackWarned = new Set<string>();
  const convert = (amount: number, from: SupportedCurrency, monthIndex: number, row: number): number => {
    const to = options.targetCurrency;
    if (from === to) return amount;
    const rates = fx[monthIndex];
    const direct = rates.get(`${from}/${to}`);
    if (direct) return amount * direct;
    const inverse = rates.get(`${to}/${from}`);
    if (inverse) return amount / inverse;
    for (const [pairKey, rate] of rates) {
      const [base, quote] = pairKey.split('/');
      // Pivot through a currency with workbook rates on both legs.
      const pivot = base === from ? quote : quote === from ? base : null;
      if (!pivot) continue;
      const inPivot = base === from ? amount * rate : amount / rate;
      const pivotToTarget = rates.get(`${pivot}/${to}`);
      if (pivotToTarget) return inPivot * pivotToTarget;
      const targetToPivot = rates.get(`${to}/${pivot}`);
      if (targetToPivot) return inPivot / targetToPivot;
    }
    if (!fallbackWarned.has(from)) {
      fallbackWarned.add(from);
      warnings.push({ code: 'fallbackRate', sheet: sheet.name, row, detail: `${from}→${to}` });
    }
    return convertAmount(amount, from, to, options.fallbackRates);
  };

  // Prices and share counts keyed by ticker.
  const priceRowNumbers = new Set<number>();
  const pricesByRow = new Map<number, ParsedRow>();
  const pricesByKey = new Map<string, ParsedRow>();
  const sharesByKey = new Map<string, ParsedRow>();
  for (const parsed of rows) {
    if (parsed.role.role === 'price') {
      priceRowNumbers.add(parsed.row);
      pricesByRow.set(parsed.row, parsed);
      pricesByKey.set(tickerKey(parsed.ticker || parsed.name), parsed);
    } else if (parsed.role.role === 'shares') {
      sharesByKey.set(tickerKey(parsed.ticker || parsed.name), parsed);
    }
  }

  // Month-column workbooks often carry formulas into future months, so a
  // filled-in total row decides which months exist. Template "Net worth" rows
  // are only a check: there, any non-zero balance includes the month.
  const netWorthRows = rows.filter((parsed) => parsed.role.role === 'netWorth');
  const netWorthRow = netWorthRows.find((parsed) => parsed.currency === options.targetCurrency) ?? netWorthRows[0];
  const totalsDecideMonths = !explicit && Boolean(netWorthRow?.values.some((value) => value !== null && value !== 0));
  const includeMonth = header.columns.map((_, index) => (totalsDecideMonths
    ? (netWorthRow?.values[index] ?? 0) !== 0
    : rows.some((parsed) => BALANCE_ROLES.has(parsed.role.role) && (parsed.values[index] ?? 0) !== 0)));

  for (const parsed of rows) {
    const { role } = parsed;
    parsed.values.forEach((rawValue, index) => {
      if (rawValue === null || rawValue === 0) return;
      const month = index + 1;
      const at = year * 100 + month;
      const currency = parsed.currency ?? baseCurrency;
      const date = `${year}-${pad(month)}-01`;
      const id = `wb-${year}${pad(month)}-${parsed.row}`;

      if (role.role === 'fireMonthlyTarget') fire.monthlyTarget = keepLatest(fire.monthlyTarget, at, convert(rawValue, currency, index, parsed.row));
      if (role.role === 'fireAnnualTarget') fire.annualTarget = keepLatest(fire.annualTarget, at, convert(rawValue, currency, index, parsed.row));
      if (role.role === 'withdrawalRate' && rawValue > 0) {
        fire.withdrawalRate = keepLatest(fire.withdrawalRate, at, rawValue <= 1 ? round(rawValue * 100, 4) : rawValue);
      }
      if (role.role === 'income' || role.role === 'expense' || role.role === 'taxPaid') {
        const amount = round(convert(rawValue, currency, index, parsed.row), 2);
        const target = getMonth(acc, year, month);
        if (role.role === 'income') {
          if (amount < 0) {
            warnings.push({ code: 'negativeIncome', sheet: sheet.name, row: parsed.row, detail: parsed.name });
            return;
          }
          target.incomes.push({
            id: `${id}-inc`, type: 'income', date, amount, description: parsed.name,
            currency: options.targetCurrency, source: role.source,
          });
        } else if (role.role === 'expense') {
          const category = role.category;
          target.expenses.push({
            id: `${id}-exp`, type: 'expense', date, amount: Math.abs(amount), description: parsed.name,
            currency: options.targetCurrency, category,
            expenseType: EXPENSE_CATEGORIES.find((info) => info.id === category)?.defaultExpenseType ?? 'NEED',
          });
        } else {
          target.operations.push({
            id: `${id}-tax`, date, type: 'TAX_PAID', description: parsed.name,
            amount: Math.abs(amount), currency: options.targetCurrency,
          });
        }
        return;
      }

      if (!includeMonth[index]) return;
      if (role.role === 'netWorth') {
        if (parsed === netWorthRow) getMonth(acc, year, month).reportedNetWorth = round(convert(rawValue, currency, index, parsed.row), 2);
        return;
      }
      if (!BALANCE_ROLES.has(role.role)) return;

      const value = convert(rawValue, currency, index, parsed.row);
      const target = getMonth(acc, year, month);
      target.hasBalances = true;
      const note = parsed.notes || undefined;
      if (role.role === 'asset') {
        const explicitTicker = parsed.ticker;
        const fromFormula = quantityFromFormula(parsed.cells[index]?.formula, priceRowNumbers);
        const priceRow = fromFormula ? pricesByRow.get(fromFormula.priceRow) : undefined;
        const nameTicker = /^([A-Z0-9][A-Z0-9.-]{0,11})(?:\s*\(.*\))?$/.exec(parsed.name.trim())?.[1] ?? '';
        const key = tickerKey(explicitTicker || priceRow?.name || nameTicker);
        let shares: number | null = fromFormula?.quantity ?? null;
        if (shares === null && key) {
          const sharesRow = sharesByKey.get(key);
          const quantity = sharesRow?.values[index];
          if (quantity && quantity > 0) shares = quantity;
        }
        let pricing = priceRow;
        if (shares === null && key) {
          pricing = pricesByKey.get(key);
          const price = pricing?.values[index];
          if (pricing && price && price > 0) {
            const priceInRowCurrency = pricing.currency && pricing.currency !== currency
              ? convertAmount(price, pricing.currency, currency, options.fallbackRates)
              : price;
            shares = round(rawValue / priceInRowCurrency);
          }
        }
        const symbol = explicitTicker || (pricing ? marketTicker(pricing.ticker || pricing.name) : '');
        const hasShares = shares !== null && shares > 0;
        const holding: AssetHolding = {
          id,
          ticker: hasShares ? symbol : '',
          name: parsed.name,
          shares: hasShares ? (shares as number) : 1,
          pricePerShare: hasShares ? round(value / (shares as number)) : round(value, 2),
          currency: options.targetCurrency,
          assetClass: role.assetClass,
          syncAssetClass: role.allocationClass,
          syncSubAssetType: role.subAssetType,
          ...(note ? { note } : {}),
        };
        target.assets.push(holding);
        target.holdingKeys[id] = [key, tickerKey(symbol), tickerKey(nameTicker), nameKey(parsed.name)]
          .filter((item, i, all) => item && all.indexOf(item) === i);
      } else if (role.role === 'cash') {
        target.cashEntries.push({
          id, accountName: parsed.name, accountType: role.accountType, balance: round(value, 2),
          currency: options.targetCurrency, ...(note ? { note } : {}),
        });
      } else if (role.role === 'pension') {
        target.pensions.push({
          id, name: parsed.name, currentValue: round(value, 2), currency: options.targetCurrency,
          pensionType: role.pensionType, ...(note ? { note } : {}),
        });
      } else if (role.role === 'debt') {
        target.debts.push({
          id, name: parsed.name, debtType: role.debtType, currentBalance: round(Math.abs(value), 2),
          currency: options.targetCurrency, ...(note ? { note } : {}),
        });
      } else if (role.role === 'tax') {
        if (value < 0) {
          target.taxes.push({
            id, name: parsed.name, taxType: taxTypeFromName(parsed.name), amount: round(-value, 2),
            currency: options.targetCurrency, isPaid: false, ...(note ? { note } : {}),
          });
        } else {
          target.cashEntries.push({
            id, accountName: parsed.name, accountType: 'OTHER', balance: round(value, 2),
            currency: options.targetCurrency, ...(note ? { note } : {}),
          });
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// History sheet (total-only months)
// ---------------------------------------------------------------------------

interface HistoryRow {
  year: number;
  month: number;
  value: number | null;
  note: string;
}

const HISTORY_DATE_HEADER = /^(month|date|period|mese|data|monat|datum|mois|mes|fecha)$/;
const HISTORY_VALUE_HEADER = /^(net ?worth|nw|patrimonio( netto| neto)?|vermogen|nettovermogen|reinvermogen|patrimoine( net)?|valeur nette)$/;
/** Generic value headers only count on sheets whose name says they hold history. */
const GENERIC_VALUE_HEADER = /^(total|value|amount|valore|wert|valeur|valor)$/;

function findHistoryHeader(sheet: XlsxSheet, allowGenericValues: boolean): { row: number; dateColumn: number; valueColumns: Array<{ column: number; currency: SupportedCurrency | null }>; currencyColumn?: number; notesColumn?: number } | null {
  for (let row = 1; row <= Math.min(sheet.maxRow, 10); row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    let dateColumn: number | undefined;
    let currencyColumn: number | undefined;
    let notesColumn: number | undefined;
    const valueColumns: Array<{ column: number; currency: SupportedCurrency | null }> = [];
    for (const [column, cell] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
      const raw = cellText(cell);
      const text = normalizeText(raw);
      if (HISTORY_DATE_HEADER.test(text)) dateColumn ??= column;
      else if (SUPPORTED_CODES.has(raw.toUpperCase())) valueColumns.push({ column, currency: raw.toUpperCase() as SupportedCurrency });
      else if (HISTORY_VALUE_HEADER.test(text) || (allowGenericValues && GENERIC_VALUE_HEADER.test(text))) valueColumns.push({ column, currency: null });
      else if (/^(cur|curr|currency|ccy|valuta)$/.test(text)) currencyColumn ??= column;
      else if (/^(notes?|comments?)$/.test(text)) notesColumn ??= column;
    }
    if (dateColumn !== undefined && valueColumns.length > 0) {
      return { row, dateColumn, valueColumns, currencyColumn, notesColumn };
    }
  }
  return null;
}

function parseHistoryDate(cell: XlsxCell | undefined, date1904: boolean): { year: number; month: number } | null {
  if (!cell || cell.value === null) return null;
  if (typeof cell.value === 'number') {
    const date = serialToDate(cell.value, date1904);
    return date ? { year: date.year, month: date.month } : null;
  }
  const text = String(cell.value).trim();
  let match = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[T ].*)?$/.exec(text);
  if (match) return validYearMonth(Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return validYearMonth(Number(match[2]), Number(match[1]));
  match = /^([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/.exec(text);
  if (match) {
    const month = getMonthNameIndex().get(stripPeriod(normalizeText(match[1])));
    if (month) return validYearMonth(Number(match[2]), month);
  }
  return null;
}

function validYearMonth(year: number, month: number): { year: number; month: number } | null {
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

function parseHistorySheet(
  sheet: XlsxSheet,
  workbook: XlsxWorkbook,
  options: WorkbookParseOptions,
  warnings: WorkbookWarning[],
): HistoryRow[] | null {
  const header = findHistoryHeader(sheet, /hist|storico|verlauf|historique|historial/.test(normalizeText(sheet.name)));
  if (!header) return null;
  const preferred = header.valueColumns.find((column) => column.currency === options.targetCurrency)
    ?? header.valueColumns.find((column) => column.currency === null)
    ?? header.valueColumns[0];
  const result: HistoryRow[] = [];
  let convertedWarned = false;
  for (let row = header.row + 1; row <= sheet.maxRow; row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const dateCell = cells.get(header.dateColumn);
    if (!dateCell || dateCell.value === null || dateCell.value === '') continue;
    const period = parseHistoryDate(dateCell, workbook.date1904);
    if (!period) {
      warnings.push({ code: 'invalidHistoryDate', sheet: sheet.name, row, detail: cellText(dateCell) });
      continue;
    }
    let value = parseNumericCell(cells.get(preferred.column));
    if (value !== null && value !== 0) {
      const rowCurrencyText = header.currencyColumn ? cellText(cells.get(header.currencyColumn)).toUpperCase() : '';
      const currency = preferred.currency
        ?? (SUPPORTED_CODES.has(rowCurrencyText) ? rowCurrencyText as SupportedCurrency : options.targetCurrency);
      if (currency !== options.targetCurrency) {
        value = convertAmount(value, currency, options.targetCurrency, options.fallbackRates);
        if (!convertedWarned) {
          convertedWarned = true;
          warnings.push({ code: 'historyConverted', sheet: sheet.name, detail: `${currency}→${options.targetCurrency}` });
        }
      }
    }
    const note = header.notesColumn ? cellText(cells.get(header.notesColumn)) : '';
    result.push({ ...period, value: value === null || value === 0 ? null : round(value, 2), note });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Allocation sheet
// ---------------------------------------------------------------------------

function allocationClassFromLabel(label: string): { assetClass: AssetClass; cashScope?: WorkbookCashTarget['scope'] } | null {
  const text = normalizeText(label);
  if (/private|business|startup/.test(text)) return null;
  if (/cash|liquid|bank|money/.test(text)) {
    return { assetClass: 'CASH', cashScope: /broker/.test(text) ? 'broker' : /bank/.test(text) ? 'bank' : 'all' };
  }
  if (/bond|obbligaz|fixed income/.test(text)) return { assetClass: 'BONDS' };
  if (/stock|equit|azion|shares|etf/.test(text)) return { assetClass: 'STOCKS' };
  if (/crypto/.test(text)) return { assetClass: 'CRYPTO' };
  if (/real estate|propert|reit/.test(text)) return { assetClass: 'REAL_ESTATE' };
  if (/commodit|gold|metal/.test(text)) return { assetClass: 'COMMODITIES' };
  return null;
}

function parseTargetCell(modeOrValue: XlsxCell | undefined, percentCell: XlsxCell | undefined, amountCell: XlsxCell | undefined): WorkbookTarget | null {
  const text = normalizeText(cellText(modeOrValue));
  const amount = parseNumericCell(amountCell);
  if (/^(off|excluded?|none|no)$/.test(text)) return { targetMode: 'OFF' };
  if (/^(set|fixed|amount)$/.test(text)) {
    return amount !== null && amount >= 0 ? { targetMode: 'SET', targetValue: amount } : null;
  }
  const percentSource = /^(percentage|percent|%|pct)$/.test(text) ? percentCell : modeOrValue;
  const raw = parseNumericCell(percentSource);
  if (raw === null || raw < 0) return null;
  // Values up to 1 are fractions (0.4 = 40%); "40%" text is already parsed as 0.4.
  const percent = round(raw <= 1 ? raw * 100 : raw, 4);
  return percent <= 100 ? { targetMode: 'PERCENTAGE', targetPercent: percent } : null;
}

function parseAllocationSheet(sheet: XlsxSheet): WorkbookAllocationPlan | null {
  const plan: WorkbookAllocationPlan = { classTargets: {}, assetTargets: [], cashTargets: [] };

  // Template layout: one header row with class, ticker, mode and target columns.
  for (let row = 1; row <= Math.min(sheet.maxRow, 10); row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const find = (pattern: RegExp) => [...cells.entries()].find(([, cell]) => pattern.test(normalizeText(cell.value)))?.[0];
    const classColumn = find(/^(asset )?class$/);
    const modeColumn = find(/^(target )?mode$/);
    if (classColumn === undefined || modeColumn === undefined) continue;
    const tickerColumn = find(/^(ticker|symbol)$/);
    const nameColumn = find(/^(name|asset|account)$/);
    const percentColumn = find(/^(target ?%|target percent(age)?|percent(age)?|%)$/);
    const amountColumn = find(/^(target (amount|value)|amount)$/);
    for (let dataRow = row + 1; dataRow <= sheet.maxRow; dataRow++) {
      const data = sheet.rows.get(dataRow);
      if (!data) continue;
      const classInfo = allocationClassFromLabel(cellText(data.get(classColumn)));
      if (!classInfo) continue;
      const target = parseTargetCell(data.get(modeColumn), percentColumn ? data.get(percentColumn) : undefined, amountColumn ? data.get(amountColumn) : undefined);
      if (!target) continue;
      const ticker = tickerColumn ? cellText(data.get(tickerColumn)) : '';
      const name = nameColumn ? cellText(data.get(nameColumn)) : '';
      if (ticker || name) {
        plan.assetTargets.push({ ...target, assetClass: classInfo.assetClass, keys: [ticker ? tickerKey(ticker) : '', name ? nameKey(name) : ''].filter(Boolean) });
      } else if (classInfo.assetClass === 'CASH' && target.targetMode === 'SET') {
        plan.cashTargets.push({ ...target, scope: classInfo.cashScope ?? 'all' });
        plan.classTargets.CASH = { targetMode: 'SET' };
      } else {
        plan.classTargets[classInfo.assetClass] = target;
      }
    }
    return Object.keys(plan.classTargets).length > 0 || plan.assetTargets.length > 0 || plan.cashTargets.length > 0 ? plan : null;
  }

  // Month-column workbook layout: blocks introduced by a "Tickers" header.
  let block: { classLevel: boolean; assetClass?: AssetClass; tickerColumn: number; targetColumn: number; amountColumn?: number } | null = null;
  for (let row = 1; row <= sheet.maxRow; row++) {
    const cells = sheet.rows.get(row);
    if (!cells) {
      block = null;
      continue;
    }
    const tickerHeader = [...cells.entries()].find(([, cell]) => /^tickers?$/.test(normalizeText(cell.value)));
    if (tickerHeader) {
      const headerClass = allocationClassFromLabel(cellText(cells.get(1)));
      const amountColumn = [...cells.entries()].find(([, cell]) => /^target$/.test(normalizeText(cell.value)))?.[0];
      block = {
        classLevel: !headerClass,
        assetClass: headerClass?.assetClass,
        tickerColumn: tickerHeader[0],
        targetColumn: tickerHeader[0] + 1,
        amountColumn,
      };
      continue;
    }
    if (!block) continue;
    const label = cellText(cells.get(1));
    if (/^total/.test(normalizeText(label))) {
      block = null;
      continue;
    }
    const target = parseTargetCell(cells.get(block.targetColumn), undefined, block.amountColumn ? cells.get(block.amountColumn) : undefined);
    if (!target) continue;
    if (block.classLevel) {
      const classInfo = allocationClassFromLabel(label);
      if (!classInfo) continue;
      if (classInfo.assetClass === 'CASH') {
        plan.cashTargets.push({ ...target, scope: classInfo.cashScope ?? 'all' });
      } else {
        plan.classTargets[classInfo.assetClass] = target;
      }
    } else {
      const ticker = cellText(cells.get(block.tickerColumn));
      if (!ticker && !label) continue;
      plan.assetTargets.push({
        ...target,
        assetClass: block.assetClass,
        keys: [ticker ? tickerKey(ticker) : '', ticker ? nameKey(ticker) : '', label ? nameKey(label) : ''].filter(Boolean),
      });
    }
  }

  // Cash scopes (bank, broker) together form the cash class target.
  const activeCash = plan.cashTargets.filter((target) => target.targetMode !== 'OFF');
  if (activeCash.some((target) => target.targetMode === 'SET')) {
    plan.classTargets.CASH = { targetMode: 'SET' };
  } else if (activeCash.length > 0) {
    plan.classTargets.CASH = {
      targetMode: 'PERCENTAGE',
      targetPercent: round(activeCash.reduce((sum, target) => sum + (target.targetPercent ?? 0), 0), 4),
    };
  } else if (plan.cashTargets.length > 0) {
    plan.classTargets.CASH = { targetMode: 'OFF' };
  }

  const hasTargets = Object.keys(plan.classTargets).length > 0 || plan.assetTargets.length > 0 || plan.cashTargets.length > 0;
  return hasTargets ? plan : null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const YEAR_SHEET = /^\s*(\d{4})\s*$/;

/** Build an import plan from a parsed workbook. Pure: never writes storage. */
export function parseNetWorthWorkbook(workbook: XlsxWorkbook, options: WorkbookParseOptions): WorkbookImportPlan {
  const warnings: WorkbookWarning[] = [];
  const acc: MonthAccumulator = { months: new Map() };
  const fire: FireAccumulator = {};
  const yearSheets: string[] = [];
  const ignoredSheets: string[] = [];
  const seenYears = new Set<number>();
  let history: HistoryRow[] | null = null;
  let historySheet: string | null = null;
  let allocation: WorkbookAllocationPlan | null = null;
  let allocationSheet: string | null = null;

  for (const sheet of workbook.sheets) {
    const yearMatch = YEAR_SHEET.exec(sheet.name);
    const year = yearMatch ? Number(yearMatch[1]) : NaN;
    if (yearMatch && year >= 1900 && year <= 2100) {
      const header = findMonthHeader(sheet, workbook.date1904);
      if (header) {
        if (seenYears.has(year)) {
          warnings.push({ code: 'duplicateYearSheet', sheet: sheet.name });
          ignoredSheets.push(sheet.name);
          continue;
        }
        seenYears.add(year);
        yearSheets.push(sheet.name);
        parseYearSheet(sheet, year, header, options, acc, fire, warnings);
        continue;
      }
    }
    const lowerName = normalizeText(sheet.name);
    if (!/deprecated|example|sample|readme|instructions/.test(lowerName)) {
      if (!allocation && /alloc/.test(lowerName)) {
        allocation = parseAllocationSheet(sheet);
        if (allocation) {
          allocationSheet = sheet.name;
          continue;
        }
      }
      if (!history) {
        history = parseHistorySheet(sheet, workbook, options, warnings);
        if (history) {
          historySheet = sheet.name;
          continue;
        }
      }
    }
    ignoredSheets.push(sheet.name);
  }

  // History adds total-only months that year sheets do not cover, and notes.
  for (const entry of history ?? []) {
    const key = `${entry.year}-${pad(entry.month)}`;
    const existing = acc.months.get(key);
    if (existing?.hasBalances) {
      if (entry.note && !existing.note) existing.note = entry.note;
      continue;
    }
    if (entry.value === null) {
      if (entry.note && existing) existing.note ??= entry.note;
      continue;
    }
    const month = getMonth(acc, entry.year, entry.month);
    const id = `wb-${entry.year}${pad(entry.month)}-total`;
    month.totalOnly = true;
    month.hasBalances = true;
    month.reportedNetWorth = entry.value;
    if (entry.note) month.note = entry.note;
    month.assets.push({
      id, ticker: '', name: 'Net worth (imported total)', shares: 1, pricePerShare: entry.value,
      currency: options.targetCurrency, assetClass: 'OTHER', note: 'Imported from the history sheet without a breakdown.',
    });
  }

  // Acquisition price: first imported price for the same holding.
  const months = [...acc.months.values()].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const firstPrice = new Map<string, number>();
  for (const month of months) {
    for (const asset of month.assets) {
      const key = month.holdingKeys[asset.id]?.[0] ?? nameKey(asset.name);
      if (!firstPrice.has(key)) firstPrice.set(key, asset.pricePerShare);
      asset.acquisitionPrice = asset.shares === 1 && !asset.ticker ? asset.pricePerShare : firstPrice.get(key);
    }
  }

  const firePlan: WorkbookFirePlan = {};
  if (fire.annualTarget) firePlan.annualExpenses = round(fire.annualTarget.value, 2);
  else if (fire.monthlyTarget) firePlan.annualExpenses = round(fire.monthlyTarget.value * 12, 2);
  if (fire.withdrawalRate) firePlan.withdrawalRate = fire.withdrawalRate.value;

  return {
    currency: options.targetCurrency,
    months,
    allocation,
    fire: Object.keys(firePlan).length > 0 ? firePlan : null,
    yearSheets,
    historySheet,
    allocationSheet,
    ignoredSheets,
    warnings,
  };
}

/** Compare reported workbook totals with the totals the app will compute. */
export function reconcileWorkbookPlan(plan: WorkbookImportPlan): WorkbookReconciliation {
  const mismatches: WorkbookReconciliation['mismatches'] = [];
  let checked = 0;
  for (const month of plan.months) {
    if (month.totalOnly || month.reportedNetWorth === undefined || !month.hasBalances) continue;
    checked++;
    const snapshot: MonthlySnapshot = {
      year: month.year, month: month.month, assets: month.assets, cashEntries: month.cashEntries,
      pensions: month.pensions, operations: [], debts: month.debts, taxes: month.taxes, isFrozen: true,
    };
    const withPension = calculateMonthlyNetWorth(snapshot, { includePension: true }).netWorth;
    const withoutPension = calculateMonthlyNetWorth(snapshot, { includePension: false }).netWorth;
    const reported = month.reportedNetWorth;
    const tolerance = Math.max(1, Math.abs(reported) * 0.005);
    const closest = Math.abs(withPension - reported) <= Math.abs(withoutPension - reported) ? withPension : withoutPension;
    if (Math.abs(closest - reported) > tolerance) {
      mismatches.push({ year: month.year, month: month.month, reported, imported: round(closest, 2) });
    }
  }
  return { checked, mismatches };
}
