import type { ImportCategorizationRule } from '../types/expensePlanning';
import type { ParsedTransactionDraft } from '../types/pdfImport';
import type { SupportedCurrency } from '../types/currency';
import { getAllCategories, type CategoryInfo } from '../types/expenseTracker';
import { createEmptyExpensePlanning, parseExpensePlanning } from './expensePlanning';

export interface ImportRuleResult {
  drafts: ParsedTransactionDraft[];
  matches: Record<string, string>;
  invalidRuleIds: string[];
}

const normalized = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function applyImportCategorizationRules(
  drafts: ParsedTransactionDraft[], rules: ImportCategorizationRule[], defaultCurrency: SupportedCurrency,
  categories: readonly CategoryInfo[] = getAllCategories(),
): ImportRuleResult {
  parseExpensePlanning({ ...createEmptyExpensePlanning(), rules });
  const categoryIds = new Set(categories.map(category => category.id));
  const invalidRuleIds = rules.filter(rule => rule.enabled && rule.kind === 'expense' && !categoryIds.has(rule.category))
    .map(rule => rule.id);
  const invalid = new Set(invalidRuleIds);
  const ordered = rules.filter(rule => rule.enabled && !invalid.has(rule.id))
    .sort((a, b) => a.priority - b.priority);
  const matches = new Map<string, string>();
  const classified = drafts.map(draft => {
    const rule = ordered.find(rule => {
      if (rule.kind !== draft.kind) return false;
      const { match } = rule;
      const description = normalized(draft.description);
      const pattern = normalized(match.description);
      if (match.operator === 'equals' ? description !== pattern : !description.includes(pattern)) return false;
      if (match.currency && match.currency !== (draft.currency ?? defaultCurrency)) return false;
      if (match.minAmount !== undefined && (!Number.isFinite(draft.amount) || draft.amount < match.minAmount)) return false;
      if (match.maxAmount !== undefined && (!Number.isFinite(draft.amount) || draft.amount > match.maxAmount)) return false;
      return true;
    });
    if (!rule) return { ...draft };
    matches.set(draft.id, rule.name);
    return rule.kind === 'expense'
      ? { ...draft, suggestedCategory: rule.category, suggestedExpenseType: rule.expenseType }
      : { ...draft, suggestedIncomeSource: rule.source };
  });
  return { drafts: classified, matches: Object.fromEntries(matches), invalidRuleIds };
}
