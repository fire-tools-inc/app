import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const base = '/api/v1/expense-tracker';

const exp = (overrides: Record<string, unknown> = {}) => ({
  externalId: 'e-1',
  date: '2024-06-15',
  amount: 12.5,
  description: 'Lunch',
  category: 'food',
  expenseType: 'NEED',
  ...overrides,
});

const inc = (overrides: Record<string, unknown> = {}) => ({
  externalId: 'i-1',
  date: '2024-06-01',
  amount: 3000,
  description: 'Paycheck',
  source: 'SALARY',
  ...overrides,
});

describe('expense-tracker config', () => {
  it('GET returns defaults (EUR + current year/month)', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/config`);
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('EUR');
    expect(typeof res.body.currentYear).toBe('number');
    expect(typeof res.body.currentMonth).toBe('number');
  });

  it('PUT updates config', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({
      currency: 'USD', currentYear: 2025, currentMonth: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ currency: 'USD', currentYear: 2025, currentMonth: 3 });
  });

  it('PUT missing field → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({ currency: 'EUR' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('PUT invalid currency → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({
      currency: 'XXX', currentYear: 2024, currentMonth: 1,
    });
    expect(res.status).toBe(400);
  });
});

describe('expense-tracker months', () => {
  it('GET auto-creates and returns empty month', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/months/2024/6`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ year: 2024, month: 6, isClosed: false });
    expect(res.body.expenses).toEqual([]);
    expect(res.body.incomes).toEqual([]);
  });

  it('GET invalid year → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/months/1800/6`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('GET invalid month → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/months/2024/13`);
    expect(res.status).toBe(400);
  });

  it('PUT replaces month contents', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/months/2024/7`).send({
      expenses: [exp({ externalId: 'e-a', amount: 10 }), exp({ externalId: 'e-b', amount: 20 })],
      incomes: [inc({ externalId: 'i-a' })],
      budgets: [{ category: 'food', monthlyBudget: 500 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(2);
    expect(res.body.incomes).toHaveLength(1);
    expect(res.body.budgets).toHaveLength(1);
  });

  it('PUT invalid expenseType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/months/2024/7`).send({
      expenses: [exp({ expenseType: 'INVALID' })],
    });
    expect(res.status).toBe(400);
  });

  it('PATCH isClosed toggles closed flag', async () => {
    const { app } = makeApp();
    await request(app).get(`${base}/months/2024/8`);
    const res = await request(app).patch(`${base}/months/2024/8`).send({ isClosed: true });
    expect(res.status).toBe(200);
    expect(res.body.isClosed).toBe(true);
  });
});

describe('expense-tracker expenses', () => {
  it('POST creates expense', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/expenses`).send(exp());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'e-1', amount: 12.5, category: 'food', expenseType: 'NEED', type: 'expense' });
  });

  it('POST duplicate externalId → 409', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp());
    const res = await request(app).post(`${base}/expenses`).send(exp());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('POST missing field → 400', async () => {
    const { app } = makeApp();
    const { date, ...rest } = exp();
    void date;
    const res = await request(app).post(`${base}/expenses`).send(rest);
    expect(res.status).toBe(400);
  });

  it('POST invalid expenseType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/expenses`).send(exp({ expenseType: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('POST invalid currency → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/expenses`).send(exp({ currency: 'ZZZ' }));
    expect(res.status).toBe(400);
  });

  it('GET lists expenses', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-a' }));
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-b' }));
    const res = await request(app).get(`${base}/expenses`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
  });

  it('GET filters by category', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-a', category: 'food' }));
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-b', category: 'transport' }));
    const res = await request(app).get(`${base}/expenses?category=food`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].category).toBe('food');
  });

  it('GET filters by date range', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-jan', date: '2024-01-15' }));
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-jun', date: '2024-06-15' }));
    const res = await request(app).get(`${base}/expenses?startDate=2024-05-01&endDate=2024-12-31`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].externalId).toBe('e-jun');
  });

  it('GET filters by searchTerm', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-a', description: 'Lunch at cafe' }));
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-b', description: 'Gas station' }));
    const res = await request(app).get(`${base}/expenses?searchTerm=cafe`);
    expect(res.body.items).toHaveLength(1);
  });

  it('GET filters by isRecurring', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-a', isRecurring: true }));
    await request(app).post(`${base}/expenses`).send(exp({ externalId: 'e-b', isRecurring: false }));
    const res = await request(app).get(`${base}/expenses?isRecurring=true`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].externalId).toBe('e-a');
  });

  it('GET invalid expenseType filter → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/expenses?expenseType=NOPE`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('PUT upserts expense', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp());
    const res = await request(app).put(`${base}/expenses/e-1`).send(exp({ amount: 99 }));
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(99);
  });

  it('DELETE removes expense', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/expenses`).send(exp());
    const del = await request(app).delete(`${base}/expenses/e-1`);
    expect(del.status).toBe(204);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/expenses/missing`);
    expect(res.status).toBe(404);
  });
});

