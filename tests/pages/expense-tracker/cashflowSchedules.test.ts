import { describe, expect, it } from 'vitest';
import { addCalendarDays, buildCashflowForecast, getScheduleOccurrences, scheduleDates } from '../../../src/utils/cashflowSchedules';
import { linkScheduledOccurrence, recordScheduledOccurrence, skipScheduledOccurrence } from '../../../src/utils/scheduledTransactions';
import { cashflowTransactions } from '../../../src/utils/expensePlanning';
import { cashflowFixture, expenseSchedule, planningFixture } from './planningFixtures';

describe('cashflow schedules', () => {
  it('clamps short months without losing the original month-end anchor', () => {
    expect(scheduleDates(expenseSchedule(), '2024-01-01', '2024-03-31')).toEqual([
      '2024-01-31', '2024-02-29', '2024-03-31',
    ]);
  });

  it('replaces the estimate with a late recorded payment exactly once', () => {
    const data = cashflowFixture();
    data.planning = planningFixture({
      schedules: [expenseSchedule({ recurrence: { unit: 'once', interval: 1 } })],
    });
    data.years[0].months.push({
      year: 2024, month: 2, incomes: [], budgets: [], expenses: [{
        id: 'actual', type: 'expense', date: '2024-02-02', amount: 120, description: 'Test payment',
        category: 'UTILITIES', expenseType: 'NEED', scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
      }],
    });
    expect(buildCashflowForecast(data, {
      openingBalance: 1000, startDate: '2024-01-31', horizon: 30, currency: 'EUR',
    }).finalBalance).toBe(880);
  });

  it('records a confirmed occurrence into its actual month without recurring copies or duplicates', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    const reference = { scheduleId: 'schedule-1', scheduledDate: '2024-01-31' };
    const recorded = recordScheduledOccurrence(data, reference, { date: '2024-02-02', amount: 120 });
    expect(cashflowTransactions(recorded)).toMatchObject([{
      type: 'expense', date: '2024-02-02', amount: 120, currency: 'EUR',
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31', isRecurring: false,
    }]);
    expect(cashflowTransactions(data)).toEqual([]);
    expect(() => recordScheduledOccurrence(recorded, reference, { date: '2024-02-02', amount: 120 }))
      .toThrow(/already recorded/);
  });

  it('retains a leap-day anchor across non-leap years', () => {
    expect(scheduleDates(expenseSchedule({
      startDate: '2024-02-29', recurrence: { unit: 'year', interval: 1 },
    }), '2024-02-01', '2028-02-29')).toEqual([
      '2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29',
    ]);
  });

  it('uses calendar weeks across daylight-saving transitions and honors inclusive end dates', () => {
    expect(scheduleDates(expenseSchedule({
      startDate: '2024-03-03', endDate: '2024-03-17', recurrence: { unit: 'week', interval: 2 },
    }), '2024-03-04', '2024-03-31')).toEqual(['2024-03-17']);
  });

  it.each([{ enabled: false }, { archived: true }])('does not project stopped schedules %#', state => {
    expect(scheduleDates(expenseSchedule(state), '2024-01-01', '2024-03-31')).toEqual([]);
  });

  it.each([30, 90, 365] as const)('uses exactly %i days without inventing income', horizon => {
    const forecast = buildCashflowForecast(cashflowFixture(), {
      openingBalance: -10, startDate: '2024-01-31', currency: 'EUR', horizon,
    });
    expect(forecast.points).toHaveLength(horizon);
    expect(forecast.endDate).toBe(addCalendarDays('2024-01-31', horizon - 1));
    expect(forecast.finalBalance).toBe(-10);
    expect(forecast.firstNegativeDate).toBe('2024-01-31');
  });

  it('does not add different currencies or subtract manually earmarked goals', () => {
    const data = {
      ...cashflowFixture(), planning: planningFixture({ schedules: [expenseSchedule({ currency: 'USD' })] }),
    };
    expect(buildCashflowForecast(data, {
      openingBalance: 1000, startDate: '2024-01-31', horizon: 30, currency: 'EUR',
    }).finalBalance).toBe(1000);
  });

  it('assesses deficits after the complete day rather than transaction order', () => {
    const data = { ...cashflowFixture(), planning: planningFixture({ schedules: [
      expenseSchedule({ recurrence: { unit: 'once', interval: 1 } }),
      {
        id: 'income-1', name: 'Test pay', kind: 'income', source: 'SALARY', amount: 100, currency: 'EUR',
        startDate: '2024-01-31', recurrence: { unit: 'once', interval: 1 }, enabled: true, archived: false,
      },
    ] }) };
    expect(buildCashflowForecast(data, {
      openingBalance: 0, startDate: '2024-01-31', horizon: 30, currency: 'EUR',
    }).firstNegativeDate).toBeNull();
  });

  it('does not mistake binary cent noise for a spending deficit', () => {
    const data = cashflowFixture();
    data.years[0].months[0].expenses = [99.99, 0.01].map((amount, index) => ({
      id: `expense-${index}`, type: 'expense', date: '2024-01-31', amount, description: 'Test',
      category: 'UTILITIES', expenseType: 'NEED',
    }));
    const forecast = buildCashflowForecast(data, {
      openingBalance: 100, startDate: '2024-01-31', horizon: 30, currency: 'EUR',
    });
    expect(forecast.finalBalance).toBe(0);
    expect(forecast.firstNegativeDate).toBeNull();
  });

  it('skips and restores a projected occurrence without recording money or serializing UI state', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    const occurrence = getScheduleOccurrences(data, '2024-01-31', '2024-01-31')[0];
    const skipped = skipScheduledOccurrence(data, occurrence, true);
    expect(skipped.planning?.skippedOccurrences).toEqual([{
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    }]);
    expect(getScheduleOccurrences(skipped, '2024-01-31', '2024-01-31')[0].status).toBe('skipped');
    expect(cashflowTransactions(skipped)).toEqual([]);
    expect(skipScheduledOccurrence(skipped, occurrence, false).planning?.skippedOccurrences).toEqual([]);
  });

  it('links a chosen existing entry without changing its financial facts', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    data.years[0].months[0].expenses.push({
      id: 'existing', type: 'expense', date: '2024-01-30', amount: 42, description: 'Test actual',
      category: 'GROCERIES', expenseType: 'WANT', isRecurring: true,
    });
    const linked = linkScheduledOccurrence(data, {
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    }, 'existing');
    expect(cashflowTransactions(linked)).toMatchObject([{
      id: 'existing', date: '2024-01-30', amount: 42, category: 'GROCERIES', expenseType: 'WANT',
      isRecurring: false, scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    }]);
    expect(cashflowTransactions(data)[0].isRecurring).toBe(true);
    linked.years[0].months[0].expenses = [];
    expect(getScheduleOccurrences(linked, '2024-01-31', '2024-01-31')[0].status).toBe('planned');
  });
});
