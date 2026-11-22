import { getCategoryInfo, type CustomCategory, type CategoryOverride } from '../types/expenseTracker';
import { getChartColor } from './chartColors';

/**
 * Palette slots for built-in categories. Existing categories keep the slot
 * they had before the category merge; the new categories reuse the slots
 * freed by the merged ones so no chart color changes for existing data.
 */
const EXPENSE_CATEGORY_COLOR_SLOTS: Readonly<Record<string, number>> = {
  NO_CATEGORY: 0, HOUSING: 1, UTILITIES: 2, TRANSPORTATION: 3, GROCERIES: 4, DINING_OUT: 5,
  HEALTHCARE: 6, INSURANCE: 7, ENTERTAINMENT: 8, SHOPPING: 9, PERSONAL_CARE: 10, EDUCATION: 11,
  DEBT_PAYMENTS: 12, BUSINESS: 13, CLOTHING: 14, LIFESTYLE_LEISURE: 15, COLLECTIBLES: 16, MUSIC: 17,
  TRAVEL: 18, ELECTRONICS: 19, GIFTS_DONATIONS: 20, SUBSCRIPTIONS: 21, OTHER: 22,
};

export function getExpenseCategoryColor(
  category: string,
  customCategories?: CustomCategory[],
  categoryOverrides?: CategoryOverride[],
): string {
  const info = getCategoryInfo(category, customCategories, categoryOverrides);
  return info.color || getChartColor(EXPENSE_CATEGORY_COLOR_SLOTS[info.id] ?? 0);
}
