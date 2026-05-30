import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import {
  handler, resolveUserId, apiError, nowIso, parseIntParam,
  parsePagination, nextCursor, bool01,
} from '../http.js';

const DOC_TYPES_OPENAPI = new Set(['auto', 'receipt', 'invoice', 'bank_statement', 'payslip']);
// PdfDocType (used in stored drafts) excludes 'auto'
const DOC_TYPES_DRAFT = new Set(['receipt', 'invoice', 'bank_statement', 'payslip']);
const STATUSES = new Set(['pending', 'reviewed', 'committed', 'discarded']);
const KINDS = new Set(['income', 'expense']);

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);
const EXPENSE_TYPES = new Set(['NEED', 'WANT']);
const INCOME_SOURCES = new Set([
  'SALARY', 'FREELANCE', 'BUSINESS', 'INVESTMENTS', 'RENTAL',
  'PENSION', 'SOCIAL_SECURITY', 'BONUS', 'GIFT', 'OTHER',
]);

interface PdfImportRow {
  id: number; user_id: number; source_file: string; doc_type: string;
  drafts_json: string; status: string; created_at: string; committed_at: string | null;
}

interface DraftItem {
  id: string;
  kind: 'income' | 'expense';
  date: string;
  amount: number;
  description: string;
  docType: string;
  sourceFile: string;
  include: boolean;
  confidence: number;
  suggestedCategory?: string | null;
  suggestedExpenseType?: 'NEED' | 'WANT' | null;
  suggestedIncomeSource?: string | null;
  rawLine?: string | null;
  llmEnriched?: boolean;
  currency?: string | null;
}

const mapImport = (r: PdfImportRow) => ({
  id: r.id,
  sourceFile: r.source_file,
  docType: r.doc_type,
  drafts: JSON.parse(r.drafts_json) as DraftItem[],
  status: r.status,
  createdAt: r.created_at,
  committedAt: r.committed_at,
});

const validateDraft = (d: unknown, idx: number): DraftItem => {
  if (typeof d !== 'object' || d === null) {
    throw apiError(400, 'invalid_body', `drafts[${idx}] must be an object`);
  }
  const o = d as Record<string, unknown>;
  for (const k of ['id', 'kind', 'date', 'amount', 'description', 'docType', 'sourceFile', 'include', 'confidence']) {
    if (!(k in o)) throw apiError(400, 'invalid_body', `drafts[${idx}] missing field: ${k}`);
  }
  if (!KINDS.has(String(o.kind))) {
    throw apiError(400, 'invalid_body', `drafts[${idx}].kind must be income|expense`);
  }
  if (!DOC_TYPES_DRAFT.has(String(o.docType))) {
    throw apiError(400, 'invalid_body', `drafts[${idx}].docType invalid: ${o.docType}`);
  }
  return {
    id: String(o.id),
    kind: o.kind as 'income' | 'expense',
    date: String(o.date),
    amount: Number(o.amount),
    description: String(o.description),
    docType: String(o.docType),
    sourceFile: String(o.sourceFile),
    include: Boolean(o.include),
    confidence: Number(o.confidence),
    suggestedCategory: o.suggestedCategory != null ? String(o.suggestedCategory) : null,
    suggestedExpenseType: o.suggestedExpenseType != null
      ? (String(o.suggestedExpenseType) as 'NEED' | 'WANT') : null,
    suggestedIncomeSource: o.suggestedIncomeSource != null ? String(o.suggestedIncomeSource) : null,
    rawLine: o.rawLine != null ? String(o.rawLine) : null,
    llmEnriched: Boolean(o.llmEnriched),
    currency: o.currency != null ? String(o.currency) : null,
  };
};

// Reuse expense-month auto-create helpers (kept local to avoid cross-router import).
interface ExpenseYearRow { id: number; user_id: number; year: number }
interface ExpenseMonthRow { id: number; user_id: number; expense_year_id: number; month: number }

