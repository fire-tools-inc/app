/**
 * Yearly expenses workbook: one sheet per month (Jan–Dec) with one row per
 * expense (name, amount, category, Need/Want). Parsing, preview, merging into
 * the Expense Tracker and the downloadable template live here.
 *
 * Imported entries use ids starting with "wbe-". Their detail supersedes the
 * monthly spending totals added by the net worth workbook import ("wb-").
 */

import promptDocument from '../../docs/user/expense-import-agent-prompt.md?raw';
import { serialToDate, type XlsxCell, type XlsxSheet, type XlsxWorkbook } from './xlsxReader';
import { writeXlsxWorkbook, XLSX_MIME_TYPE, type XlsxWriteSheet, type XlsxWriteValue } from './xlsxWriter';
import {
  EXPENSE_WORKBOOK_ID_PREFIX,
  NET_WORTH_WORKBOOK_ID_PREFIX,
  monthFromName,
  normalizeText,
  parseNumericCell,
  referencedRows,
} from './workbookImport';
import { convertAmount } from './currencyConverter';
import { downloadFile } from './dataExportImport';
import { SUPPORTED_CURRENCIES, type ExchangeRates, type SupportedCurrency } from '../types/currency';
import {
  CATEGORY_COLORS,
  NO_CATEGORY_ID,
  createEmptyMonthData,
  createEmptyYearData,
  getAllCategories,
  getAvailableIcons,
  type CategoryInfo,
  type CustomCategory,
  type ExpenseEntry,
  type ExpenseTrackerData,
  type ExpenseType,
  type IncomeEntry,
} from '../types/expenseTracker';

const EXPENSE_IMPORT_PREFIX = EXPENSE_WORKBOOK_ID_PREFIX;
const NET_WORTH_IMPORT_PREFIX = NET_WORTH_WORKBOOK_ID_PREFIX;

export interface ExpenseWorkbookOptions {
  targetCurrency: SupportedCurrency;
  /** App exchange rates relative to `targetCurrency`. */
  fallbackRates: ExchangeRates;
}

export interface ExpenseWorkbookRow {
  row: number;
  name: string;
  /** Amount in the target currency. */
  amount: number;
  category: string;
  type: ExpenseType | 'INCOME' | null;
  day: number | null;
  note?: string;
}

export interface ExpenseWorkbookMonth {
  month: number;
  sheet: string;
  rows: ExpenseWorkbookRow[];
  /** A monthly income figure from a labelled cell beside the table. */
  incomeTotal: { amount: number; label: string } | null;
}

export type ExpenseWorkbookWarningCode = 'negativeAmount' | 'unsupportedCurrency' | 'duplicateMonthSheet' | 'invalidDay';

export interface ExpenseWorkbookWarning {
  code: ExpenseWorkbookWarningCode;
  sheet: string;
  row?: number;
  detail?: string;
}

export interface ExpenseWorkbookPlan {
  currency: SupportedCurrency;
  /** Year found in the file name or sheet names, if any. */
  detectedYear: number | null;
  months: ExpenseWorkbookMonth[];
  monthSheets: string[];
  ignoredSheets: string[];
  warnings: ExpenseWorkbookWarning[];
}

const SUPPORTED_CODES = new Set<string>(SUPPORTED_CURRENCIES.map((currency) => currency.code));
const AMOUNT_HEADER = /^(amount|importo|betrag|montant|importe|cost|costo|spent|spesa)$/;
const CATEGORY_HEADER = /^(category|categoria|kategorie|categorie)$/;
const TYPE_HEADER = /^(type|tipo|typ|kind|need\/want|need or want)$/;
const NAME_HEADER = /^(expense|expense name|name|description|item|descrizione|nome|beschreibung|libelle|descripcion|concepto)$/;
const DAY_HEADER = /^(day|date|giorno|data|tag|datum|jour|dia|fecha)$/;
const CURRENCY_HEADER = /^(cur|curr|currency|ccy|valuta|wahrung|devise|moneda|divisa)$/;
const NOTES_HEADER = /^(notes?|comments?)$/;
const INCOME_LABEL = /^(income|monthly income|total income|entrate|einnahmen|revenus?|ingresos?)(\s*\(.*\))?$/;
const TOTAL_ROW = /^((sub|grand )?totals?|sum|somma|totale|summe|gesamt|somme|suma)\b/;

