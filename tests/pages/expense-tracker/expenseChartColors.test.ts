import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, type CustomCategory } from '../../../src/types/expenseTracker';
import { getChartColor } from '../../../src/utils/chartColors';
import { getExpenseCategoryColor } from '../../../src/utils/expenseChartColors';

describe('Cashflow chart colors', () => {
  it('assigns stable shared palette colors independently of amount or category order', () => {
    expect(getExpenseCategoryColor('HOUSING')).toBe(getChartColor(EXPENSE_CATEGORIES.findIndex(category => category.id === 'HOUSING')));
    expect(getExpenseCategoryColor('GROCERIES')).not.toBe(getExpenseCategoryColor('HOUSING'));
  });

  it('preserves user-defined category colors', () => {
    const custom: CustomCategory = { id: 'synthetic-category', name: 'Synthetic category', icon: 'tag', color: '#ABDEC4', defaultExpenseType: 'WANT' };
    expect(getExpenseCategoryColor(custom.id, [custom])).toBe(custom.color);
  });

  it('honors built-in category overrides in both graph types', () => {
    expect(getExpenseCategoryColor('HOUSING', [], [{ id: 'HOUSING', color: '#DAD4B8' }])).toBe('#DAD4B8');
  });
});