const ensureExpenseMonth = (db: Database, userId: number, dateIso: string): ExpenseMonthRow => {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) throw apiError(400, 'invalid_body', `Invalid draft date: ${dateIso}`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  let y = db.prepare('SELECT * FROM expense_years WHERE user_id = ? AND year = ?')
    .get(userId, year) as ExpenseYearRow | undefined;
  if (!y) {
    db.prepare('INSERT INTO expense_years (user_id, year) VALUES (?, ?)').run(userId, year);
    y = db.prepare('SELECT * FROM expense_years WHERE user_id = ? AND year = ?')
      .get(userId, year) as ExpenseYearRow;
  }
  let m = db.prepare(
    'SELECT * FROM expense_months WHERE user_id = ? AND expense_year_id = ? AND month = ?',
  ).get(userId, y.id, month) as ExpenseMonthRow | undefined;
  if (!m) {
    db.prepare('INSERT INTO expense_months (user_id, expense_year_id, month) VALUES (?, ?, ?)')
      .run(userId, y.id, month);
    m = db.prepare(
      'SELECT * FROM expense_months WHERE user_id = ? AND expense_year_id = ? AND month = ?',
    ).get(userId, y.id, month) as ExpenseMonthRow;
  }
  return m;
};

export const buildPdfImportsRouter = (db: Database): Router => {
  const router = Router();

  // List
  router.get('/pdf-imports', handler((req, res) => {
    const userId = resolveUserId(req);
    const { limit, offset } = parsePagination(req);
    const statusRaw = req.query.status;
    const params: unknown[] = [userId];
    let where = 'user_id = ?';
    if (statusRaw !== undefined && statusRaw !== '') {
      if (!STATUSES.has(String(statusRaw))) {
        throw apiError(400, 'invalid_param', `Invalid status: ${statusRaw}`);
      }
      where += ' AND status = ?';
      params.push(String(statusRaw));
    }
    params.push(limit, offset);
    const rows = db.prepare(
      `SELECT * FROM pdf_imports WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).all(...params) as PdfImportRow[];
    res.json({
      items: rows.map(mapImport),
      nextCursor: nextCursor(offset, rows.length, limit),
    });
  }));

  // Create
  router.post('/pdf-imports', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ['sourceFile', 'docType', 'drafts']) {
      if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
    }
    if (!DOC_TYPES_OPENAPI.has(String(body.docType))) {
      throw apiError(400, 'invalid_body', `Invalid docType: ${body.docType}`);
    }
    if (!Array.isArray(body.drafts)) {
      throw apiError(400, 'invalid_body', 'drafts must be an array');
    }
    const drafts = (body.drafts as unknown[]).map(validateDraft);
    const info = db.prepare(
      `INSERT INTO pdf_imports (user_id, source_file, doc_type, drafts_json, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).run(userId, String(body.sourceFile), String(body.docType),
      JSON.stringify(drafts), nowIso());
    const row = db.prepare('SELECT * FROM pdf_imports WHERE id = ?').get(info.lastInsertRowid) as PdfImportRow;
    res.status(201).json(mapImport(row));
  }));

  // Get one
  router.get('/pdf-imports/:id', handler((req, res) => {
    const userId = resolveUserId(req);
    const id = parseIntParam(req.params.id, 'id');
    const row = db.prepare('SELECT * FROM pdf_imports WHERE user_id = ? AND id = ?')
      .get(userId, id) as PdfImportRow | undefined;
    if (!row) throw apiError(404, 'not_found', `PDF import ${id} not found`);
    res.json(mapImport(row));
  }));

  // Patch (status or drafts)
  router.patch('/pdf-imports/:id', handler((req, res) => {
    const userId = resolveUserId(req);
    const id = parseIntParam(req.params.id, 'id');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const row = db.prepare('SELECT * FROM pdf_imports WHERE user_id = ? AND id = ?')
      .get(userId, id) as PdfImportRow | undefined;
    if (!row) throw apiError(404, 'not_found', `PDF import ${id} not found`);
    if ('status' in body) {
      if (!STATUSES.has(String(body.status))) {
        throw apiError(400, 'invalid_body', `Invalid status: ${body.status}`);
      }
      db.prepare('UPDATE pdf_imports SET status = ? WHERE id = ?').run(String(body.status), id);
    }
    if ('drafts' in body) {
      if (!Array.isArray(body.drafts)) {
        throw apiError(400, 'invalid_body', 'drafts must be an array');
      }
      const drafts = (body.drafts as unknown[]).map(validateDraft);
      db.prepare('UPDATE pdf_imports SET drafts_json = ? WHERE id = ?')
        .run(JSON.stringify(drafts), id);
    }
    const updated = db.prepare('SELECT * FROM pdf_imports WHERE id = ?').get(id) as PdfImportRow;
    res.json(mapImport(updated));
  }));

  // Delete
  router.delete('/pdf-imports/:id', handler((req, res) => {
    const userId = resolveUserId(req);
    const id = parseIntParam(req.params.id, 'id');
    const info = db.prepare('DELETE FROM pdf_imports WHERE user_id = ? AND id = ?').run(userId, id);
    if (info.changes === 0) throw apiError(404, 'not_found', `PDF import ${id} not found`);
    res.status(204).send();
  }));

  // Commit: turn included drafts into expense/income entries
  router.post('/pdf-imports/:id/commit', handler((req, res) => {
    const userId = resolveUserId(req);
    const id = parseIntParam(req.params.id, 'id');
    const row = db.prepare('SELECT * FROM pdf_imports WHERE user_id = ? AND id = ?')
      .get(userId, id) as PdfImportRow | undefined;
    if (!row) throw apiError(404, 'not_found', `PDF import ${id} not found`);
    if (row.status === 'committed') {
      throw apiError(409, 'conflict', `PDF import ${id} already committed`);
    }
    const drafts = JSON.parse(row.drafts_json) as DraftItem[];
    let importedExpenses = 0;
    let importedIncomes = 0;
    const tx = db.transaction(() => {
      for (const d of drafts) {
        if (!d.include) continue;
        const m = ensureExpenseMonth(db, userId, d.date);
        const externalId = `pdf:${id}:${d.id}`;
        if (d.kind === 'expense') {
          const expenseType = d.suggestedExpenseType && EXPENSE_TYPES.has(d.suggestedExpenseType)
            ? d.suggestedExpenseType : 'NEED';
          const category = d.suggestedCategory ?? 'OTHER';
          const currency = d.currency && CURRENCIES.has(d.currency) ? d.currency : null;
          db.prepare(
            `INSERT INTO expense_entries (user_id, expense_month_id, external_id, date, amount,
                description, currency, category, sub_category, expense_type, is_recurring)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(userId, m.id, externalId, d.date, d.amount, d.description,
            currency, category, null, expenseType, bool01(false));
          importedExpenses += 1;
        } else {
          const source = d.suggestedIncomeSource && INCOME_SOURCES.has(d.suggestedIncomeSource)
            ? d.suggestedIncomeSource : 'OTHER';
          const currency = d.currency && CURRENCIES.has(d.currency) ? d.currency : null;
          db.prepare(
            `INSERT INTO income_entries (user_id, expense_month_id, external_id, date, amount,
                description, currency, source, is_recurring)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(userId, m.id, externalId, d.date, d.amount, d.description,
            currency, source, bool01(false));
          importedIncomes += 1;
        }
      }
      db.prepare('UPDATE pdf_imports SET status = ?, committed_at = ? WHERE id = ?')
        .run('committed', nowIso(), id);
    });
    tx();
    res.json({ importedExpenses, importedIncomes });
  }));

  return router;
};
