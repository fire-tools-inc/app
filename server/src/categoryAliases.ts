/**
 * Built-in expense category ids retired by migration 0008 and the category
 * that absorbed each one. Writes map them forward so older clients and
 * imports cannot reintroduce them after the migration.
 */
export const LEGACY_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  FEES: 'BUSINESS',
  HOLIDAYS: 'TRAVEL',
};

export const isLegacyCategoryId = (category: string): boolean => Object.hasOwn(LEGACY_CATEGORY_ALIASES, category);

export const resolveCategoryAlias = (category: string): string =>
  isLegacyCategoryId(category) ? LEGACY_CATEGORY_ALIASES[category]! : category;

export interface BudgetInput {
  category: string;
  monthlyBudget: number;
  currency: string | null;
  scope: string;
}

/**
 * Collapse budgets whose categories resolve to the same id within one scope
 * (a month or the global list). Amounts are summed when the currencies match
 * or one is unset (the tracker currency); otherwise the budget already filed
 * under the surviving id is kept.
 */
export const mergeBudgetAliases = <T extends BudgetInput>(budgets: T[]): T[] => {
  const merged: T[] = [];
  const index = new Map<string, number>();
  const ordered = [...budgets.filter(b => !isLegacyCategoryId(b.category)),
    ...budgets.filter(b => isLegacyCategoryId(b.category))];
  for (const budget of ordered) {
    const category = resolveCategoryAlias(budget.category);
    const key = `${budget.scope}\u0000${category}`;
    const position = index.get(key);
    if (position === undefined) {
      index.set(key, merged.length);
      merged.push({ ...budget, category });
    } else {
      const existing = merged[position]!;
      if (existing.currency === null || budget.currency === null || existing.currency === budget.currency) {
        merged[position] = {
          ...existing,
          monthlyBudget: existing.monthlyBudget + budget.monthlyBudget,
          currency: existing.currency ?? budget.currency,
        };
      }
    }
  }
  return merged;
};
