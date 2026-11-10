import { z } from 'zod';
import {
  INCOME_SOURCES, EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseTrackerData, type MonthData, type YearData, type IncomeEntry, type ExpenseEntry,
} from '../types/expenseTracker';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types/currency';
import { expensePlanningSchema, validateExpenseTrackerPlanning } from './expensePlanning';
import { isValidCalendarDate } from './dateValidation';

const currency = z.custom<SupportedCurrency>(value =>
  typeof value === 'string' && SUPPORTED_CURRENCIES.some(item => item.code === value));
const categoryBudget = z.object({
  category: z.string().min(1), monthlyBudget: z.number().finite().nonnegative(), currency: currency.optional(),
}).strict();
const metadataSchema = z.object({
  version: z.literal(2), currentYear: z.number().int().min(1900).max(2100), currentMonth: z.number().int().min(1).max(12),
  globalBudgets: z.array(categoryBudget),
  customCategories: z.array(z.object({
    id: z.string().min(1), name: z.string(), icon: z.string(), color: z.string(), defaultExpenseType: z.enum(['NEED', 'WANT']),
  }).strict()).optional(),
  categoryOverrides: z.array(z.object({
    id: z.custom<ExpenseCategory>(value => typeof value === 'string' && EXPENSE_CATEGORIES.some(item => item.id === value)),
    name: z.string().optional(), icon: z.string().optional(), color: z.string().optional(),
  }).strict()).optional(),
  planning: expensePlanningSchema.optional(),
  years: z.array(z.object({
    year: z.number().int().min(1900).max(2100), isArchived: z.boolean().optional(),
    months: z.array(z.object({ month: z.number().int().min(1).max(12), isClosed: z.boolean().optional() }).strict()),
  }).strict()),
}).strict();

function csvCell(value: string | number | boolean | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n') throw new Error('Unexpected text after a quoted CSV field.');
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { cell += '"'; index++; }
      else if (quoted) { quoted = false; afterQuote = true; }
      else if (cell.length === 0) quoted = true;
      else throw new Error('Invalid CSV quoting.');
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; afterQuote = false; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = ''; afterQuote = false;
    } else cell += char;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

