import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { apiError, bool01, fromBool01, nowIso } from '../http.js';
import { logger } from '../logger.js';
import { isLegacyCategoryId, mergeBudgetAliases, resolveCategoryAlias } from '../categoryAliases.js';
import {
  CURRENCIES, EXPENSE_COLS, INCOME_COLS, assertAvailableOccurrence, ensureMonth, ensureYear, expenseInsertValues,
  incomeInsertValues, mapCustomCat, mapExpense, mapIncome, validateCustomCategory, validateExpense,
  validateExpenseConfig, validateIncome,
  type BudgetRow, type CustomCatRow, type ExpenseConfigRow, type ExpenseMonthRow, type ExpenseRow,
  type ExpenseYearRow, type IncomeRow, type OverrideRow,
} from '../routes/expenseTracker.js';
import { expensePlanningSchema } from '../routes/expensePlanning.js';
import {
  ORDER_BY_POSITION, SyncEntityError, asApiBody, asDocumentEntity, compact, fieldTypes, idOf, monthKey, monthOf,
  parseMonthKey, parseYearKey, placed, positionOf, upsertStatement, withEntity, yearEntity, yearOf,
  type DomainHandler, type Entity,
} from './shared.js';

const { id, string, optionalString, number, optionalNumber, optionalBoolean, position } = fieldTypes;
const transaction = {
  id, date: string, amount: number, description: string, currency: optionalString,
  isRecurring: optionalBoolean, scheduleId: optionalString, scheduledDate: optionalString,
};
const monthShape = z.looseObject({ year: fieldTypes.year, month: fieldTypes.month, isClosed: optionalBoolean });
const expenseShape = placed({
  ...transaction, category: string, subCategory: optionalString, expenseType: string,
  unitAmount: optionalNumber, quantity: optionalNumber,
});
const incomeShape = placed({ ...transaction, source: string });
const budgetFields = { category: z.string().min(1), monthlyBudget: number, currency: optionalString };
const monthBudgetShape = placed(budgetFields);
const globalBudgetShape = z.looseObject({ ...budgetFields, position });
const customCategoryShape = z.looseObject({
  id, name: string, icon: string, color: string, defaultExpenseType: string, position,
});
const overrideShape = z.looseObject({ id, name: optionalString, icon: optionalString, color: optionalString, position });
const configShape = z.looseObject({ currency: string, currentYear: fieldTypes.year, currentMonth: fieldTypes.month });

const YEAR_UPSERT = upsertStatement('expense_years', 'user_id, year, is_archived', 'user_id, year');
const MONTH_UPSERT = upsertStatement('expense_months', 'user_id, expense_year_id, month, is_closed', 'expense_year_id, month');
const EXPENSE_UPSERT = upsertStatement('expense_entries', `${EXPENSE_COLS}, position`, 'user_id, external_id');
const INCOME_UPSERT = upsertStatement('income_entries', `${INCOME_COLS}, position`, 'user_id, external_id');
const MONTH_BUDGET_UPSERT = upsertStatement('category_budgets',
  'user_id, expense_month_id, category, monthly_budget, currency, position', 'user_id, expense_month_id, category');
const CUSTOM_CATEGORY_UPSERT = upsertStatement('custom_categories',
  'user_id, external_id, name, icon, color, default_expense_type, position', 'user_id, external_id');
const OVERRIDE_UPSERT = upsertStatement('category_overrides',
  'user_id, category_id, name, icon, color, position', 'user_id, category_id');
const CONFIG_UPSERT = upsertStatement('expense_tracker_config',
  'user_id, currency, current_year, current_month, updated_at', 'user_id');
const PLANNING_UPSERT = upsertStatement('expense_planning', 'user_id, payload_json, updated_at', 'user_id');

const checkBudgetCurrency = (entity: Entity): void => {
  if (entity.currency != null && !CURRENCIES.has(String(entity.currency))) {
    throw apiError(400, 'invalid_body', `Invalid currency: ${String(entity.currency)}`);
  }
};

const findMonthId = (db: Database, userId: number, year: number, month: number): number | undefined =>
  (db.prepare(`SELECT m.id FROM expense_months m JOIN expense_years y ON y.id = m.expense_year_id
    WHERE y.user_id = ? AND y.year = ? AND m.month = ?`).get(userId, year, month) as { id: number } | undefined)?.id;

