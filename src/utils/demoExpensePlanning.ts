import type { ExpensePlanningData } from '../types/expensePlanning';
import { addCalendarDays, calendarDate } from './cashflowSchedules';

export function getDemoExpensePlanning(now = new Date()): ExpensePlanningData {
  const today = calendarDate(now);
  return {
    schemaVersion: 1,
    schedules: [{
      id: 'demo-schedule-purchase', name: 'Example planned purchase', kind: 'expense',
      amount: 450, currency: 'EUR', startDate: addCalendarDays(today, 14),
      recurrence: { unit: 'once', interval: 1 }, category: 'TRAVEL', expenseType: 'WANT',
      enabled: true, archived: false,
    }],
    skippedOccurrences: [],
    goals: [{
      id: 'demo-goal-reserve', name: 'Example emergency reserve', currency: 'EUR',
      targetAmount: 5000, savedAmount: 1750, targetDate: addCalendarDays(today, 180), archived: false,
    }],
    rules: [{
      id: 'demo-rule-shop', name: 'Example groceries rule', kind: 'expense', enabled: true, priority: 0,
      match: { description: 'Example shop', operator: 'contains' }, category: 'GROCERIES', expenseType: 'NEED',
    }],
    forecast: { openingBalance: 5000, startDate: today, horizon: 90, currency: 'EUR' },
  };
}