function cellText(cell: XlsxCell | undefined): string {
  return cell && cell.value !== null ? String(cell.value).trim() : '';
}

function headerText(cell: XlsxCell | undefined): string {
  return normalizeText(cellText(cell)).replace(/\.$/, '');
}

function pad(month: number): string {
  return String(month).padStart(2, '0');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Four-digit year from the file name (e.g. "Expenses 2026.xlsx") or "YYYY-MM" sheet names. */
export function detectExpenseWorkbookYear(fileName: string, workbook: XlsxWorkbook): number | null {
  const fromName = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(fileName);
  if (fromName) return Number(fromName[1]);
  for (const sheet of workbook.sheets) {
    const match = /^\s*((?:19|20)\d{2})-\d{1,2}\s*$/.exec(sheet.name);
    if (match) return Number(match[1]);
  }
  return null;
}

function monthFromSheetName(name: string): number | null {
  const iso = /^\s*(?:19|20)\d{2}-(\d{1,2})\s*$/.exec(name);
  if (iso) {
    const month = Number(iso[1]);
    return month >= 1 && month <= 12 ? month : null;
  }
  return monthFromName(name);
}

interface TableColumns {
  headerRow: number;
  name: number;
  amount: number;
  category?: number;
  type?: number;
  day?: number;
  currency?: number;
  notes?: number;
}

function findTable(sheet: XlsxSheet): TableColumns | null {
  for (let row = 1; row <= Math.min(sheet.maxRow, 10); row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const find = (pattern: RegExp) => [...cells.entries()].sort((a, b) => a[0] - b[0]).find(([, cell]) => pattern.test(headerText(cell)))?.[0];
    const amount = find(AMOUNT_HEADER);
    if (amount === undefined) continue;
    const name = find(NAME_HEADER) ?? (amount > 1 ? amount - 1 : undefined);
    if (name === undefined) continue;
    return {
      headerRow: row, name, amount,
      category: find(CATEGORY_HEADER), type: find(TYPE_HEADER), day: find(DAY_HEADER),
      currency: find(CURRENCY_HEADER), notes: find(NOTES_HEADER),
    };
  }
  return null;
}

function parseType(text: string): ExpenseWorkbookRow['type'] {
  const value = normalizeText(text);
  if (/^(need|needs|bisogno|necessario|bedarf|besoin|necesidad)$/.test(value)) return 'NEED';
  if (/^(want|wants|desiderio|wunsch|envie|deseo)$/.test(value)) return 'WANT';
  if (/^(income|entrata|einnahme|revenu|ingreso)$/.test(value)) return 'INCOME';
  return null;
}

function parseDay(cell: XlsxCell | undefined, month: number, date1904: boolean): number | null | 'invalid' {
  if (!cell || cell.value === null || cell.value === '') return null;
  if (typeof cell.value === 'number') {
    if (Number.isInteger(cell.value) && cell.value >= 1 && cell.value <= 31) return cell.value;
    const date = serialToDate(cell.value, date1904);
    return date && date.month === month ? date.day : 'invalid';
  }
  const text = String(cell.value).trim();
  const iso = /^\d{4}-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return Number(iso[1]) === month ? Number(iso[2]) : 'invalid';
  const day = Number(text);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 'invalid';
}

function parseMonthSheet(
  sheet: XlsxSheet,
  month: number,
  table: TableColumns,
  workbook: XlsxWorkbook,
  options: ExpenseWorkbookOptions,
  warnings: ExpenseWorkbookWarning[],
): ExpenseWorkbookMonth {
  const tableColumns = new Set([table.name, table.amount, table.category, table.type, table.day, table.currency, table.notes]);
  const rows: ExpenseWorkbookRow[] = [];
  let incomeTotal: ExpenseWorkbookMonth['incomeTotal'] = null;

  for (const [row, cells] of [...sheet.rows.entries()].sort((a, b) => a[0] - b[0])) {
    // A labelled income figure beside the table, e.g. "Monthly income" | 3200.
    if (!incomeTotal) {
      for (const [column, cell] of cells) {
        if (tableColumns.has(column) || !INCOME_LABEL.test(headerText(cell))) continue;
        const amount = parseNumericCell(cells.get(column + 1));
        if (amount !== null && amount > 0) incomeTotal = { amount: round2(amount), label: cellText(cell) };
      }
    }
    if (row <= table.headerRow) continue;

    const name = cellText(cells.get(table.name));
    const amountCell = cells.get(table.amount);
    const amount = parseNumericCell(amountCell);
    if (!name || amount === null || amount === 0) continue;
    // Subtotals: named like a total, or a formula adding up other rows.
    if (TOTAL_ROW.test(normalizeText(name))) continue;
    if (amountCell?.formula && referencedRows(amountCell.formula).filter((other) => other !== row).length > 1) continue;
    const type = table.type ? parseType(cellText(cells.get(table.type))) : null;
    if (amount < 0) {
      warnings.push({ code: 'negativeAmount', sheet: sheet.name, row, detail: name });
      continue;
    }
    const currencyText = table.currency ? cellText(cells.get(table.currency)).toUpperCase() : '';
    if (currencyText && !SUPPORTED_CODES.has(currencyText)) {
      warnings.push({ code: 'unsupportedCurrency', sheet: sheet.name, row, detail: currencyText });
      continue;
    }
    const currency = (currencyText || options.targetCurrency) as SupportedCurrency;
    let day = table.day ? parseDay(cells.get(table.day), month, workbook.date1904) : null;
    if (day === 'invalid') {
      warnings.push({ code: 'invalidDay', sheet: sheet.name, row, detail: cellText(cells.get(table.day as number)) });
      day = null;
    }
    const note = table.notes ? cellText(cells.get(table.notes)) : '';
    rows.push({
      row, name, type, day,
      amount: round2(convertAmount(amount, currency, options.targetCurrency, options.fallbackRates)),
      category: table.category ? cellText(cells.get(table.category)) : '',
      ...(note ? { note } : {}),
    });
  }
  return { month, sheet: sheet.name, rows, incomeTotal };
}

/** Build an import plan from an expenses workbook. Pure: never writes storage. */
export function parseExpenseWorkbook(workbook: XlsxWorkbook, fileName: string, options: ExpenseWorkbookOptions): ExpenseWorkbookPlan {
  const warnings: ExpenseWorkbookWarning[] = [];
  const months: ExpenseWorkbookMonth[] = [];
  const monthSheets: string[] = [];
  const ignoredSheets: string[] = [];
  const seen = new Set<number>();
  for (const sheet of workbook.sheets) {
    const month = monthFromSheetName(sheet.name);
    const table = month ? findTable(sheet) : null;
    if (!month || !table) {
      ignoredSheets.push(sheet.name);
      continue;
    }
    if (seen.has(month)) {
      warnings.push({ code: 'duplicateMonthSheet', sheet: sheet.name });
      ignoredSheets.push(sheet.name);
      continue;
    }
    seen.add(month);
    monthSheets.push(sheet.name);
    months.push(parseMonthSheet(sheet, month, table, workbook, options, warnings));
  }
  months.sort((a, b) => a.month - b.month);
  return {
    currency: options.targetCurrency,
    detectedYear: detectExpenseWorkbookYear(fileName, workbook),
    months, monthSheets, ignoredSheets, warnings,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Unambiguous one-to-one names for built-in categories. */
const CATEGORY_SYNONYMS: Record<string, string> = {
  rent: 'HOUSING', housing: 'HOUSING', home: 'HOUSING',
  utilities: 'UTILITIES', bills: 'UTILITIES',
  transport: 'TRANSPORTATION', transportation: 'TRANSPORTATION',
  groceries: 'GROCERIES', supermarket: 'GROCERIES',
  dining: 'DINING_OUT', restaurants: 'DINING_OUT', 'eating out': 'DINING_OUT', 'dining out': 'DINING_OUT',
  health: 'HEALTHCARE', healthcare: 'HEALTHCARE',
  insurance: 'INSURANCE', entertainment: 'ENTERTAINMENT', shopping: 'SHOPPING',
  'personal care': 'PERSONAL_CARE', selfcare: 'PERSONAL_CARE', 'self care': 'PERSONAL_CARE',
  education: 'EDUCATION', debt: 'DEBT_PAYMENTS', 'debt payments': 'DEBT_PAYMENTS', loans: 'DEBT_PAYMENTS',
  business: 'BUSINESS', fees: 'FEES', leisure: 'LIFESTYLE_LEISURE', lifestyle: 'LIFESTYLE_LEISURE',
  collectibles: 'COLLECTIBLES', music: 'MUSIC', travel: 'TRAVEL', holidays: 'HOLIDAYS', vacation: 'HOLIDAYS',
  gifts: 'GIFTS_DONATIONS', donations: 'GIFTS_DONATIONS', giving: 'GIFTS_DONATIONS', charity: 'GIFTS_DONATIONS',
  subscriptions: 'SUBSCRIPTIONS', other: 'OTHER', misc: 'OTHER', miscellaneous: 'OTHER',
  uncategorized: NO_CATEGORY_ID, 'no category': NO_CATEGORY_ID,
};

export interface CategoryResolution {
  /** Normalised workbook label -> category id. */
  ids: Map<string, string>;
  /** Labels that become new custom categories. */
  created: CustomCategory[];
}

function slug(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
}

/**
 * Match workbook category labels to existing categories (by name, then by an
 * unambiguous synonym); anything else becomes a custom category so the
 * workbook's own grouping is preserved.
 */
export function resolveExpenseCategories(plan: ExpenseWorkbookPlan, data: ExpenseTrackerData | null): CategoryResolution {
  const existing: CategoryInfo[] = getAllCategories(data?.customCategories, data?.categoryOverrides);
  const byName = new Map(existing.map((category) => [normalizeText(category.name), category.id]));
  const ids = new Map<string, string>();
  const created: CustomCategory[] = [];
  const typeVotes = new Map<string, { need: number; want: number }>();
  const labels = new Map<string, string>();
  for (const month of plan.months) {
    for (const row of month.rows) {
      if (row.type === 'INCOME') continue;
      const key = normalizeText(row.category);
      if (!labels.has(key)) labels.set(key, row.category.trim());
      const votes = typeVotes.get(key) ?? { need: 0, want: 0 };
      if (row.type === 'NEED') votes.need++;
      if (row.type === 'WANT') votes.want++;
      typeVotes.set(key, votes);
    }
  }
  const icons = getAvailableIcons(data?.customCategories, data?.categoryOverrides);
  const usedIds = new Set(existing.map((category) => category.id));
  for (const [key, label] of labels) {
    const known = key ? byName.get(key) ?? CATEGORY_SYNONYMS[key] : NO_CATEGORY_ID;
    if (known) {
      ids.set(key, known);
      continue;
    }
    let id = `cat-wbe-${slug(label)}`;
    for (let suffix = 2; usedIds.has(id); suffix++) id = `cat-wbe-${slug(label)}-${suffix}`;
    usedIds.add(id);
    const votes = typeVotes.get(key) ?? { need: 0, want: 0 };
    created.push({
      id,
      name: label,
      icon: icons[created.length] ?? 'label',
      color: CATEGORY_COLORS[((data?.customCategories?.length ?? 0) + created.length) % CATEGORY_COLORS.length],
      defaultExpenseType: votes.want > votes.need ? 'WANT' : 'NEED',
    });
    ids.set(key, id);
  }
  return { ids, created };
}

// ---------------------------------------------------------------------------
// Preview and merge
// ---------------------------------------------------------------------------

export type ExistingMonthPolicy = 'keep' | 'replace';

export interface ExpenseWorkbookPreview {
  months: number[];
  futureMonths: number[];
  expenses: number;
  incomes: number;
  conflictingMonths: number;
  newCategories: string[];
}

export interface ExpenseWorkbookSummary {
  monthsImported: number;
  monthsKept: number;
  expensesImported: number;
  incomesImported: number;
  incomeMonthsSkipped: number;
  categoriesCreated: number;
  futureMonthsSkipped: number;
}

function isFuture(year: number, month: number, now: Date): boolean {
  return year * 12 + month > now.getFullYear() * 12 + now.getMonth() + 1;
}

function isUserEntry(entry: { id: string }): boolean {
  return !entry.id.startsWith(EXPENSE_IMPORT_PREFIX) && !entry.id.startsWith(NET_WORTH_IMPORT_PREFIX);
}

function monthIncomes(month: ExpenseWorkbookMonth, year: number): IncomeEntry[] {
  const date = `${year}-${pad(month.month)}`;
  const rows: IncomeEntry[] = month.rows.filter((row) => row.type === 'INCOME').map((row) => ({
    id: `${EXPENSE_IMPORT_PREFIX}${year}${pad(month.month)}-${row.row}-inc`,
    type: 'income', date: `${date}-${pad(Math.min(row.day ?? 1, daysInMonth(year, month.month)))}`,
    amount: row.amount, description: row.name, source: 'OTHER',
  }));
  if (rows.length === 0 && month.incomeTotal) {
    rows.push({
      id: `${EXPENSE_IMPORT_PREFIX}${year}${pad(month.month)}-income`, type: 'income', date: `${date}-01`,
      amount: month.incomeTotal.amount, description: month.incomeTotal.label, source: 'OTHER',
    });
  }
  return rows;
}

export function previewExpenseWorkbook(
  plan: ExpenseWorkbookPlan,
  current: ExpenseTrackerData | null,
  year: number,
  now = new Date(),
): ExpenseWorkbookPreview {
  const months = plan.months.filter((month) => !isFuture(year, month.month, now));
  let conflictingMonths = 0;
  for (const month of months) {
    const existing = current?.years.find((item) => item.year === year)?.months.find((item) => item.month === month.month);
    if (existing?.expenses.some(isUserEntry) && month.rows.some((row) => row.type !== 'INCOME')) conflictingMonths++;
  }
  return {
    months: months.map((month) => month.month),
    futureMonths: plan.months.filter((month) => isFuture(year, month.month, now)).map((month) => month.month),
    expenses: months.reduce((sum, month) => sum + month.rows.filter((row) => row.type !== 'INCOME').length, 0),
    incomes: months.reduce((sum, month) => sum + monthIncomes(month, year).length, 0),
    conflictingMonths,
    newCategories: resolveExpenseCategories({ ...plan, months }, current).created.map((category) => category.name),
  };
}

/**
 * Merge the plan into Expense Tracker data for `year`.
 * - Earlier imports of this workbook ("wbe-") are replaced, and monthly
 *   spending totals from the net worth import ("wb-") give way to the detail.
 * - "keep" skips months whose expenses you entered yourself; "replace"
 *   overwrites them. Income only fills months without income unless replacing.
 * - Months after the current month are skipped (prefilled future bills).
 */
export function mergeExpenseWorkbook(
  plan: ExpenseWorkbookPlan,
  current: ExpenseTrackerData | null,
  selection: { year: number; existingMonths: ExistingMonthPolicy },
  now = new Date(),
): { data: ExpenseTrackerData; summary: ExpenseWorkbookSummary } {
  const { year, existingMonths } = selection;
  const data: ExpenseTrackerData = current
    ? structuredClone(current)
    : {
      years: [], currentYear: now.getFullYear(), currentMonth: now.getMonth() + 1,
      currency: plan.currency, globalBudgets: [],
    };
  const summary: ExpenseWorkbookSummary = {
    monthsImported: 0, monthsKept: 0, expensesImported: 0, incomesImported: 0,
    incomeMonthsSkipped: 0, categoriesCreated: 0, futureMonthsSkipped: 0,
  };
  const months = plan.months.filter((month) => {
    if (!isFuture(year, month.month, now)) return true;
    summary.futureMonthsSkipped++;
    return false;
  });
  const categories = resolveExpenseCategories({ ...plan, months }, data);
  const categoryTypes = new Map(getAllCategories(
    [...(data.customCategories ?? []), ...categories.created], data.categoryOverrides,
  ).map((category) => [category.id, category.defaultExpenseType]));
  const usedCategories = new Set<string>();

  for (const month of months) {
    const expenses: ExpenseEntry[] = month.rows.filter((row) => row.type !== 'INCOME').map((row) => {
      const category = categories.ids.get(normalizeText(row.category)) ?? NO_CATEGORY_ID;
      return {
        id: `${EXPENSE_IMPORT_PREFIX}${year}${pad(month.month)}-${row.row}`,
        type: 'expense',
        date: `${year}-${pad(month.month)}-${pad(Math.min(row.day ?? 1, daysInMonth(year, month.month)))}`,
        amount: row.amount,
        description: row.note ? `${row.name} (${row.note})` : row.name,
        currency: plan.currency,
        category,
        expenseType: row.type === 'NEED' || row.type === 'WANT' ? row.type : categoryTypes.get(category) ?? 'NEED',
      };
    });
    const incomes = monthIncomes(month, year).map((income) => ({ ...income, currency: plan.currency }));
    if (expenses.length === 0 && incomes.length === 0) continue;

    let yearData = data.years.find((item) => item.year === year);
    if (!yearData) {
      yearData = createEmptyYearData(year);
      data.years.push(yearData);
    }
    let monthData = yearData.months.find((item) => item.month === month.month);
    if (!monthData) {
      monthData = createEmptyMonthData(year, month.month);
      yearData.months.push(monthData);
    }

    let changed = false;
    if (expenses.length > 0) {
      const userExpenses = monthData.expenses.filter(isUserEntry);
      if (userExpenses.length > 0 && existingMonths === 'keep') {
        summary.monthsKept++;
      } else {
        monthData.expenses = [...(existingMonths === 'replace' ? [] : userExpenses), ...expenses];
        summary.expensesImported += expenses.length;
        for (const expense of expenses) usedCategories.add(expense.category);
        changed = true;
      }
    }
    if (incomes.length > 0) {
      const otherIncomes = monthData.incomes.filter((entry) => !entry.id.startsWith(EXPENSE_IMPORT_PREFIX));
      if (otherIncomes.length > 0 && existingMonths === 'keep') {
        summary.incomeMonthsSkipped++;
      } else {
        monthData.incomes = incomes;
        summary.incomesImported += incomes.length;
        changed = true;
      }
    }
    if (changed) summary.monthsImported++;
  }

  const created = categories.created.filter((category) => usedCategories.has(category.id));
  if (created.length > 0) {
    data.customCategories = [...(data.customCategories ?? []), ...created];
    summary.categoriesCreated = created.length;
  }
  data.years.sort((a, b) => a.year - b.year);
  for (const item of data.years) item.months.sort((a, b) => a.month - b.month);
  return { data, summary };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const MONTH_SHEETS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TABLE_HEADERS = ['Expense name', 'Amount', 'Category', 'Type', 'Day', 'Currency', 'Notes'];
const TABLE_WIDTHS = [34, 12, 24, 10, 8, 10, 36];

export function expenseTemplateFileName(year: number): string {
  return `fire-tools-expenses-${year}.xlsx`;
}

/** The copy-ready prompt: everything after the first horizontal rule. */
export function getExpenseAgentPrompt(): string {
  const parts = promptDocument.split(/\r?\n---\r?\n/);
  return (parts.length > 1 ? parts.slice(1).join('\n---\n') : promptDocument).trim();
}

function header(values: string[]): XlsxWriteValue[] {
  return values.map((value) => ({ value, style: 'header' as const }));
}

/** Template for one year: README, a fictional Example sheet and Jan–Dec sheets. */
export function buildExpenseWorkbookTemplate(options: { year: number; currency: SupportedCurrency; categories: string[] }): Uint8Array {
  const { year, currency, categories } = options;
  const readme: XlsxWriteValue[][] = [
    [{ value: `Fire Tools expenses ${year}`, style: 'title' }],
    [`One workbook per year. Keep the year in the file name, e.g. "Expenses ${year}.xlsx".`],
    ['Import it in Fire Tools: Expense Tracker > Data Management > Import expenses (XLSX), or Settings > Data.'],
    [],
    [{ value: 'How to fill it', style: 'section' }],
    ['1. One sheet per month named Jan ... Dec. Only month sheets are read; README and Example are ignored.'],
    ['2. One row per expense: name and a positive amount. Rows without a name or with amount 0 are skipped.'],
    ['3. Category: pick one from the list below or type your own; new names become custom categories.'],
    ['4. Type: Need or Want (empty uses the category default). Use Income for money received that month.'],
    [`5. Day (1-31) and Currency are optional. Amounts in other currencies are converted to ${currency}.`],
    ['6. Months after the current month are skipped, so you can prefill upcoming bills safely.'],
    [],
    header(['Category']),
    ...categories.map((category) => [category]),
    [],
    [{ value: 'Using an AI assistant', style: 'section' }],
    ['Copy the prompt below into your assistant together with your bank or card statements.'],
    [],
    ...getExpenseAgentPrompt().split(/\r?\n/).map((line) => [line ? { value: line, style: 'muted' as const } : null]),
  ];
  const firstCategoryRow = readme.findIndex((row) => row[0] === categories[0]) + 1;
  const categoryRange = categories.length
    ? `README!$A$${firstCategoryRow}:$A$${firstCategoryRow + categories.length - 1}`
    : '"Other"';
  const validations = [
    // Advisory only: new category names are allowed and become custom categories.
    { range: 'C2:C500', source: categoryRange, strict: false },
    { range: 'D2:D500', source: '"Need,Want,Income"' },
    { range: 'F2:F500', source: `"${SUPPORTED_CURRENCIES.map((item) => item.code).join(',')}"` },
  ];
  const monthSheet = (name: string, rows: XlsxWriteValue[][]): XlsxWriteSheet => ({
    name, rows: [header(TABLE_HEADERS), ...rows], columnWidths: TABLE_WIDTHS, freezeRows: 1, listValidations: validations,
  });
  const example: XlsxWriteValue[][] = [
    ['Rent', 950, 'Housing', 'Need', 1, null, 'Fictional example'],
    ['Supermarket', 82.4, 'Groceries', 'Need', 6],
    ['Train pass', 49, 'Transportation', 'Need', 2],
    ['Cinema', 24, 'Entertainment', 'Want', 14],
    ['Streaming service', 12.99, 'Subscriptions', 'Want', 20, 'USD'],
    ['Salary', 2800, null, 'Income', 25],
  ];
  return writeXlsxWorkbook([
    { name: 'README', rows: readme, columnWidths: [100] },
    monthSheet('Example', example),
    ...MONTH_SHEETS.map((name) => monthSheet(name, [])),
  ]);
}

export function downloadExpenseWorkbookTemplate(options: { year: number; currency: SupportedCurrency; data: ExpenseTrackerData | null }): void {
  const categories = getAllCategories(options.data?.customCategories, options.data?.categoryOverrides)
    .filter((category) => category.id !== NO_CATEGORY_ID)
    .map((category) => category.name);
  const bytes = buildExpenseWorkbookTemplate({ year: options.year, currency: options.currency, categories });
  downloadFile(new Blob([new Uint8Array(bytes)], { type: XLSX_MIME_TYPE }), expenseTemplateFileName(options.year), XLSX_MIME_TYPE);
}
