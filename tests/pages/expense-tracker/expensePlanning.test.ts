import { beforeEach, describe, expect, it } from 'vitest';
import { parseExpensePlanning, removeExpenseCategory } from '../../../src/utils/expensePlanning';
import { loadExpenseTrackerData, saveExpenseTrackerData } from '../../../src/utils/cookieStorage';
import { expectDiagnostic } from '../../shared/diagnostics';
import { cashflowFixture, expenseSchedule, planningFixture, savingsGoal } from './planningFixtures';

describe('expense planning contract', () => {
  it('keeps category deletion consistent across ledger entries, schedules and rules', () => {
    const data = {
      ...cashflowFixture(), planning: planningFixture(),
      customCategories: [{ id: 'custom', name: 'Synthetic', icon: 'pets', color: '#65D4C4', defaultExpenseType: 'NEED' as const }],
    };
    data.planning.schedules = [expenseSchedule({ category: 'custom' })];
    data.planning.rules = [{
      id: 'rule', name: 'Test', kind: 'expense', enabled: true, priority: 0, category: 'custom', expenseType: 'NEED',
      match: { operator: 'contains', description: 'Test' },
    }];
    const reassigned = removeExpenseCategory(data, 'custom', 'NO_CATEGORY');
    expect(reassigned.planning?.schedules[0]).toMatchObject({ category: 'NO_CATEGORY', enabled: true });
    expect(reassigned.planning?.rules[0]).toMatchObject({ category: 'NO_CATEGORY', enabled: true });
    expect(removeExpenseCategory(data, 'custom').planning?.rules[0]).toMatchObject({ category: 'custom', enabled: false });
    expect(data.customCategories).toHaveLength(1);
  });
  it('reads legacy absence as an empty planning document without inventing balances', () => {
    expect(parseExpensePlanning(undefined)).toEqual({
      schemaVersion: 1,
      schedules: [],
      skippedOccurrences: [],
      goals: [],
      rules: [],
    });
  });

  it('validates a complete versioned planning document', () => {
    const planning = planningFixture();
    expect(parseExpensePlanning(planning)).toEqual(planning);
  });

  it.each([
    null,
    { ...planningFixture(), schemaVersion: 2 },
    planningFixture({ schedules: [expenseSchedule({ amount: NaN })] }),
    planningFixture({ schedules: [expenseSchedule({ startDate: '2024-02-30' })] }),
    planningFixture({ schedules: [expenseSchedule({ recurrence: { unit: 'month', interval: 0 } })] }),
    planningFixture({ schedules: [expenseSchedule(), expenseSchedule()] }),
    planningFixture({ goals: [savingsGoal({ targetAmount: 0 })] }),
    planningFixture({ goals: [savingsGoal({ savedAmount: -1 })] }),
    planningFixture({ skippedOccurrences: [{ scheduleId: 'missing', scheduledDate: '2024-01-31' }] }),
    planningFixture({ rules: [{
      id: 'invalid', name: 'Test rule', kind: 'expense', enabled: true, priority: 0,
      match: { description: 'Test', operator: 'contains', minAmount: 10 },
      category: 'GROCERIES', expenseType: 'NEED',
    }] }),
  ])('rejects invalid or unsupported planning metadata %#', value => {
    expect(() => parseExpensePlanning(value)).toThrow();
  });
});

describe('planning snapshot persistence', () => {
  beforeEach(() => localStorage.clear());

  it('retains the previous complete cashflow snapshot after invalid planning edits', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    saveExpenseTrackerData(data);
    const previous = localStorage.getItem('fire-tools-expense-tracker');
    expect(() => saveExpenseTrackerData({
      ...data, planning: planningFixture({ goals: [savingsGoal({ savedAmount: -1 })] }),
    })).toThrow();
    expectDiagnostic('error', '[save-failed]: failed to save expense tracker data');
    expect(localStorage.getItem('fire-tools-expense-tracker')).toBe(previous);
    expect(loadExpenseTrackerData()).toEqual(data);
  });

  it('rejects duplicate occurrence references across the complete ledger', () => {
    const data = cashflowFixture();
    data.years[0].months[0].expenses.push(...['first', 'second'].map(id => ({
      id, type: 'expense' as const, date: '2024-01-31', amount: 100, description: 'Test bill',
      category: 'UTILITIES', expenseType: 'NEED' as const,
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    })));
    expect(() => saveExpenseTrackerData(data)).toThrow();
    expectDiagnostic('error', '[save-failed]: failed to save expense tracker data');
    expect(localStorage.getItem('fire-tools-expense-tracker')).toBeNull();
  });
});