const deleteMonthRows = (db: Database, userId: number, monthId: number): void => {
  for (const table of ['expense_entries', 'income_entries', 'category_budgets']) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND expense_month_id = ?`).run(userId, monthId);
  }
  db.prepare('DELETE FROM expense_months WHERE user_id = ? AND id = ?').run(userId, monthId);
};

const upsertYears = (db: Database, userId: number, entities: Entity[]): void => {
  const statement = db.prepare(YEAR_UPSERT);
  for (const entity of entities) {
    withEntity('years', yearOf(entity), () => {
      const year = yearEntity.parse(entity);
      statement.run(userId, year.year, bool01(year.isArchived));
    });
  }
};

const upsertMonths = (db: Database, userId: number, entities: Entity[]): void => {
  const statement = db.prepare(MONTH_UPSERT);
  for (const entity of entities) {
    withEntity('months', monthOf(entity), () => {
      const month = monthShape.parse(entity);
      statement.run(userId, ensureYear(db, userId, month.year).id, month.month, bool01(month.isClosed));
    });
  }
};

const upsertTransactions = (
  db: Database, userId: number, collection: 'expenses' | 'incomes', entities: Entity[],
): void => {
  const expense = collection === 'expenses';
  const statement = db.prepare(expense ? EXPENSE_UPSERT : INCOME_UPSERT);
  for (const entity of entities) {
    withEntity(collection, idOf(entity), () => {
      const placement = (expense ? expenseShape : incomeShape).parse(entity);
      const body = asApiBody(entity);
      if (expense) validateExpense(body); else validateIncome(body);
      assertAvailableOccurrence(db, userId, body, {
        table: expense ? 'expense_entries' : 'income_entries', externalId: placement.id,
      });
      const month = ensureMonth(db, userId, placement.year, placement.month);
      const values = expense ? expenseInsertValues(userId, month.id, body) : incomeInsertValues(userId, month.id, body);
      statement.run(...values, positionOf(entity));
    });
  }
};

const budgetKey = (entity: Entity): string | null => {
  const month = monthOf(entity);
  return month && typeof entity.category === 'string' ? `${month}|${entity.category}` : null;
};

const upsertMonthBudgets = (db: Database, userId: number, entities: Entity[]): void => {
  const budgets = entities.map(entity => withEntity('monthBudgets', budgetKey(entity), () => {
    const budget = monthBudgetShape.parse(entity);
    checkBudgetCurrency(entity);
    return {
      scope: monthKey(budget.year, budget.month), year: budget.year, month: budget.month,
      category: budget.category, monthlyBudget: budget.monthlyBudget,
      currency: budget.currency ?? null, position: budget.position ?? null,
    };
  }));
  const statement = db.prepare(MONTH_BUDGET_UPSERT);
  for (const budget of mergeBudgetAliases(budgets)) {
    withEntity('monthBudgets', `${budget.scope}|${budget.category}`, () => {
      const month = ensureMonth(db, userId, budget.year, budget.month);
      statement.run(userId, month.id, budget.category, budget.monthlyBudget, budget.currency, budget.position);
    });
  }
};

const upsertGlobalBudgets = (db: Database, userId: number, entities: Entity[]): void => {
  const budgets = entities.map(entity => withEntity('globalBudgets', typeof entity.category === 'string' ? entity.category : null, () => {
    const budget = globalBudgetShape.parse(entity);
    checkBudgetCurrency(entity);
    return {
      scope: 'global', category: budget.category, monthlyBudget: budget.monthlyBudget,
      currency: budget.currency ?? null, position: budget.position ?? null,
    };
  }));
  const update = db.prepare(`UPDATE category_budgets SET monthly_budget = ?, currency = ?, position = ?
    WHERE user_id = ? AND expense_month_id IS NULL AND category = ?`);
  const insert = db.prepare(`INSERT INTO category_budgets (user_id, expense_month_id, category, monthly_budget, currency, position)
    VALUES (?, NULL, ?, ?, ?, ?)`);
  for (const budget of mergeBudgetAliases(budgets)) {
    withEntity('globalBudgets', budget.category, () => {
      const changed = update.run(budget.monthlyBudget, budget.currency, budget.position, userId, budget.category).changes;
      if (changed === 0) insert.run(userId, budget.category, budget.monthlyBudget, budget.currency, budget.position);
    });
  }
};

const upsertCustomCategories = (db: Database, userId: number, entities: Entity[]): void => {
  const statement = db.prepare(CUSTOM_CATEGORY_UPSERT);
  for (const entity of entities) {
    withEntity('customCategories', idOf(entity), () => {
      const category = customCategoryShape.parse(entity);
      validateCustomCategory(entity);
      statement.run(userId, category.id, category.name, category.icon, category.color,
        category.defaultExpenseType, category.position ?? null);
    });
  }
};

const upsertOverrides = (db: Database, userId: number, entities: Entity[]): void => {
  const statement = db.prepare(OVERRIDE_UPSERT);
  for (const entity of entities) {
    withEntity('categoryOverrides', idOf(entity), () => {
      const override = overrideShape.parse(entity);
      // Retired built-in ids have no category to customize any more.
      if (isLegacyCategoryId(override.id)) return;
      statement.run(userId, override.id, override.name ?? null, override.icon ?? null, override.color ?? null,
        override.position ?? null);
    });
  }
};

const readPlanning = (db: Database, userId: number): unknown => {
  const row = db.prepare('SELECT payload_json FROM expense_planning WHERE user_id = ?').get(userId) as
    { payload_json: string } | undefined;
  if (!row) return undefined;
  try {
    return expensePlanningSchema.parse(JSON.parse(row.payload_json));
  } catch (error) {
    logger.error('sync', 'invalid-stored-planning', 'saved cashflow planning data is invalid', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    throw apiError(500, 'internal_error', 'Saved planning data is invalid. Restore a valid backup.');
  }
};

const groupBy = <T>(rows: T[], key: (row: T) => number | null): Map<number | null, T[]> => {
  const groups = new Map<number | null, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row); else groups.set(key(row), [row]);
  }
  return groups;
};

const budgetDocument = (row: BudgetRow) => compact({
  category: row.category, monthlyBudget: row.monthly_budget, currency: row.currency,
});

const readExpenseTracker = (db: Database, userId: number) => {
  const all = <T>(sql: string): T[] => db.prepare(sql).all(userId) as T[];
  const config = db.prepare('SELECT * FROM expense_tracker_config WHERE user_id = ?').get(userId) as
    ExpenseConfigRow | undefined;
  const years = all<ExpenseYearRow>('SELECT * FROM expense_years WHERE user_id = ? ORDER BY year');
  const months = groupBy(all<ExpenseMonthRow>('SELECT * FROM expense_months WHERE user_id = ? ORDER BY month'),
    row => row.expense_year_id);
  const expenses = groupBy(all<ExpenseRow>(`SELECT * FROM expense_entries WHERE user_id = ? ${ORDER_BY_POSITION}`),
    row => row.expense_month_id);
  const incomes = groupBy(all<IncomeRow>(`SELECT * FROM income_entries WHERE user_id = ? ${ORDER_BY_POSITION}`),
    row => row.expense_month_id);
  const budgets = groupBy(all<BudgetRow>(`SELECT * FROM category_budgets WHERE user_id = ? ${ORDER_BY_POSITION}`),
    row => row.expense_month_id);
  const customCategories = all<CustomCatRow>(`SELECT * FROM custom_categories WHERE user_id = ? ${ORDER_BY_POSITION}`);
  const overrides = all<OverrideRow>(`SELECT * FROM category_overrides WHERE user_id = ? ${ORDER_BY_POSITION}`);
  const planning = readPlanning(db, userId);
  const now = new Date();
  return {
    years: years.map(year => ({
      year: year.year,
      isArchived: fromBool01(year.is_archived),
      months: (months.get(year.id) ?? []).map(month => ({
        year: year.year,
        month: month.month,
        isClosed: fromBool01(month.is_closed),
        incomes: (incomes.get(month.id) ?? []).map(row => asDocumentEntity(mapIncome(row))),
        expenses: (expenses.get(month.id) ?? []).map(row => asDocumentEntity(mapExpense(row))),
        budgets: (budgets.get(month.id) ?? []).map(budgetDocument),
      })),
    })),
    currentYear: config?.current_year ?? now.getFullYear(),
    currentMonth: config?.current_month ?? now.getMonth() + 1,
    currency: config?.currency ?? 'EUR',
    globalBudgets: (budgets.get(null) ?? []).map(budgetDocument),
    ...(customCategories.length ? { customCategories: customCategories.map(row => asDocumentEntity(mapCustomCat(row))) } : {}),
    ...(overrides.length ? {
      categoryOverrides: overrides.map(row => compact({ id: row.category_id, name: row.name, icon: row.icon, color: row.color })),
    } : {}),
    ...(planning ? { planning } : {}),
  };
};

const exists = (db: Database, sql: string, userId: number): boolean => Boolean(db.prepare(sql).get(userId));

export const expenseTrackerDomain: DomainHandler = {
  setKeys: ['config', 'planning'],
  collections: [
    'years', 'months', 'expenses', 'incomes', 'monthBudgets', 'globalBudgets', 'customCategories', 'categoryOverrides',
  ],
  hasData: (db, userId) => [
    'expense_tracker_config', 'expense_planning', 'expense_years', 'category_budgets', 'custom_categories',
    'category_overrides',
  ].some(table => exists(db, `SELECT 1 FROM ${table} WHERE user_id = ? LIMIT 1`, userId)),
  read: readExpenseTracker,
  clear: (db, userId) => {
    for (const table of [
      'expense_entries', 'income_entries', 'category_budgets', 'expense_months', 'expense_years',
      'custom_categories', 'category_overrides', 'expense_planning', 'expense_tracker_config',
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
  },
  applySet: (db, userId, key, value) => {
    if (key === 'config') {
      if (value === null) {
        db.prepare('DELETE FROM expense_tracker_config WHERE user_id = ?').run(userId);
        return;
      }
      const config = configShape.parse(value);
      validateExpenseConfig(config);
      db.prepare(CONFIG_UPSERT).run(userId, config.currency, config.currentYear, config.currentMonth, nowIso());
    } else if (key === 'planning') {
      if (value === null) {
        db.prepare('DELETE FROM expense_planning WHERE user_id = ?').run(userId);
        return;
      }
      db.prepare(PLANNING_UPSERT).run(userId, JSON.stringify(expensePlanningSchema.parse(value)), nowIso());
    } else {
      throw new SyncEntityError(400, 'set', key, `Unknown singleton "${key}".`);
    }
  },
  keyOf: (collection, entity) => {
    if (collection === 'years') return yearOf(entity);
    if (collection === 'months') return monthOf(entity);
    if (collection === 'monthBudgets') return budgetKey(entity);
    if (collection === 'globalBudgets') return typeof entity.category === 'string' ? entity.category : null;
    return idOf(entity);
  },
  upsert: (db, userId, collection, entities) => {
    switch (collection) {
      case 'years': return upsertYears(db, userId, entities);
      case 'months': return upsertMonths(db, userId, entities);
      case 'expenses':
      case 'incomes': return upsertTransactions(db, userId, collection, entities);
      case 'monthBudgets': return upsertMonthBudgets(db, userId, entities);
      case 'globalBudgets': return upsertGlobalBudgets(db, userId, entities);
      case 'customCategories': return upsertCustomCategories(db, userId, entities);
      default: return upsertOverrides(db, userId, entities);
    }
  },
  remove: (db, userId, collection, key) => {
    switch (collection) {
      case 'years': {
        const year = db.prepare('SELECT id FROM expense_years WHERE user_id = ? AND year = ?')
          .get(userId, parseYearKey(key)) as { id: number } | undefined;
        if (!year) return;
        const months = db.prepare('SELECT id FROM expense_months WHERE user_id = ? AND expense_year_id = ?')
          .all(userId, year.id) as Array<{ id: number }>;
        for (const month of months) deleteMonthRows(db, userId, month.id);
        db.prepare('DELETE FROM expense_years WHERE user_id = ? AND id = ?').run(userId, year.id);
        return;
      }
      case 'months': {
        const { year, month } = parseMonthKey(key);
        const monthId = findMonthId(db, userId, year, month);
        if (monthId !== undefined) deleteMonthRows(db, userId, monthId);
        return;
      }
      case 'expenses':
        db.prepare('DELETE FROM expense_entries WHERE user_id = ? AND external_id = ?').run(userId, key);
        return;
      case 'incomes':
        db.prepare('DELETE FROM income_entries WHERE user_id = ? AND external_id = ?').run(userId, key);
        return;
      case 'monthBudgets': {
        const separator = key.indexOf('|');
        if (separator < 0 || separator === key.length - 1) {
          throw new SyncEntityError(400, null, key, 'Month budget keys look like "2025-03|GROCERIES".');
        }
        const { year, month } = parseMonthKey(key.slice(0, separator));
        const category = key.slice(separator + 1);
        const monthId = findMonthId(db, userId, year, month);
        if (monthId !== undefined) {
          db.prepare('DELETE FROM category_budgets WHERE user_id = ? AND expense_month_id = ? AND category = ?')
            .run(userId, monthId, resolveCategoryAlias(category));
        }
        return;
      }
      case 'globalBudgets':
        db.prepare('DELETE FROM category_budgets WHERE user_id = ? AND expense_month_id IS NULL AND category = ?')
          .run(userId, resolveCategoryAlias(key));
        return;
      case 'customCategories':
        db.prepare('DELETE FROM custom_categories WHERE user_id = ? AND external_id = ?').run(userId, key);
        return;
      default:
        db.prepare('DELETE FROM category_overrides WHERE user_id = ? AND category_id = ?').run(userId, key);
    }
  },
};
