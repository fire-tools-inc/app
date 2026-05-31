import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const fullInputs = {
  initialSavings: 50000,
  stocksPercent: 60,
  bondsPercent: 30,
  cashPercent: 10,
  currentAnnualExpenses: 30000,
  fireAnnualExpenses: 25000,
  annualLaborIncome: 70000,
  laborIncomeGrowthRate: 0.02,
  savingsRate: 0.3,
  desiredWithdrawalRate: 0.04,
  yearsOfExpenses: 25,
  expectedStockReturn: 0.07,
  expectedBondReturn: 0.03,
  expectedCashReturn: 0.01,
  yearOfBirth: 1990,
  retirementAge: 65,
  statePensionIncome: 0,
  privatePensionIncome: 0,
  otherIncome: 0,
  stopWorkingAtFIRE: true,
  maxAge: 95,
  useAssetAllocationValue: false,
  useExpenseTrackerExpenses: false,
  useExpenseTrackerIncome: false,
};

describe('GET /api/v1/calculator/inputs', () => {
  it('auto-creates defaults on first call', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/calculator/inputs');
    expect(res.status).toBe(200);
    expect(typeof res.body.initialSavings).toBe('number');
    expect(typeof res.body.stopWorkingAtFIRE).toBe('boolean');
    expect(typeof res.body.useAssetAllocationValue).toBe('boolean');
  });
});

describe('PUT /api/v1/calculator/inputs', () => {
  it('replaces all fields', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/calculator/inputs').send(fullInputs);
    expect(res.status).toBe(200);
    expect(res.body.initialSavings).toBe(50000);
    expect(res.body.stocksPercent).toBe(60);
    expect(res.body.stopWorkingAtFIRE).toBe(true);
  });

  it('persists after PUT', async () => {
    const { app } = makeApp();
    await request(app).put('/api/v1/calculator/inputs').send(fullInputs);
    const res = await request(app).get('/api/v1/calculator/inputs');
    expect(res.body.initialSavings).toBe(50000);
    expect(res.body.retirementAge).toBe(65);
  });

  it('rejects empty body', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/calculator/inputs').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects missing single field', async () => {
    const { app } = makeApp();
    const { maxAge: _x, ...partial } = fullInputs;
    const res = await request(app).put('/api/v1/calculator/inputs').send(partial);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('maxAge');
  });
});

describe('calculator multi-user isolation', () => {
  it('keeps inputs separate per x-user-id', async () => {
    const { app, db } = makeApp();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (2, 'two@x', '2024-01-01T00:00:00Z')",
    ).run();
    await request(app)
      .put('/api/v1/calculator/inputs')
      .set('x-user-id', '1')
      .send({ ...fullInputs, initialSavings: 111 });
    await request(app)
      .put('/api/v1/calculator/inputs')
      .set('x-user-id', '2')
      .send({ ...fullInputs, initialSavings: 222 });
    const u1 = await request(app).get('/api/v1/calculator/inputs').set('x-user-id', '1');
    const u2 = await request(app).get('/api/v1/calculator/inputs').set('x-user-id', '2');
    expect(u1.body.initialSavings).toBe(111);
    expect(u2.body.initialSavings).toBe(222);
  });
});