export function exportExpenseTrackerToCSV(data: ExpenseTrackerData): string {
  const rows: (string | number | boolean | undefined)[][] = [
    ['Expense Tracker Data Export', 2], ['Generated', new Date().toISOString()], ['Currency', data.currency], [],
    ['Income Entries'], ['ID', 'Date', 'Amount', 'Description', 'Source', 'Currency', 'IsRecurring', 'ScheduleID', 'ScheduledDate'],
  ];
  for (const year of data.years) for (const month of year.months) for (const entry of month.incomes) {
    rows.push([entry.id, entry.date, entry.amount, entry.description, entry.source, entry.currency, entry.isRecurring, entry.scheduleId, entry.scheduledDate]);
  }
  rows.push([], ['Expense Entries'], ['ID', 'Date', 'Amount', 'Description', 'Category', 'SubCategory', 'ExpenseType', 'Currency', 'IsRecurring', 'ScheduleID', 'ScheduledDate']);
  for (const year of data.years) for (const month of year.months) for (const entry of month.expenses) {
    rows.push([entry.id, entry.date, entry.amount, entry.description, entry.category, entry.subCategory, entry.expenseType, entry.currency, entry.isRecurring, entry.scheduleId, entry.scheduledDate]);
  }
  rows.push([], ['Monthly Budgets'], ['Year', 'Month', 'Category', 'MonthlyBudget', 'Currency']);
  for (const year of data.years) for (const month of year.months) for (const budget of month.budgets) {
    rows.push([year.year, month.month, budget.category, budget.monthlyBudget, budget.currency]);
  }
  rows.push([], ['Tracker Metadata'], ['Metadata', JSON.stringify({
    version: 2, currentYear: data.currentYear, currentMonth: data.currentMonth,
    globalBudgets: data.globalBudgets ?? [], customCategories: data.customCategories,
    categoryOverrides: data.categoryOverrides, planning: data.planning,
    years: data.years.map(year => ({
      year: year.year, isArchived: year.isArchived, months: year.months.map(month => ({ month: month.month, isClosed: month.isClosed })),
    })),
  })]);
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

export function importExpenseTrackerFromCSV(csv: string): ExpenseTrackerData {
  const rows = csvRows(csv.replace(/^\uFEFF/, ''));
  if (rows[0]?.[0] !== 'Expense Tracker Data Export' || (rows[0][1] && rows[0][1] !== '2')) {
    throw new Error('Invalid or unsupported Cashflow Tracker CSV.');
  }
  const metadataIndex = rows.findIndex(row => row.length === 1 && row[0] === 'Tracker Metadata');
  const metadataRow = metadataIndex >= 0 ? rows[metadataIndex + 1] : undefined;
  if (metadataRow && metadataRow[0] !== 'Metadata') throw new Error('Invalid CSV metadata section.');
  const metadata = metadataRow ? metadataSchema.parse(JSON.parse(metadataRow[1])) : undefined;
  const currencyRow = rows.find(row => row[0] === 'Currency');
  const trackerCurrency = currency.parse(currencyRow?.[1] ?? 'EUR');
  const years = new Map<number, YearData>();
  const monthFor = (year: number, month: number): MonthData => {
    if (!Number.isInteger(year) || year < 1900 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('Invalid CSV year or month.');
    }
    let yearData = years.get(year);
    if (!yearData) { yearData = { year, months: [] }; years.set(year, yearData); }
    let monthData = yearData.months.find(item => item.month === month);
    if (!monthData) {
      monthData = { year, month, incomes: [], expenses: [], budgets: [] };
      yearData.months.push(monthData);
    }
    return monthData;
  };
  if (metadata) for (const year of metadata.years) {
    const yearData: YearData = { year: year.year, months: [], ...(year.isArchived === undefined ? {} : { isArchived: year.isArchived }) };
    years.set(year.year, yearData);
    for (const month of year.months) {
      const entry = monthFor(year.year, month.month);
      if (month.isClosed !== undefined) entry.isClosed = month.isClosed;
    }
  }
  let section = '';
  let header: string[] = [];
  const ids = new Set<string>();
  for (const row of rows.slice(1)) {
    if (['Income Entries', 'Expense Entries', 'Monthly Budgets', 'Tracker Metadata'].includes(row[0])) {
      section = row[0]; header = []; continue;
    }
    if (row[0] === 'ID' || row[0] === 'Year') { header = row; continue; }
    if (!header.length || section === 'Tracker Metadata') continue;
    const value = (name: string, required = false): string => {
      const entry = row[header.indexOf(name)] ?? '';
      if (required && !entry.trim()) throw new Error(`Missing CSV field: ${name}`);
      return entry;
    };
    const number = (name: string): number => {
      const entry = Number(value(name, true));
      if (!Number.isFinite(entry) || entry < 0) throw new Error(`Invalid CSV amount: ${name}`);
      return entry;
    };
    const entryCurrency = value('Currency') ? currency.parse(value('Currency')) : undefined;
    if (section === 'Monthly Budgets') {
      monthFor(number('Year'), number('Month')).budgets.push({
        category: value('Category', true), monthlyBudget: number('MonthlyBudget'), ...(entryCurrency ? { currency: entryCurrency } : {}),
      });
      continue;
    }
    const id = value('ID', true);
    const date = value('Date', true);
    if (!isValidCalendarDate(date) || ids.has(id)) throw new Error('Invalid date or duplicate transaction ID in CSV.');
    ids.add(id);
    const recurring = value('IsRecurring');
    if (recurring && recurring !== 'true' && recurring !== 'false') throw new Error('Invalid recurring flag in CSV.');
    const base = {
      id, date, amount: number('Amount'), description: value('Description'),
      ...(entryCurrency ? { currency: entryCurrency } : {}),
      ...(recurring ? { isRecurring: recurring === 'true' } : {}),
      ...(value('ScheduleID') ? { scheduleId: value('ScheduleID') } : {}),
      ...(value('ScheduledDate') ? { scheduledDate: value('ScheduledDate') } : {}),
    };
    const [year, month] = date.split('-').map(Number);
    const target = monthFor(year, month);
    if (section === 'Income Entries') {
      const source = INCOME_SOURCES.find(item => item.id === value('Source', true))?.id;
      if (!source) throw new Error('Invalid income source in CSV.');
      const income: IncomeEntry = { ...base, type: 'income', source };
      target.incomes.push(income);
    } else if (section === 'Expense Entries') {
      const expenseType = value('ExpenseType', true);
      if (expenseType !== 'NEED' && expenseType !== 'WANT') throw new Error('Invalid expense type in CSV.');
      const expense: ExpenseEntry = {
        ...base, type: 'expense', category: value('Category', true), expenseType,
        ...(value('SubCategory') ? { subCategory: value('SubCategory') } : {}),
      };
      target.expenses.push(expense);
    }
  }
  const now = new Date();
  const result: ExpenseTrackerData = {
    years: [...years.values()],
    currentYear: metadata?.currentYear ?? now.getFullYear(), currentMonth: metadata?.currentMonth ?? now.getMonth() + 1,
    currency: trackerCurrency, globalBudgets: metadata?.globalBudgets ?? [],
    ...(metadata?.planning ? { planning: metadata.planning } : {}),
    ...(metadata?.customCategories ? { customCategories: metadata.customCategories } : {}),
    ...(metadata?.categoryOverrides ? { categoryOverrides: metadata.categoryOverrides } : {}),
  };
  validateExpenseTrackerPlanning(result);
  return result;
}
