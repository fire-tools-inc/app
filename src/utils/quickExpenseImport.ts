/**
 * "Paste a list of expenses" import: a tolerant line parser, local matching
 * (import rules, then the BM25 matcher) and a pure helper that appends the
 * reviewed expenses to a month. The caller owns persistence.
 */
import type { SupportedCurrency } from '../types/currency';
import {
  createEmptyMonthData,
  createEmptyYearData,
  generateTransactionId,
  getAllCategories,
  getCategoryInfo,
  NO_CATEGORY_ID,
  type ExpenseEntry,
  type ExpenseTrackerData,
  type ExpenseType,
} from '../types/expenseTracker';
import type { ParsedTransactionDraft } from '../types/pdfImport';
import { isValidCalendarDate } from './dateValidation';
import { multiplyAmount } from './expenseCalculator';
import { getExpenseMatcher } from './expenseMatcher';
import { applyImportCategorizationRules } from './importCategorizationRules';
import { logger } from './logger';

export type QuickImportSource = 'rule' | 'history' | 'seed' | 'ai' | 'none';

/** Problems that keep a row from being added; translated under quickImport.errors. */
export type QuickImportErrorCode =
  | 'missingAmount'
  | 'invalidAmount'
  | 'missingDescription'
  | 'invalidDate'
  | 'outsideMonth';

export interface QuickImportRow {
  id: string;
  include: boolean;
  date: string;
  amount: number;
  currency?: SupportedCurrency;
  description: string;
  category: string;
  expenseType: ExpenseType;
  /** Matching confidence in [0, 1]. */
  confidence: number;
  source: QuickImportSource;
  rawLine: string;
  /** A QuickImportErrorCode when the row cannot be added as is. */
  error?: string;
  /** Price of one occurrence when the line used "2x3.50"; amount = unitAmount × quantity. */
  unitAmount?: number;
  quantity?: number;
}

export interface QuickParseOptions {
  year: number;
  month: number;
  defaultCurrency: SupportedCurrency;
}

const CURRENCY_TOKENS: Readonly<Record<string, SupportedCurrency>> = {
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '$': 'USD', usd: 'USD', 'us$': 'USD',
  '£': 'GBP', gbp: 'GBP',
  chf: 'CHF',
  '¥': 'JPY', jpy: 'JPY',
  aud: 'AUD', 'a$': 'AUD',
  cad: 'CAD', 'c$': 'CAD',
};
const CURRENCY = '(?:€|£|¥|US\\$|A\\$|C\\$|\\$|EUR|USD|GBP|CHF|JPY|AUD|CAD|euros?)';
const NUMBER = "(?:\\d{1,3}(?:[.,'\\u00a0\\u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const AMOUNT_PATTERN = new RegExp(
  `(?<![\\p{L}\\d.,])(?:(${CURRENCY})\\s?)?(-|−)?(${NUMBER})(?:\\s?(${CURRENCY}))?(?![\\p{L}\\d])`, 'giu');
const QUANTITY_PATTERN = new RegExp(
  `(?<![\\p{L}\\d.,])(?:(\\d{1,3})\\s?[x×*]\\s?(?:(${CURRENCY})\\s?)?(${NUMBER})|(?:(${CURRENCY})\\s?)?(${NUMBER})\\s?(?:(${CURRENCY})\\s?)?[x×*]\\s?(\\d{1,3}))(?:\\s?(${CURRENCY}))?(?![\\p{L}\\d])`, 'iu');
const ISO_DATE = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
const SHORT_DATE = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?(?=$|[\s,;\t])/;
const LEADING_DAY = /^(\d{1,2})(?:st|nd|rd|th|\.)?\s+(?=\p{L})/u;
const HEADER_WORDS = /^(?:date|data|datum|fecha|day|giorno|tag|jour|dia|description|descrizione|beschreibung|descripcion|amount|importo|betrag|montant|importe|category|categoria|kategorie|categorie)$/;

