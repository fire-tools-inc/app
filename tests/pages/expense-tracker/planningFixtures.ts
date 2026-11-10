import type { ScheduledExpense, ExpensePlanningData, SavingsGoal } from '../../../src/types/expensePlanning';
import type { ExpenseTrackerData } from '../../../src/types/expenseTracker';

export function expenseSchedule(overrides: Partial<ScheduledExpense> = {}): ScheduledExpense {
  return {
    id: 'schedule-1', name: 'Test bill', kind: 'expense', amount: 100, currency: 'EUR',
    startDate: '2024-01-31', recurrence: { unit: 'month', interval: 1 },
    enabled: true, archived: false, category: 'UTILITIES', expenseType: 'NEED',
    ...overrides,
  };
}

export function savingsGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1', name: 'Test goal', currency: 'EUR', targetAmount: 1000,
    savedAmount: 100, targetDate: '2024-06-30', archived: false, ...overrides,
  };
}

export function planningFixture(overrides: Partial<ExpensePlanningData> = {}): ExpensePlanningData {
  return {
    schemaVersion: 1, schedules: [expenseSchedule()], skippedOccurrences: [],
    goals: [savingsGoal()], rules: [{
      id: 'rule-1', name: 'Test rule', kind: 'expense', enabled: true, priority: 0,
      match: { operator: 'contains', description: 'Test shop' },
      category: 'GROCERIES', expenseType: 'NEED',
    }],
    ...overrides,
  };
}

export function cashflowFixture(): ExpenseTrackerData {
  return {
    currentYear: 2024, currentMonth: 1, currency: 'EUR', globalBudgets: [],
    years: [{ year: 2024, months: [{
      year: 2024, month: 1, incomes: [], expenses: [], budgets: [],
    }] }],
  };
}
