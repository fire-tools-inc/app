import { describe, expect, it } from 'vitest';
import { applyImportCategorizationRules } from '../../../src/utils/importCategorizationRules';
import type { ParsedTransactionDraft } from '../../../src/types/pdfImport';
import type { ExpenseCategorizationRule } from '../../../src/types/expensePlanning';
import { planningFixture } from './planningFixtures';

const draft = (): ParsedTransactionDraft => ({
  id: 'draft-1', kind: 'expense', date: '2024-01-31', amount: 12, currency: 'EUR',
  description: '  TEST  SHOP  ', docType: 'receipt', sourceFile: 'synthetic.pdf',
  include: true, confidence: 1,
});
const expenseRule = (overrides: Partial<ExpenseCategorizationRule> = {}): ExpenseCategorizationRule => ({
  id: 'rule', name: 'Test', kind: 'expense', enabled: true, priority: 0,
  match: { description: 'test shop', operator: 'contains' },
  category: 'GROCERIES', expenseType: 'NEED', ...overrides,
});

describe('offline import categorization rules', () => {
  it('suggests labels from a literal normalized description without changing financial facts', () => {
    const original = draft();
    const result = applyImportCategorizationRules([original], planningFixture().rules, 'EUR');
    expect(result.drafts[0]).toEqual({
      ...original, suggestedCategory: 'GROCERIES', suggestedExpenseType: 'NEED',
    });
    expect(result.matches).toEqual({ 'draft-1': 'Test rule' });
    expect(original).toEqual(draft());
  });

  it('uses the first enabled rule in priority order without mutating the rules', () => {
    const rules = [
      expenseRule({ id: 'last', priority: 2, category: 'DINING_OUT' }),
      expenseRule({ id: 'disabled', enabled: false }),
      expenseRule({ id: 'first', priority: 1, category: 'UTILITIES' }),
    ];
    const before = structuredClone(rules);
    expect(applyImportCategorizationRules([draft()], rules, 'EUR').drafts[0].suggestedCategory).toBe('UTILITIES');
    expect(rules).toEqual(before);
  });

  it('matches exact descriptions literally rather than interpreting regular expressions', () => {
    const result = applyImportCategorizationRules([draft()], [
      expenseRule({ match: { description: 'test.*shop', operator: 'equals' } }),
    ], 'EUR');
    expect(result.matches).toEqual({});
  });

  it('requires matching currency and uses inclusive amount boundaries', () => {
    const rule = expenseRule({ match: {
      description: 'test shop', operator: 'equals', currency: 'EUR', minAmount: 12, maxAmount: 12,
    } });
    expect(applyImportCategorizationRules([draft()], [rule], 'EUR').matches).toHaveProperty('draft-1');
    expect(applyImportCategorizationRules([{ ...draft(), currency: 'USD' }], [rule], 'EUR').matches).toEqual({});
  });

  it('reports missing categories instead of assigning a fallback', () => {
    const result = applyImportCategorizationRules([draft()], [expenseRule({ category: 'deleted' })], 'EUR');
    expect(result.invalidRuleIds).toEqual(['rule']);
    expect(result.drafts).toEqual([draft()]);
  });

  it('supports income labels and special draft IDs without changing the transaction kind', () => {
    const income = { ...draft(), id: '__proto__', kind: 'income' as const };
    const result = applyImportCategorizationRules([income], [{
      id: 'income-rule', name: 'Test income', kind: 'income', source: 'FREELANCE', enabled: true, priority: 0,
      match: { description: 'test shop', operator: 'contains' },
    }], 'EUR');
    expect(result.drafts[0]).toEqual({ ...income, suggestedIncomeSource: 'FREELANCE' });
    expect(Object.keys(result.matches)).toEqual(['__proto__']);
  });
});
