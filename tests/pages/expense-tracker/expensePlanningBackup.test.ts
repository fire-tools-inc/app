import { describe, expect, it } from 'vitest';
import { exportExpenseTrackerToCSV, importExpenseTrackerFromCSV } from '../../../src/utils/csvExport';
import { cashflowFixture, planningFixture } from './planningFixtures';
import { convertAmount, convertExpenseDataToNewCurrency } from '../../../src/utils/currencyConverter';
import { DEFAULT_FALLBACK_RATES } from '../../../src/types/currency';
import { exportAllDataAsJSON, importAllDataFromJSON } from '../../../src/utils/dataExportImport';
import { prepareExpenseTrackerRestore } from '../../../src/utils/expensePlanning';

describe('cashflow planning backups', () => {
  it('round trips planning metadata and quoted multiline transaction facts through CSV', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    data.years[0].months[0].expenses.push({
      id: 'quoted', type: 'expense', date: '2024-01-31', amount: 100, currency: 'EUR',
      description: 'Synthetic, "quoted"\nsecond line', category: 'UTILITIES', expenseType: 'NEED',
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31', isRecurring: false,
    });
    const restored = importExpenseTrackerFromCSV(exportExpenseTrackerToCSV(data));
    expect(restored).toEqual(data);
  });

  it('converts planning balances explicitly while retaining original import-rule currency criteria', () => {
    const planning = planningFixture({
      forecast: { openingBalance: 100, startDate: '2024-01-31', currency: 'EUR', horizon: 30 },
    });
    planning.rules[0].match = { description: 'Test', operator: 'contains', currency: 'EUR', minAmount: 12 };
    const data = { ...cashflowFixture(), planning };
    const converted = convertExpenseDataToNewCurrency(data, 'EUR', 'USD', DEFAULT_FALLBACK_RATES);
    expect(converted.planning?.goals[0].targetAmount).toBe(convertAmount(1000, 'EUR', 'USD', DEFAULT_FALLBACK_RATES));
    expect(converted.planning?.forecast).toMatchObject({ currency: 'USD', openingBalance: convertAmount(100, 'EUR', 'USD', DEFAULT_FALLBACK_RATES) });
    expect(converted.planning?.rules[0].match).toEqual(planning.rules[0].match);
    expect(data.planning.goals[0].currency).toBe('EUR');
  });

  it('rejects invalid planning in a full JSON restore before returning writable data', () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    data.planning.goals[0].savedAmount = -1;
    const backup = exportAllDataAsJSON(null, null, null, data, null, 'EUR');
    expect(() => importAllDataFromJSON(JSON.stringify(backup), 'EUR')).toThrow();
  });

  it('accepts legacy CSV headers and explicitly preserves current planning on restore', () => {
    const legacy = [
      'Expense Tracker Data Export', 'Currency,EUR', 'Expense Entries',
      'ID,Date,Amount,Description,Category,SubCategory,ExpenseType',
      'legacy,2024-01-31,12,Test,UTILITIES,,NEED',
    ].join('\n');
    const imported = importExpenseTrackerFromCSV(legacy);
    expect(imported.planning).toBeUndefined();
    const current = { ...cashflowFixture(), planning: planningFixture() };
    expect(prepareExpenseTrackerRestore(imported, current).planning).toEqual(current.planning);
  });

  it('rejects invalid CSV amounts and malformed quoting instead of writing zero values', () => {
    const csv = exportExpenseTrackerToCSV({ ...cashflowFixture(), planning: planningFixture() });
    expect(() => importExpenseTrackerFromCSV(csv.replace('Metadata,', 'Metadata,"'))).toThrow();
    expect(() => importExpenseTrackerFromCSV([
      'Expense Tracker Data Export', 'Currency,EUR', 'Expense Entries',
      'ID,Date,Amount,Description,Category,SubCategory,ExpenseType',
      'bad,2024-01-31,not-a-number,Test,UTILITIES,,NEED',
    ].join('\n'))).toThrow();
    expect(() => importExpenseTrackerFromCSV([
      'Expense Tracker Data Export', 'Currency,EUR', 'Expense Entries',
      'ID,Date,Amount,Description,Category,SubCategory,ExpenseType',
      'bad,2024-01-31,12,"Test"trailing,UTILITIES,,NEED',
    ].join('\n'))).toThrow();
  });
});
