import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import {
  handler, resolveUserId, apiError, bool01, fromBool01, nowIso,
  parsePagination, nextCursor, parseYearMonth,
} from '../http.js';

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);
const EXPENSE_TYPES = new Set(['NEED', 'WANT']);
const INCOME_SOURCES = new Set([
  'SALARY', 'FREELANCE', 'BUSINESS', 'INVESTMENTS', 'RENTAL',
  'PENSION', 'SOCIAL_SECURITY', 'BONUS', 'GIFT', 'OTHER',
]);

interface CfgRow {
  user_id: number;
  currency: string;
  current_year: number;
  current_month: number;
  updated_at: string;
}
interface YearRow { id: number; user_id: number; year: number; is_archived: number }
interface MonthRow {
  id: number; user_id: number; expense_year_id: number; month: number; is_closed: number;
}
interface ExpenseRow {
  id: number; user_id: number; expense_month_id: number; external_id: string;
  date: string; amount: number; description: string; currency: string | null;
  category: string; sub_category: string | null; expense_type: string; is_recurring: number;
}
interface IncomeRow {
  id: number; user_id: number; expense_month_id: number; external_id: string;
  date: string; amount: number; description: string; currency: string | null;
  source: string; is_recurring: number;
}
interface BudgetRow {
  id: number; user_id: number; expense_month_id: number | null;
  category: string; monthly_budget: number; currency: string | null;
}
interface CustomCatRow {
  id: number; user_id: number; external_id: string; name: string;
  icon: string; color: string; default_expense_type: string;
}
interface OverrideRow {
  id: number; user_id: number; category_id: string;
  name: string | null; icon: string | null; color: string | null;
}

const ensureCfg = (db: Database, userId: number): CfgRow => {
  const row = db.prepare('SELECT * FROM expense_tracker_config WHERE user_id = ?').get(userId) as CfgRow | undefined;
  if (row) return row;
  const now = new Date();
  db.prepare(
    `INSERT INTO expense_tracker_config (user_id, currency, current_year, current_month, updated_at)
     VALUES (?, 'EUR', ?, ?, ?)`,
  ).run(userId, now.getFullYear(), now.getMonth() + 1, nowIso());
  return db.prepare('SELECT * FROM expense_tracker_config WHERE user_id = ?').get(userId) as CfgRow;
};

const ensureYear = (db: Database, userId: number, year: number): YearRow => {
  const existing = db
    .prepare('SELECT * FROM expense_years WHERE user_id = ? AND year = ?')
    .get(userId, year) as YearRow | undefined;
  if (existing) return existing;
  db.prepare('INSERT INTO expense_years (user_id, year) VALUES (?, ?)').run(userId, year);
  return db.prepare('SELECT * FROM expense_years WHERE user_id = ? AND year = ?').get(userId, year) as YearRow;
};

const ensureMonth = (db: Database, userId: number, year: number, month: number): MonthRow => {
  const y = ensureYear(db, userId, year);
  const existing = db
    .prepare('SELECT * FROM expense_months WHERE user_id = ? AND expense_year_id = ? AND month = ?')
    .get(userId, y.id, month) as MonthRow | undefined;
  if (existing) return existing;
  db.prepare(
    'INSERT INTO expense_months (user_id, expense_year_id, month) VALUES (?, ?, ?)',
  ).run(userId, y.id, month);
  return db
    .prepare('SELECT * FROM expense_months WHERE user_id = ? AND expense_year_id = ? AND month = ?')
    .get(userId, y.id, month) as MonthRow;
};

const ensureMonthByDate = (db: Database, userId: number, dateIso: string): MonthRow => {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) throw apiError(400, 'invalid_body', `Invalid date: ${dateIso}`);
  return ensureMonth(db, userId, d.getUTCFullYear(), d.getUTCMonth() + 1);
};

const mapCfg = (r: CfgRow) => ({
  currency: r.currency, currentYear: r.current_year, currentMonth: r.current_month,
});
const mapExpense = (r: ExpenseRow) => ({
  id: r.id, externalId: r.external_id, type: 'expense',
  date: r.date, amount: r.amount, description: r.description,
  currency: r.currency, category: r.category, subCategory: r.sub_category,
  expenseType: r.expense_type, isRecurring: fromBool01(r.is_recurring),
});
const mapIncome = (r: IncomeRow) => ({
  id: r.id, externalId: r.external_id, type: 'income',
  date: r.date, amount: r.amount, description: r.description,
  currency: r.currency, source: r.source, isRecurring: fromBool01(r.is_recurring),
});

