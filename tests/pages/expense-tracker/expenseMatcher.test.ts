import { describe, expect, it } from 'vitest';
import {
  buildExpenseMatcher,
  getExpenseMatcher,
  tokenizeExpenseText,
} from '../../../src/utils/expenseMatcher';
import type { ExpenseEntry, ExpenseTrackerData, ExpenseType } from '../../../src/types/expenseTracker';

let sequence = 0;
const expense = (description: string, category: string, expenseType: ExpenseType = 'WANT'): ExpenseEntry => ({
  id: `synthetic-${sequence++}`, type: 'expense', date: '2025-03-05', amount: 10, description, category, expenseType,
});

const tracker = (expenses: ExpenseEntry[], extra: Partial<ExpenseTrackerData> = {}): ExpenseTrackerData => ({
  years: [{ year: 2025, months: [{ year: 2025, month: 3, incomes: [], expenses, budgets: [] }] }],
  currentYear: 2025, currentMonth: 3, currency: 'EUR', globalBudgets: [], ...extra,
});

describe('expense matcher tokenizer', () => {
  it('normalizes diacritics, brands, plurals and noise', () => {
    expect(tokenizeExpenseText("McDonald's 12,50 € on 03/11")).toEqual(['mcdonald']);
    expect(tokenizeExpenseText('Café crème')).toEqual(['cafe', 'creme']);
    expect(tokenizeExpenseText('H&M jeans 2x')).toEqual(['hm', 'jean']);
    expect(tokenizeExpenseText("Bolletta dell'acqua")).toEqual(['bolletta', 'acqua']);
    expect(tokenizeExpenseText('Groceries for the week')).toEqual(['grocery', 'week']);
    expect(tokenizeExpenseText('2026-11-03 12.50 EUR')).toEqual([]);
  });
});

describe('expense matcher', () => {
  it('uses the generic seed lexicon when there is no history', () => {
    const matcher = buildExpenseMatcher(tracker([]));
    expect(matcher.match('cinema').category).toBe('LIFESTYLE_LEISURE');
    expect(matcher.match('Cinéma avec amis')).toMatchObject({ category: 'LIFESTYLE_LEISURE', source: 'seed' });
    expect(matcher.match('Albert Heijn').category).toBe('GROCERIES');
    expect(matcher.match('Spesa supermercato').category).toBe('GROCERIES');
    expect(matcher.match('Netflix').category).toBe('SUBSCRIPTIONS');
    expect(matcher.match('uber').category).toBe('TRANSPORTATION');
    expect(matcher.match('Uber Eats').category).toBe('DINING_OUT');
    expect(matcher.match('gas bill').category).toBe('UTILITIES');
    expect(matcher.match('Zara shirt').category).toBe('CLOTHING');
    expect(matcher.match('new headphones').category).toBe('ELECTRONICS');
    expect(matcher.match('bank fee').category).toBe('BUSINESS');
    expect(matcher.match('Ryanair flight').category).toBe('TRAVEL');
  });

  it('suggests the category default Need/Want when history has no vote', () => {
    const match = buildExpenseMatcher(tracker([])).match('rent');
    expect(match).toMatchObject({ category: 'HOUSING', expenseType: 'NEED' });
    expect(match.confidence).toBeGreaterThan(0);
    expect(match.confidence).toBeLessThanOrEqual(1);
  });

  it('lets the user history override the seed, including the Need/Want choice', () => {
    const data = tracker([
      expense('Spotify', 'HOUSING', 'NEED'),
      expense('Spotify', 'HOUSING', 'NEED'),
      expense('Spotify family', 'HOUSING', 'NEED'),
    ]);
    const match = getExpenseMatcher(data).match('spotify');
    expect(match).toMatchObject({ category: 'HOUSING', expenseType: 'NEED', source: 'history' });
    expect(match.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match.alternatives.map(item => item.category)).toContain('SUBSCRIPTIONS');
  });

  it('learns custom categories and ignores categories that no longer exist', () => {
    const custom = { id: 'cat-synthetic-pets', name: 'Pets', icon: 'pets', color: '#123456', defaultExpenseType: 'NEED' as const };
    const data = tracker([
      expense('Vet visit', custom.id, 'NEED'),
      expense('Pet food', custom.id, 'NEED'),
      expense('Kibble bag', 'cat-deleted-category'),
    ], { customCategories: [custom] });
    const matcher = buildExpenseMatcher(data);
    expect(matcher.match('vet').category).toBe(custom.id);
    expect(matcher.match('pet food').expenseType).toBe('NEED');
    expect(matcher.match('kibble')).toMatchObject({ category: 'NO_CATEGORY', confidence: 0, source: 'none' });
  });

  it('maps retired categories in history to their replacement', () => {
    const match = buildExpenseMatcher(tracker([expense('Synthetic account charge', 'FEES', 'NEED')])).match('account charge');
    expect(match).toMatchObject({ category: 'BUSINESS', source: 'history', expenseType: 'NEED' });
  });

  it('returns no category for empty or unknown descriptions', () => {
    const matcher = buildExpenseMatcher(tracker([]));
    expect(matcher.match('12.50')).toEqual({ category: 'NO_CATEGORY', expenseType: 'WANT', confidence: 0, source: 'none', alternatives: [] });
    expect(matcher.match('zzqx').source).toBe('none');
  });

  it('builds the index once per tracker snapshot and handles thousands of rows', () => {
    const words = ['market', 'cafe', 'train', 'cinema', 'pharmacy', 'shoes', 'laptop', 'rent', 'insurance', 'gift'];
    const categories = ['GROCERIES', 'DINING_OUT', 'TRANSPORTATION', 'LIFESTYLE_LEISURE', 'HEALTHCARE', 'CLOTHING', 'ELECTRONICS', 'HOUSING', 'INSURANCE', 'GIFTS_DONATIONS'];
    const tag = (value: number): string => `shop${[...value.toString(26)].map(digit => String.fromCharCode(97 + parseInt(digit, 26))).join('')}`;
    const expenses = Array.from({ length: 5000 }, (_, index) =>
      expense(`${words[index % words.length]} synthetic ${tag(index % 1500)}`, categories[index % categories.length]));
    const data = tracker(expenses);
    const matcher = getExpenseMatcher(data);
    expect(getExpenseMatcher(data)).toBe(matcher);
    expect(getExpenseMatcher({ ...data })).not.toBe(matcher);
    expect(matcher.historySize).toBeGreaterThan(1000);
    for (let index = 0; index < 200; index++) matcher.match(`${words[index % words.length]} synthetic ${tag(index)}`);
    expect(matcher.match('cinema synthetic').category).toBe('LIFESTYLE_LEISURE');
  });
});
