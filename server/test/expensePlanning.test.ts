import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { planningFixture } from '../../tests/pages/expense-tracker/planningFixtures.js';
import { expectDiagnostic } from '../../tests/shared/diagnostics.js';
import { expensePlanningSchema } from '../src/routes/expensePlanning.js';
import { expensePlanningSchema as clientSchema } from '../../src/utils/expensePlanning.js';
import { rollbackMigrations, runMigrations } from '../src/migrate.js';

const base = '/api/v1/expense-tracker/planning';

describe('expense planning API', () => {
  it('round trips the complete per-user planning document', async () => {
    const { app } = await makeApp();
    const planning = planningFixture();
    const saved = await request(app).put(base).send(planning);
    expect(saved.status).toBe(200);
    expect((await request(app).get(base)).body).toEqual(planning);
  });

  it.each(['expenses', 'incomes'])('preserves original occurrence references in %s', async kind => {
    const { app } = await makeApp();
    const transaction = {
      externalId: 'posted-1', date: '2024-02-02', amount: 10, description: 'Test payment',
      scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
      ...(kind === 'expenses' ? { category: 'UTILITIES', expenseType: 'NEED' } : { source: 'SALARY' }),
    };
    const saved = await request(app).post(`/api/v1/expense-tracker/${kind}`).send(transaction);
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ scheduleId: 'schedule-1', scheduledDate: '2024-01-31' });
  });

  it('does not create rows when reading missing planning state', async () => {
    const { app, db } = await makeApp();
    expect((await request(app).get(base)).body.schedules).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM expense_planning').get()).toEqual({ count: 0 });
  });

  it('reports corrupt stored metadata without replacing it or leaking details', async () => {
    const { app, db } = await makeApp();
    const corrupt = '{"schemaVersion":99}';
    db.prepare('INSERT INTO expense_planning (user_id, payload_json) VALUES (1, ?)').run(corrupt);
    const response = await request(app).get(base);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('internal_error');
    expectDiagnostic('error', '[invalid-stored-data]: saved cashflow planning data is invalid');
    expect(db.prepare('SELECT payload_json FROM expense_planning').get()).toEqual({ payload_json: corrupt });
  });

  it('isolates planning data and occurrence uniqueness by user', async () => {
    const { app, db } = await makeApp();
    db.prepare("INSERT INTO users (id, email) VALUES (2, 'synthetic@tests.invalid')").run();
    await request(app).put(base).send(planningFixture());
    expect((await request(app).get(base).set('x-user-id', '2')).body.goals).toEqual([]);
    const body = {
      externalId: 'posted', date: '2024-01-31', amount: 100, description: 'Test bill',
      category: 'UTILITIES', expenseType: 'NEED', scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    };
    expect((await request(app).post('/api/v1/expense-tracker/expenses').send(body)).status).toBe(201);
    expect((await request(app).post('/api/v1/expense-tracker/expenses').set('x-user-id', '2').send(body)).status).toBe(201);
    const duplicate = await request(app).post('/api/v1/expense-tracker/incomes').send({
      ...body, externalId: 'another', source: 'SALARY',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('conflict');
  });

  it('retains the prior document after a database update failure', async () => {
    const { app, db } = await makeApp();
    const original = planningFixture();
    await request(app).put(base).send(original);
    db.exec(`CREATE TRIGGER reject_planning BEFORE UPDATE ON expense_planning
      BEGIN SELECT RAISE(ABORT, 'Injected planning failure'); END`);
    const failed = await request(app).put(base).send({ ...original, goals: [] });
    expect(failed.status).toBe(500);
    expectDiagnostic('error', '[unhandled-error]: Injected planning failure');
    expect((await request(app).get(base)).body).toEqual(original);
  });

  it.each([
    { ...planningFixture(), schemaVersion: 2 },
    { ...planningFixture(), schedules: [{ ...planningFixture().schedules[0], startDate: '2024-02-30' }] },
    { ...planningFixture(), goals: [{ ...planningFixture().goals[0], savedAmount: -1 }] },
    { ...planningFixture(), rules: [{ ...planningFixture().rules[0], match: {
      description: 'Test', operator: 'contains', minAmount: 10,
    } }] },
  ])('uses matching client/server boundary validation for invalid payload %#', async planning => {
    expect(expensePlanningSchema.safeParse(planning).success).toBe(false);
    expect(clientSchema.safeParse(planning).success).toBe(false);
    const { app } = await makeApp();
    const response = await request(app).put(base).send(planning);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_body');
  });

  it('rolls back planning without losing recorded amounts and reapplies cleanly', async () => {
    const { app, db } = await makeApp();
    await request(app).post('/api/v1/expense-tracker/expenses').send({
      externalId: 'posted', date: '2024-01-31', amount: 100, description: 'Test bill',
      category: 'UTILITIES', expenseType: 'NEED', scheduleId: 'schedule-1', scheduledDate: '2024-01-31',
    });
    await request(app).put(base).send(planningFixture());
    expect(rollbackMigrations(db, 'migrations', 1).migrationsRolledBack).toEqual(['0006_expense_planning']);
    expect(db.prepare('SELECT amount FROM expense_entries').get()).toEqual({ amount: 100 });
    expect(runMigrations(db, 'migrations').migrationsApplied).toEqual(['0006_expense_planning']);
    expect(db.prepare('SELECT schedule_id FROM expense_entries').get()).toEqual({ schedule_id: null });
  });
});