const mapBudgetWithMonth = (db: Database, userId: number, r: BudgetRow) => {
  let monthKey: string | undefined;
  if (r.expense_month_id != null) {
    const m = db
      .prepare(
        `SELECT em.month AS month, ey.year AS year
           FROM expense_months em JOIN expense_years ey ON ey.id = em.expense_year_id
          WHERE em.id = ? AND em.user_id = ?`,
      )
      .get(r.expense_month_id, userId) as { year: number; month: number } | undefined;
    if (m) monthKey = `${m.year}-${String(m.month).padStart(2, '0')}`;
  }
  return {
    category: r.category, monthlyBudget: r.monthly_budget,
    ...(r.currency ? { currency: r.currency } : {}),
    ...(monthKey ? { monthKey } : {}),
  };
};

const mapCustomCat = (r: CustomCatRow) => ({
  externalId: r.external_id, name: r.name, icon: r.icon, color: r.color,
  defaultExpenseType: r.default_expense_type,
});
const mapOverride = (r: OverrideRow) => ({
  categoryId: r.category_id, name: r.name, icon: r.icon, color: r.color,
});

const validateExpense = (body: Record<string, unknown>) => {
  for (const k of ['externalId', 'date', 'amount', 'description', 'category', 'expenseType']) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
  if (!EXPENSE_TYPES.has(String(body.expenseType))) {
    throw apiError(400, 'invalid_body', `Invalid expenseType: ${body.expenseType}`);
  }
  if (body.currency != null && !CURRENCIES.has(String(body.currency))) {
    throw apiError(400, 'invalid_body', `Invalid currency: ${body.currency}`);
  }
};
const validateIncome = (body: Record<string, unknown>) => {
  for (const k of ['externalId', 'date', 'amount', 'description', 'source']) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
  if (!INCOME_SOURCES.has(String(body.source))) {
    throw apiError(400, 'invalid_body', `Invalid source: ${body.source}`);
  }
  if (body.currency != null && !CURRENCIES.has(String(body.currency))) {
    throw apiError(400, 'invalid_body', `Invalid currency: ${body.currency}`);
  }
};

