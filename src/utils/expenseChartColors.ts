import { EXPENSE_CATEGORIES, getCategoryInfo, type CustomCategory, type CategoryOverride } from '../types/expenseTracker';
import { getChartColor } from './chartColors';

export function getExpenseCategoryColor(
  category: string,
  customCategories?: CustomCategory[],
  categoryOverrides?: CategoryOverride[],
): string {
  const info = getCategoryInfo(category, customCategories, categoryOverrides);
  return info.color || getChartColor(Math.max(0, EXPENSE_CATEGORIES.findIndex(entry => entry.id === info.id)));
}
