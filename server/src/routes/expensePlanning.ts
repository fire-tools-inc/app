import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { apiError, handler, nowIso, parseBody, resolveUserId } from '../http.js';
import { logger } from '../logger.js';

const date = z.iso.date().refine(value => value >= '1900-01-01' && value <= '2100-12-31');
const id = z.string().min(1).refine(value => value.trim() === value);
const name = z.string().refine(value => value.trim().length > 0);
const amount = z.number().finite().nonnegative();
const currency = z.enum(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);
const source = z.enum([
  'SALARY', 'FREELANCE', 'BUSINESS', 'INVESTMENTS', 'RENTAL',
  'PENSION', 'SOCIAL_SECURITY', 'BONUS', 'GIFT', 'OTHER',
]);
const expenseType = z.enum(['NEED', 'WANT']);
const scheduleBase = {
  id, name, amount, currency, startDate: date, endDate: date.optional(),
  recurrence: z.object({
    unit: z.enum(['once', 'day', 'week', 'month', 'year']),
    interval: z.number().int().positive(),
  }).strict(),
  enabled: z.boolean(), archived: z.boolean(),
};
const schedule = z.discriminatedUnion('kind', [
  z.object({ ...scheduleBase, kind: z.literal('expense'), category: id, expenseType }).strict(),
  z.object({ ...scheduleBase, kind: z.literal('income'), source }).strict(),
]).refine(value => !value.endDate || value.endDate >= value.startDate, {
  message: 'End date must not precede start date.', path: ['endDate'],
});
const match = z.object({
  description: name, operator: z.enum(['equals', 'contains']), currency: currency.optional(),
  minAmount: amount.optional(), maxAmount: amount.optional(),
}).strict().superRefine((value, context) => {
  if ((value.minAmount !== undefined || value.maxAmount !== undefined) && !value.currency) {
    context.addIssue({ code: 'custom', path: ['currency'], message: 'Amount matching requires a currency.' });
  }
  if (value.minAmount !== undefined && value.maxAmount !== undefined && value.minAmount > value.maxAmount) {
    context.addIssue({ code: 'custom', path: ['maxAmount'], message: 'Maximum must not be less than minimum.' });
  }
});
const ruleBase = { id, name, enabled: z.boolean(), priority: z.number().int().nonnegative(), match };
const rule = z.discriminatedUnion('kind', [
  z.object({ ...ruleBase, kind: z.literal('expense'), category: id, expenseType }).strict(),
  z.object({ ...ruleBase, kind: z.literal('income'), source }).strict(),
]);

export const expensePlanningSchema = z.object({
  schemaVersion: z.literal(1),
  schedules: z.array(schedule),
  skippedOccurrences: z.array(z.object({ scheduleId: id, scheduledDate: date }).strict()),
  goals: z.array(z.object({
    id, name, currency, targetAmount: amount.positive(), savedAmount: amount,
    targetDate: date.optional(), archived: z.boolean(),
  }).strict()),
  rules: z.array(rule),
  forecast: z.object({
    openingBalance: z.number().finite(), startDate: date, currency,
    horizon: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  for (const key of ['schedules', 'goals', 'rules'] as const) {
    const ids = new Set<string>();
    value[key].forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({
        code: 'custom', path: [key, index, 'id'], message: 'Duplicate identifier.',
      });
      ids.add(item.id);
    });
  }
  const schedules = new Set(value.schedules.map(item => item.id));
  const occurrences = new Set<string>();
  value.skippedOccurrences.forEach((item, index) => {
    const key = `${item.scheduleId}:${item.scheduledDate}`;
    if (!schedules.has(item.scheduleId) || occurrences.has(key)) context.addIssue({
      code: 'custom', path: ['skippedOccurrences', index], message: 'Invalid or duplicate skipped occurrence.',
    });
    occurrences.add(key);
  });
});

export const scheduleReferenceSchema = z.object({
  scheduleId: id.nullish(), scheduledDate: date.nullish(),
}).refine(value => Boolean(value.scheduleId) === Boolean(value.scheduledDate), {
  message: 'scheduleId and scheduledDate must be provided together.',
});

interface PlanningRow { payload_json: string }

export const buildExpensePlanningRouter = (db: Database): Router => {
  const router = Router();
  router.get('/expense-tracker/planning', handler((req, res) => {
    const row = db.prepare('SELECT payload_json FROM expense_planning WHERE user_id = ?')
      .get(resolveUserId(req)) as PlanningRow | undefined;
    if (!row) {
      res.json({ schemaVersion: 1, schedules: [], skippedOccurrences: [], goals: [], rules: [] });
      return;
    }
    let planning: z.infer<typeof expensePlanningSchema>;
    try {
      planning = expensePlanningSchema.parse(JSON.parse(row.payload_json));
    } catch (error) {
      logger.error('expense-planning', 'invalid-stored-data', 'saved cashflow planning data is invalid', {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
      throw apiError(500, 'internal_error', 'Saved planning data is invalid. Restore a valid backup.');
    }
    res.json(planning);
  }));
  router.put('/expense-tracker/planning', handler((req, res) => {
    const planning = parseBody(expensePlanningSchema, req.body);
    const userId = resolveUserId(req);
    db.transaction(() => {
      db.prepare(`INSERT INTO expense_planning (user_id, payload_json, updated_at)
        VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE
        SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
        .run(userId, JSON.stringify(planning), nowIso());
    })();
    res.json(planning);
  }));
  return router;
};