export const buildExpenseTrackerRouter = (db: Database): Router => {
  const router = Router();

  // --- Config ---
  router.get('/expense-tracker/config', handler((req, res) => {
    res.json(mapCfg(ensureCfg(db, resolveUserId(req))));
  }));

  router.put('/expense-tracker/config', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ['currency', 'currentYear', 'currentMonth']) {
      if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
    }
    if (!CURRENCIES.has(String(body.currency))) throw apiError(400, 'invalid_body', `Invalid currency`);
    ensureCfg(db, userId);
    db.prepare(
      `UPDATE expense_tracker_config
          SET currency = ?, current_year = ?, current_month = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(String(body.currency), Number(body.currentYear), Number(body.currentMonth), nowIso(), userId);
    res.json(mapCfg(db.prepare('SELECT * FROM expense_tracker_config WHERE user_id = ?').get(userId) as CfgRow));
  }));

  // --- Months ---
  const getMonthData = (userId: number, year: number, month: number) => {
    const m = ensureMonth(db, userId, year, month);
    const expenses = db
      .prepare('SELECT * FROM expense_entries WHERE user_id = ? AND expense_month_id = ? ORDER BY date, id')
      .all(userId, m.id) as ExpenseRow[];
    const incomes = db
      .prepare('SELECT * FROM income_entries WHERE user_id = ? AND expense_month_id = ? ORDER BY date, id')
      .all(userId, m.id) as IncomeRow[];
    const budgets = db
      .prepare('SELECT * FROM category_budgets WHERE user_id = ? AND (expense_month_id = ? OR expense_month_id IS NULL)')
      .all(userId, m.id) as BudgetRow[];
    return {
      year, month, isClosed: fromBool01(m.is_closed),
      incomes: incomes.map(mapIncome),
      expenses: expenses.map(mapExpense),
      budgets: budgets.map((b) => mapBudgetWithMonth(db, userId, b)),
    };
  };

  router.get('/expense-tracker/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    res.json(getMonthData(userId, year, month));
  }));

  router.put('/expense-tracker/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const m = ensureMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM expense_entries WHERE user_id = ? AND expense_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM income_entries WHERE user_id = ? AND expense_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM category_budgets WHERE user_id = ? AND expense_month_id = ?').run(userId, m.id);
      const expenses = Array.isArray(body.expenses) ? (body.expenses as Record<string, unknown>[]) : [];
      const incomes = Array.isArray(body.incomes) ? (body.incomes as Record<string, unknown>[]) : [];
      const budgets = Array.isArray(body.budgets) ? (body.budgets as Record<string, unknown>[]) : [];
      const expIns = db.prepare(
        `INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description,
            currency, category, sub_category, expense_type, is_recurring)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of expenses) {
        validateExpense(e);
        expIns.run(
          userId, m.id, String(e.externalId), String(e.date), Number(e.amount), String(e.description),
          e.currency != null ? String(e.currency) : null, String(e.category),
          e.subCategory != null ? String(e.subCategory) : null, String(e.expenseType), bool01(e.isRecurring),
        );
      }
      const incIns = db.prepare(
        `INSERT INTO income_entries (user_id, expense_month_id, external_id, date, amount, description,
            currency, source, is_recurring)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of incomes) {
        validateIncome(e);
        incIns.run(
          userId, m.id, String(e.externalId), String(e.date), Number(e.amount), String(e.description),
          e.currency != null ? String(e.currency) : null, String(e.source), bool01(e.isRecurring),
        );
      }
      const budIns = db.prepare(
        `INSERT INTO category_budgets (user_id, expense_month_id, category, monthly_budget, currency)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const b of budgets) {
        budIns.run(userId, m.id, String(b.category), Number(b.monthlyBudget),
          b.currency != null ? String(b.currency) : null);
      }
    });
    tx();
    res.json(getMonthData(userId, year, month));
  }));

  router.patch('/expense-tracker/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureMonth(db, userId, year, month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ('isClosed' in body) {
      db.prepare('UPDATE expense_months SET is_closed = ? WHERE id = ? AND user_id = ?')
        .run(bool01(body.isClosed), m.id, userId);
    }
    res.json(getMonthData(userId, year, month));
  }));

  // --- Expenses ---
  router.get('/expense-tracker/expenses', handler((req, res) => {
    const userId = resolveUserId(req);
    const { limit, offset } = parsePagination(req);
    const where: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];
    if (typeof req.query.startDate === 'string') { where.push('date >= ?'); params.push(req.query.startDate); }
    if (typeof req.query.endDate === 'string') { where.push('date <= ?'); params.push(req.query.endDate); }
    if (typeof req.query.category === 'string') { where.push('category = ?'); params.push(req.query.category); }
    if (typeof req.query.expenseType === 'string') {
      if (!EXPENSE_TYPES.has(req.query.expenseType)) {
        throw apiError(400, 'invalid_param', `Invalid expenseType: ${req.query.expenseType}`);
      }
      where.push('expense_type = ?'); params.push(req.query.expenseType);
    }
    if (req.query.isRecurring !== undefined) {
      where.push('is_recurring = ?'); params.push(bool01(req.query.isRecurring === 'true'));
    }
    if (typeof req.query.searchTerm === 'string') {
      where.push('description LIKE ?'); params.push(`%${req.query.searchTerm}%`);
    }
    const rows = db
      .prepare(`SELECT * FROM expense_entries WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as ExpenseRow[];
    res.json({ items: rows.map(mapExpense), nextCursor: nextCursor(offset, rows.length, limit) });
  }));

  router.post('/expense-tracker/expenses', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateExpense(body);
    const existing = db.prepare('SELECT id FROM expense_entries WHERE user_id = ? AND external_id = ?')
      .get(userId, String(body.externalId));
    if (existing) throw apiError(409, 'conflict', `Expense ${body.externalId} already exists`);
    const m = ensureMonthByDate(db, userId, String(body.date));
    const info = db.prepare(
      `INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description,
          currency, category, sub_category, expense_type, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, m.id, String(body.externalId), String(body.date), Number(body.amount), String(body.description),
      body.currency != null ? String(body.currency) : null, String(body.category),
      body.subCategory != null ? String(body.subCategory) : null, String(body.expenseType), bool01(body.isRecurring),
    );
    const row = db.prepare('SELECT * FROM expense_entries WHERE id = ?').get(info.lastInsertRowid) as ExpenseRow;
    res.status(201).json(mapExpense(row));
  }));

  router.put('/expense-tracker/expenses/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    body.externalId = req.params.externalId;
    validateExpense(body);
    const m = ensureMonthByDate(db, userId, String(body.date));
    db.prepare('DELETE FROM expense_entries WHERE user_id = ? AND external_id = ?').run(userId, req.params.externalId);
    db.prepare(
      `INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount, description,
          currency, category, sub_category, expense_type, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, m.id, String(body.externalId), String(body.date), Number(body.amount), String(body.description),
      body.currency != null ? String(body.currency) : null, String(body.category),
      body.subCategory != null ? String(body.subCategory) : null, String(body.expenseType), bool01(body.isRecurring),
    );
    const row = db.prepare('SELECT * FROM expense_entries WHERE user_id = ? AND external_id = ?')
      .get(userId, req.params.externalId) as ExpenseRow;
    res.json(mapExpense(row));
  }));

  router.delete('/expense-tracker/expenses/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM expense_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Expense ${req.params.externalId} not found`);
    res.status(204).send();
  }));

  // --- Incomes ---
  router.get('/expense-tracker/incomes', handler((req, res) => {
    const userId = resolveUserId(req);
    const { limit, offset } = parsePagination(req);
    const where: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];
    if (typeof req.query.startDate === 'string') { where.push('date >= ?'); params.push(req.query.startDate); }
    if (typeof req.query.endDate === 'string') { where.push('date <= ?'); params.push(req.query.endDate); }
    if (typeof req.query.source === 'string') {
      if (!INCOME_SOURCES.has(req.query.source)) {
        throw apiError(400, 'invalid_param', `Invalid source: ${req.query.source}`);
      }
      where.push('source = ?'); params.push(req.query.source);
    }
    const rows = db
      .prepare(`SELECT * FROM income_entries WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as IncomeRow[];
    res.json({ items: rows.map(mapIncome), nextCursor: nextCursor(offset, rows.length, limit) });
  }));

  router.post('/expense-tracker/incomes', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateIncome(body);
    const existing = db.prepare('SELECT id FROM income_entries WHERE user_id = ? AND external_id = ?')
      .get(userId, String(body.externalId));
    if (existing) throw apiError(409, 'conflict', `Income ${body.externalId} already exists`);
    const m = ensureMonthByDate(db, userId, String(body.date));
    const info = db.prepare(
      `INSERT INTO income_entries (user_id, expense_month_id, external_id, date, amount, description,
          currency, source, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, m.id, String(body.externalId), String(body.date), Number(body.amount), String(body.description),
      body.currency != null ? String(body.currency) : null, String(body.source), bool01(body.isRecurring),
    );
    const row = db.prepare('SELECT * FROM income_entries WHERE id = ?').get(info.lastInsertRowid) as IncomeRow;
    res.status(201).json(mapIncome(row));
  }));

  router.put('/expense-tracker/incomes/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    body.externalId = req.params.externalId;
    validateIncome(body);
    const m = ensureMonthByDate(db, userId, String(body.date));
    db.prepare('DELETE FROM income_entries WHERE user_id = ? AND external_id = ?').run(userId, req.params.externalId);
    db.prepare(
      `INSERT INTO income_entries (user_id, expense_month_id, external_id, date, amount, description,
          currency, source, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, m.id, String(body.externalId), String(body.date), Number(body.amount), String(body.description),
      body.currency != null ? String(body.currency) : null, String(body.source), bool01(body.isRecurring),
    );
    const row = db.prepare('SELECT * FROM income_entries WHERE user_id = ? AND external_id = ?')
      .get(userId, req.params.externalId) as IncomeRow;
    res.json(mapIncome(row));
  }));

  router.delete('/expense-tracker/incomes/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM income_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Income ${req.params.externalId} not found`);
    res.status(204).send();
  }));

  // --- Budgets (replace-full-list) ---
  router.get('/expense-tracker/budgets', handler((req, res) => {
    const userId = resolveUserId(req);
    const monthKey = req.query.monthKey;
    let sql = 'SELECT * FROM category_budgets WHERE user_id = ?';
    const params: unknown[] = [userId];
    if (typeof monthKey === 'string' && monthKey !== '') {
      if (monthKey === 'global') {
        sql += ' AND expense_month_id IS NULL';
      } else {
        const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
        if (!match) throw apiError(400, 'invalid_param', `Invalid monthKey: ${monthKey}`);
        const m = ensureMonth(db, userId, Number(match[1]), Number(match[2]));
        sql += ' AND expense_month_id = ?'; params.push(m.id);
      }
    }
    const rows = db.prepare(sql).all(...params) as BudgetRow[];
    res.json(rows.map((b) => mapBudgetWithMonth(db, userId, b)));
  }));

  router.put('/expense-tracker/budgets', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = Array.isArray(req.body) ? (req.body as Record<string, unknown>[]) : [];
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM category_budgets WHERE user_id = ?').run(userId);
      const ins = db.prepare(
        `INSERT INTO category_budgets (user_id, expense_month_id, category, monthly_budget, currency)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const b of body) {
        let monthId: number | null = null;
        const mk = b.monthKey;
        if (typeof mk === 'string' && mk !== '') {
          const match = /^(\d{4})-(\d{2})$/.exec(mk);
          if (!match) throw apiError(400, 'invalid_body', `Invalid monthKey: ${mk}`);
          monthId = ensureMonth(db, userId, Number(match[1]), Number(match[2])).id;
        }
        ins.run(userId, monthId, String(b.category), Number(b.monthlyBudget),
          b.currency != null ? String(b.currency) : null);
      }
    });
    tx();
    const rows = db.prepare('SELECT * FROM category_budgets WHERE user_id = ?').all(userId) as BudgetRow[];
    res.json(rows.map((b) => mapBudgetWithMonth(db, userId, b)));
  }));

  // --- Custom categories ---
  router.get('/expense-tracker/custom-categories', handler((req, res) => {
    const rows = db
      .prepare('SELECT * FROM custom_categories WHERE user_id = ? ORDER BY id')
      .all(resolveUserId(req)) as CustomCatRow[];
    res.json(rows.map(mapCustomCat));
  }));

  router.post('/expense-tracker/custom-categories', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ['externalId', 'name', 'icon', 'color', 'defaultExpenseType']) {
      if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
    }
    if (!EXPENSE_TYPES.has(String(body.defaultExpenseType))) {
      throw apiError(400, 'invalid_body', `Invalid defaultExpenseType`);
    }
    const existing = db.prepare('SELECT id FROM custom_categories WHERE user_id = ? AND external_id = ?')
      .get(userId, String(body.externalId));
    if (existing) throw apiError(409, 'conflict', `CustomCategory ${body.externalId} already exists`);
    const info = db.prepare(
      `INSERT INTO custom_categories (user_id, external_id, name, icon, color, default_expense_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, String(body.externalId), String(body.name), String(body.icon),
      String(body.color), String(body.defaultExpenseType));
    const row = db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(info.lastInsertRowid) as CustomCatRow;
    res.status(201).json(mapCustomCat(row));
  }));

  router.put('/expense-tracker/custom-categories/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ['name', 'icon', 'color', 'defaultExpenseType']) {
      if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
    }
    if (!EXPENSE_TYPES.has(String(body.defaultExpenseType))) {
      throw apiError(400, 'invalid_body', `Invalid defaultExpenseType`);
    }
    db.prepare('DELETE FROM custom_categories WHERE user_id = ? AND external_id = ?').run(userId, req.params.externalId);
    db.prepare(
      `INSERT INTO custom_categories (user_id, external_id, name, icon, color, default_expense_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, req.params.externalId, String(body.name), String(body.icon),
      String(body.color), String(body.defaultExpenseType));
    const row = db.prepare('SELECT * FROM custom_categories WHERE user_id = ? AND external_id = ?')
      .get(userId, req.params.externalId) as CustomCatRow;
    res.json(mapCustomCat(row));
  }));

  router.delete('/expense-tracker/custom-categories/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM custom_categories WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `CustomCategory ${req.params.externalId} not found`);
    res.status(204).send();
  }));

  // --- Category overrides (replace-full-list) ---
  router.get('/expense-tracker/category-overrides', handler((req, res) => {
    const rows = db
      .prepare('SELECT * FROM category_overrides WHERE user_id = ? ORDER BY id')
      .all(resolveUserId(req)) as OverrideRow[];
    res.json(rows.map(mapOverride));
  }));

  router.put('/expense-tracker/category-overrides', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = Array.isArray(req.body) ? (req.body as Record<string, unknown>[]) : [];
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM category_overrides WHERE user_id = ?').run(userId);
      const ins = db.prepare(
        `INSERT INTO category_overrides (user_id, category_id, name, icon, color)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const o of body) {
        if (!('categoryId' in o)) throw apiError(400, 'invalid_body', 'Missing categoryId');
        ins.run(userId, String(o.categoryId),
          o.name != null ? String(o.name) : null,
          o.icon != null ? String(o.icon) : null,
          o.color != null ? String(o.color) : null);
      }
    });
    tx();
    const rows = db.prepare('SELECT * FROM category_overrides WHERE user_id = ?').all(userId) as OverrideRow[];
    res.json(rows.map(mapOverride));
  }));

  return router;
};