const pad = (value: number): string => String(value).padStart(2, '0');
const isoDate = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

/** Parse a money string with dot or comma decimals and optional thousands separators. */
export function parseQuickAmount(text: string): number | null {
  let value = text.trim().replace(/[\s\u00a0\u202f']/g, '');
  const negative = /^[-−]/.test(value);
  value = value.replace(/^[-−+]/, '');
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  const decimalIndex = Math.max(lastDot, lastComma);
  let normalized: string;
  if (decimalIndex === -1) {
    normalized = value;
  } else {
    const separator = value[decimalIndex];
    const decimals = value.length - decimalIndex - 1;
    const bothUsed = lastDot !== -1 && lastComma !== -1;
    const repeated = value.indexOf(separator) !== decimalIndex;
    // "1,234" or "1.234.567" use the separator for thousands; money rarely has three decimals.
    const isDecimal = bothUsed || (!repeated && decimals > 0 && decimals !== 3);
    normalized = isDecimal
      ? `${value.slice(0, decimalIndex).replace(/[.,]/g, '')}.${value.slice(decimalIndex + 1)}`
      : value.replace(/[.,]/g, '');
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

function currencyOf(...tokens: (string | undefined)[]): SupportedCurrency | undefined {
  for (const token of tokens) {
    const currency = token ? CURRENCY_TOKENS[token.toLowerCase()] : undefined;
    if (currency) return currency;
  }
  return undefined;
}

/** Validate a row's date, amount and description for the selected month. */
export function validateQuickRow(
  row: Pick<QuickImportRow, 'date' | 'amount' | 'description'>, year: number, month: number,
): QuickImportErrorCode | undefined {
  if (!Number.isFinite(row.amount)) return 'missingAmount';
  if (row.amount < 0) return 'invalidAmount';
  if (!row.description.trim()) return 'missingDescription';
  if (!isValidCalendarDate(row.date)) return 'invalidDate';
  if (!row.date.startsWith(`${year}-${pad(month)}-`)) return 'outsideMonth';
  return undefined;
}

function resolveShortDate(first: number, second: number, yearText: string | undefined, year: number, month: number): string {
  const resolvedYear = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : year;
  // Prefer day/month; use month/day only when that matches the selected month and day/month does not.
  const dayFirst = second === month || first > 12 || second !== month && first !== month;
  return dayFirst ? isoDate(resolvedYear, second, first) : isoDate(resolvedYear, first, second);
}

let rowSequence = 0;

/** Split a pasted line into text with tab separators for spreadsheet and CSV cells. */
function normalizeCells(line: string): string {
  return line
    .replace(/[;\t|]/g, '\t')
    // Commas between digits are decimals or thousands; other commas separate CSV cells.
    .replace(/,(?!\d)|(?<!\d),/g, '\t')
    .replace(/"/g, '');
}

function parseLine(rawLine: string, lineIndex: number, opts: QuickParseOptions): QuickImportRow | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;
  let text = normalizeCells(trimmed).replace(/\s+/g, ' ').trim();
  let date = isoDate(opts.year, opts.month, 1);

  const iso = ISO_DATE.exec(text);
  if (iso) {
    date = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    text = `${text.slice(0, iso.index)} ${text.slice(iso.index + iso[0].length)}`.trim();
  } else {
    const short = SHORT_DATE.exec(text);
    const rest = short ? text.slice(short[0].length) : '';
    const plausible = short && Number(short[1]) >= 1 && Number(short[1]) <= 31 && Number(short[2]) >= 1 && Number(short[2]) <= 31
      && (Number(short[1]) <= 12 || Number(short[2]) <= 12);
    if (short && plausible && (short[3] || /\d/.test(rest))) {
      date = resolveShortDate(Number(short[1]), Number(short[2]), short[3], opts.year, opts.month);
      text = rest.trim();
    } else {
      const leadingDay = LEADING_DAY.exec(text);
      const remainder = leadingDay ? text.slice(leadingDay[0].length) : '';
      if (leadingDay && Number(leadingDay[1]) >= 1 && Number(leadingDay[1]) <= 31 && /\d/.test(remainder)) {
        date = isoDate(opts.year, opts.month, Number(leadingDay[1]));
        text = remainder.trim();
      }
    }
  }

  let amount = Number.NaN;
  let currency: SupportedCurrency | undefined;
  let unitAmount: number | undefined;
  let quantity: number | undefined;
  const times = QUANTITY_PATTERN.exec(text);
  if (times) {
    let count = Number(times[1] ?? times[7]);
    let unit = parseQuickAmount(times[3] ?? times[5]);
    // With two whole numbers ("45 x 2"), the smaller one is how many times it was paid.
    if (unit !== null && Number.isInteger(unit) && unit < count) [count, unit] = [unit, count];
    if (unit !== null && unit > 0 && count > 0) {
      quantity = count;
      unitAmount = unit;
      amount = multiplyAmount(unit, count);
      currency = currencyOf(times[2], times[4], times[6], times[8]);
      text = `${text.slice(0, times.index)} ${text.slice(times.index + times[0].length)}`;
    }
  }
  if (quantity === undefined) {
    const candidates = [...text.matchAll(AMOUNT_PATTERN)];
    const chosen = candidates.find(candidate => candidate[1] || candidate[4]) ?? candidates[candidates.length - 1];
    if (chosen) {
      const parsed = parseQuickAmount(chosen[3]);
      if (parsed !== null) {
        // Bank exports list spending as negative amounts; the expense is the absolute value.
        amount = Math.abs(parsed);
        currency = currencyOf(chosen[1], chosen[4]);
        const index = chosen.index ?? 0;
        text = `${text.slice(0, index)} ${text.slice(index + chosen[0].length)}`;
      }
    }
  }

  const description = text.replace(/\t/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–:|,.;]+|[\s\-–:|,;]+$/g, '').trim();
  if (!Number.isFinite(amount)) {
    const words = trimmed.toLowerCase().split(/[\s,;\t|]+/).filter(Boolean);
    if (words.length && words.every(word => HEADER_WORDS.test(word))) return null;
  }
  const row: QuickImportRow = {
    id: `quick-${lineIndex}-${++rowSequence}`,
    include: true,
    date,
    amount,
    currency: currency ?? opts.defaultCurrency,
    description,
    category: NO_CATEGORY_ID,
    expenseType: getCategoryInfo(NO_CATEGORY_ID).defaultExpenseType,
    confidence: 0,
    source: 'none',
    rawLine,
    ...(quantity !== undefined && unitAmount !== undefined ? { quantity, unitAmount } : {}),
  };
  const error = validateQuickRow(row, opts.year, opts.month);
  return error ? { ...row, include: false, error } : row;
}

/**
 * Read one expense per line. Accepted forms include "cinema 12.50",
 * "12,50 cinema", "€ 54.20 groceries", "3 uber 15.30", "03/11 uber 15.30",
 * "2026-11-03 uber 15.30", "coffee 2x3.50" and tab, semicolon or comma
 * separated spreadsheet rows. Lines without a date use the first day of the
 * selected month. Header rows, blank lines and lines starting with # are
 * skipped; every other line becomes a row, with an error code when it cannot
 * be added as is. Rows are not categorized; see classifyQuickImportRows.
 */
export function parseQuickExpenseList(text: string, opts: QuickParseOptions): QuickImportRow[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const row = parseLine(line, index, opts);
    return row ? [row] : [];
  });
}

/**
 * Suggest a category and Need/Want choice for every row: enabled import rules
 * win, then the local matcher learned from the tracker's history and the seed
 * lexicon. Runs entirely on this device.
 */
export function classifyQuickImportRows(rows: QuickImportRow[], data: ExpenseTrackerData): QuickImportRow[] {
  const categories = getAllCategories(data.customCategories, data.categoryOverrides);
  const rules = data.planning?.rules ?? [];
  let ruled: ReturnType<typeof applyImportCategorizationRules> | undefined;
  try {
    if (rules.length) ruled = applyImportCategorizationRules(rows.map(row => toDraft(row)), rules, data.currency, categories);
  } catch (error) {
    logger.error('quick-import', 'rules-failed', 'import rules could not be applied; using local matching only', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
  }
  const ruledById = new Map(ruled?.drafts.map(draft => [draft.id, draft]));
  const matcher = getExpenseMatcher(data);
  return rows.map(row => {
    const draft = ruledById.get(row.id);
    if (ruled?.matches[row.id] && draft?.suggestedCategory) {
      return {
        ...row, category: draft.suggestedCategory, expenseType: draft.suggestedExpenseType ?? row.expenseType,
        confidence: 1, source: 'rule' as const,
      };
    }
    if (!row.description.trim()) return { ...row, category: NO_CATEGORY_ID, confidence: 0, source: 'none' as const };
    const match = matcher.match(row.description);
    return { ...row, category: match.category, expenseType: match.expenseType, confidence: match.confidence, source: match.source };
  });
}

/** Draft shape shared with document import rules and the AI categorizer. Only description, amount and currency describe the expense. */
export function toDraft(row: QuickImportRow): ParsedTransactionDraft {
  return {
    id: row.id, kind: 'expense', date: row.date, amount: row.amount, currency: row.currency,
    description: row.description, suggestedCategory: row.category, suggestedExpenseType: row.expenseType,
    docType: 'receipt', sourceFile: 'quick-import', include: row.include, confidence: row.confidence,
  };
}

/** Apply AI suggestions returned for drafts made with toDraft. Rows the model did not change keep their local suggestion. */
export function applyAiSuggestions(rows: QuickImportRow[], drafts: ParsedTransactionDraft[]): QuickImportRow[] {
  const byId = new Map(drafts.filter(draft => draft.llmEnriched).map(draft => [draft.id, draft]));
  return rows.map(row => {
    const draft = byId.get(row.id);
    if (!draft?.suggestedCategory) return row;
    return {
      ...row, category: draft.suggestedCategory, expenseType: draft.suggestedExpenseType ?? row.expenseType,
      source: 'ai' as const, confidence: Math.max(row.confidence, 0.7),
    };
  });
}

/** Expenses for the included rows that have no error. */
export function quickRowsToExpenses(rows: QuickImportRow[]): ExpenseEntry[] {
  return rows.filter(row => row.include && !row.error).map(row => ({
    id: generateTransactionId(),
    type: 'expense' as const,
    date: row.date,
    amount: row.amount,
    description: row.description.trim(),
    category: row.category,
    expenseType: row.expenseType,
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.unitAmount !== undefined && row.quantity !== undefined
      && multiplyAmount(row.unitAmount, row.quantity) === row.amount
      ? { unitAmount: row.unitAmount, quantity: row.quantity } : {}),
  }));
}

/**
 * Return a copy of the tracker with the expenses appended to the month,
 * creating the year and month when missing. Existing entries are never
 * removed or reordered.
 */
export function appendExpensesToMonth(
  data: ExpenseTrackerData, year: number, month: number, expenses: ExpenseEntry[],
): ExpenseTrackerData {
  const years = data.years.some(entry => entry.year === year)
    ? data.years
    : [...data.years, createEmptyYearData(year)].sort((a, b) => a.year - b.year);
  return {
    ...data,
    years: years.map(yearData => {
      if (yearData.year !== year) return yearData;
      const months = yearData.months.some(entry => entry.month === month)
        ? yearData.months
        : [...yearData.months, createEmptyMonthData(year, month)].sort((a, b) => a.month - b.month);
      return {
        ...yearData,
        months: months.map(monthData => monthData.month === month
          ? { ...monthData, expenses: [...monthData.expenses, ...expenses] }
          : monthData),
      };
    }),
  };
}