describe('expense-tracker incomes', () => {
  it('POST creates income', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/incomes`).send(inc());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'i-1', source: 'SALARY', type: 'income' });
  });

  it('POST duplicate → 409', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/incomes`).send(inc());
    const res = await request(app).post(`${base}/incomes`).send(inc());
    expect(res.status).toBe(409);
  });

  it('POST invalid source → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/incomes`).send(inc({ source: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('POST missing field → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/incomes`).send({ externalId: 'x', date: '2024-01-01', amount: 1 });
    expect(res.status).toBe(400);
  });

  it('GET filters by source', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/incomes`).send(inc({ externalId: 'i-a', source: 'SALARY' }));
    await request(app).post(`${base}/incomes`).send(inc({ externalId: 'i-b', source: 'BONUS' }));
    const res = await request(app).get(`${base}/incomes?source=SALARY`);
    expect(res.body.items).toHaveLength(1);
  });

  it('GET invalid source filter → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/incomes?source=NOPE`);
    expect(res.status).toBe(400);
  });

  it('PUT upserts income', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/incomes`).send(inc());
    const res = await request(app).put(`${base}/incomes/i-1`).send(inc({ amount: 9999 }));
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(9999);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/incomes/missing`);
    expect(res.status).toBe(404);
  });
});

describe('expense-tracker budgets', () => {
  it('PUT replaces full list', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/budgets`).send([
      { category: 'food', monthlyBudget: 500 },
      { category: 'transport', monthlyBudget: 100, monthKey: '2024-06' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET monthKey=global returns global budgets', async () => {
    const { app } = makeApp();
    await request(app).put(`${base}/budgets`).send([{ category: 'food', monthlyBudget: 500 }]);
    const res = await request(app).get(`${base}/budgets?monthKey=global`);
    expect(res.body).toHaveLength(1);
  });

  it('GET invalid monthKey → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/budgets?monthKey=2024`);
    expect(res.status).toBe(400);
  });

  it('PUT invalid monthKey in body → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/budgets`).send([
      { category: 'x', monthlyBudget: 1, monthKey: 'bad' },
    ]);
    expect(res.status).toBe(400);
  });
});

describe('expense-tracker custom categories', () => {
  const cat = (o: Record<string, unknown> = {}) => ({
    externalId: 'c-1', name: 'My Cat', icon: '🍕', color: '#f00',
    defaultExpenseType: 'WANT', ...o,
  });

  it('POST creates category', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/custom-categories`).send(cat());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'c-1', name: 'My Cat', defaultExpenseType: 'WANT' });
  });

  it('POST missing field → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/custom-categories`).send({ externalId: 'c-1', name: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST invalid defaultExpenseType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/custom-categories`).send(cat({ defaultExpenseType: 'X' }));
    expect(res.status).toBe(400);
  });

  it('POST duplicate → 409', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/custom-categories`).send(cat());
    const res = await request(app).post(`${base}/custom-categories`).send(cat());
    expect(res.status).toBe(409);
  });

  it('PUT updates category', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/custom-categories`).send(cat());
    const res = await request(app).put(`${base}/custom-categories/c-1`)
      .send({ name: 'Updated', icon: '🚗', color: '#000', defaultExpenseType: 'NEED' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/custom-categories/missing`);
    expect(res.status).toBe(404);
  });
});

describe('expense-tracker category overrides', () => {
  it('PUT replaces list', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/category-overrides`).send([
      { categoryId: 'food', name: 'Groceries', icon: '🛒', color: '#0f0' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].categoryId).toBe('food');
  });

  it('PUT missing categoryId → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/category-overrides`).send([{ name: 'x' }]);
    expect(res.status).toBe(400);
  });

  it('GET returns saved overrides', async () => {
    const { app } = makeApp();
    await request(app).put(`${base}/category-overrides`).send([{ categoryId: 'food' }]);
    const res = await request(app).get(`${base}/category-overrides`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
