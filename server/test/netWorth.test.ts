import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const base = '/api/v1/net-worth';

const holding = (o: Record<string, unknown> = {}) => ({
  externalId: 'h-1', ticker: 'VOO', name: 'Vanguard 500',
  shares: 10, pricePerShare: 400, currency: 'USD', assetClass: 'ETF',
  ...o,
});
const cash = (o: Record<string, unknown> = {}) => ({
  externalId: 'c-1', accountName: 'Main', accountType: 'CHECKING',
  balance: 1000, currency: 'EUR', ...o,
});
const pension = (o: Record<string, unknown> = {}) => ({
  externalId: 'p-1', name: 'Plan A', currentValue: 50000,
  currency: 'EUR', pensionType: 'PRIVATE', ...o,
});
const debt = (o: Record<string, unknown> = {}) => ({
  externalId: 'd-1', name: 'Loan', debtType: 'PERSONAL_LOAN',
  currentBalance: 5000, currency: 'EUR', ...o,
});
const tax = (o: Record<string, unknown> = {}) => ({
  externalId: 't-1', name: 'Income Tax 2024', taxType: 'INCOME_TAX',
  amount: 1200, currency: 'EUR', isPaid: false, ...o,
});
const op = (o: Record<string, unknown> = {}) => ({
  externalId: 'o-1', date: '2024-06-01', type: 'PURCHASE',
  description: 'Bought ETF', amount: 500, currency: 'EUR', ...o,
});

describe('net-worth config', () => {
  it('GET returns defaults', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/config`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      defaultCurrency: 'EUR',
      showPensionInNetWorth: true,
      includeUnrealizedGains: true,
      syncWithAssetAllocation: false,
    });
  });

  it('PUT updates config', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({
      defaultCurrency: 'USD', currentYear: 2025, currentMonth: 3,
      showPensionInNetWorth: false, includeUnrealizedGains: false,
      syncWithAssetAllocation: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.defaultCurrency).toBe('USD');
    expect(res.body.syncWithAssetAllocation).toBe(true);
  });

  it('PUT missing field → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({ defaultCurrency: 'EUR' });
    expect(res.status).toBe(400);
  });

  it('PUT invalid currency → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/config`).send({
      defaultCurrency: 'XXX', currentYear: 2024, currentMonth: 1,
      showPensionInNetWorth: true, includeUnrealizedGains: true,
    });
    expect(res.status).toBe(400);
  });
});

describe('net-worth snapshot & months', () => {
  it('GET snapshot returns shell with config', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/snapshot`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('years');
    expect(res.body).toHaveProperty('defaultCurrency');
    expect(res.body.settings).toBeDefined();
  });

  it('GET month auto-creates empty month', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/months/2024/6`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ year: 2024, month: 6, isFrozen: false });
    expect(res.body.assets).toEqual([]);
  });

  it('PUT month replaces contents', async () => {
    const { app } = makeApp();
    const res = await request(app).put(`${base}/months/2024/7`).send({
      assets: [holding()],
      cashEntries: [cash()],
      pensions: [pension()],
      debts: [debt()],
      taxes: [tax()],
      operations: [op()],
      isFrozen: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.cashEntries).toHaveLength(1);
    expect(res.body.pensions).toHaveLength(1);
    expect(res.body.debts).toHaveLength(1);
    expect(res.body.taxes).toHaveLength(1);
    expect(res.body.operations).toHaveLength(1);
  });

  it('PATCH month sets isFrozen', async () => {
    const { app } = makeApp();
    await request(app).get(`${base}/months/2024/8`);
    const res = await request(app).patch(`${base}/months/2024/8`).send({ isFrozen: true });
    expect(res.status).toBe(200);
    expect(res.body.isFrozen).toBe(true);
    expect(res.body.frozenDate).toBeTruthy();
  });

  it('PATCH monthNote updates note', async () => {
    const { app } = makeApp();
    await request(app).get(`${base}/months/2024/9`);
    const res = await request(app).patch(`${base}/months/2024/9`).send({ monthNote: 'hi' });
    expect(res.body.monthNote).toBe('hi');
  });
});

describe('net-worth holdings', () => {
  it('POST creates holding', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(holding());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'h-1', ticker: 'VOO', assetClass: 'ETF' });
  });

  it('POST invalid assetClass → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(holding({ assetClass: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('POST invalid currency → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(holding({ currency: 'XXX' }));
    expect(res.status).toBe(400);
  });

  it('POST missing field → 400', async () => {
    const { app } = makeApp();
    const { shares, ...rest } = holding();
    void shares;
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(rest);
    expect(res.status).toBe(400);
  });

  it('GET lists holdings', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/holdings`).send(holding({ externalId: 'h-a' }));
    await request(app).post(`${base}/months/2024/6/holdings`).send(holding({ externalId: 'h-b' }));
    const res = await request(app).get(`${base}/months/2024/6/holdings`);
    expect(res.body).toHaveLength(2);
  });

  it('PUT upserts holding', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/holdings`).send(holding());
    const res = await request(app).put(`${base}/months/2024/6/holdings/h-1`)
      .send(holding({ shares: 99 }));
    expect(res.status).toBe(200);
    expect(res.body.shares).toBe(99);
  });

  it('DELETE removes holding', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/holdings`).send(holding());
    const res = await request(app).delete(`${base}/months/2024/6/holdings/h-1`);
    expect(res.status).toBe(204);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/holdings/missing`);
    expect(res.status).toBe(404);
  });

  it('POST holding with vehicleDepreciation block', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(holding({
      assetClass: 'VEHICLE',
      vehicleDepreciation: {
        method: 'STRAIGHT_LINE', purchasePrice: 20000,
        purchaseDate: '2020-01-01', salvageValue: 2000, usefulLifeYears: 10,
      },
    }));
    expect(res.status).toBe(201);
    expect(res.body.vehicleDepreciation).toBeDefined();
  });

  it('POST holding with invalid vehicleDepreciation.method → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/holdings`).send(holding({
      assetClass: 'VEHICLE',
      vehicleDepreciation: {
        method: 'WRONG', purchasePrice: 1, purchaseDate: '2020-01-01',
        salvageValue: 1, usefulLifeYears: 1,
      },
    }));
    expect(res.status).toBe(400);
  });
});

describe('net-worth cash entries', () => {
  it('POST creates cash entry', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/cash`).send(cash());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'c-1', balance: 1000 });
  });

  it('POST invalid accountType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/cash`).send(cash({ accountType: 'BAD' }));
    expect(res.status).toBe(400);
  });

  it('PUT upserts cash entry', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/cash`).send(cash());
    const res = await request(app).put(`${base}/months/2024/6/cash/c-1`).send(cash({ balance: 9000 }));
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(9000);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/cash/missing`);
    expect(res.status).toBe(404);
  });
});

describe('net-worth pension entries', () => {
  it('POST creates pension', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/pensions`).send(pension());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'p-1', pensionType: 'PRIVATE' });
  });

  it('POST invalid pensionType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/pensions`).send(pension({ pensionType: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('PUT upserts pension', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/pensions`).send(pension());
    const res = await request(app).put(`${base}/months/2024/6/pensions/p-1`)
      .send(pension({ currentValue: 80000 }));
    expect(res.body.currentValue).toBe(80000);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/pensions/missing`);
    expect(res.status).toBe(404);
  });
});

describe('net-worth debt entries', () => {
  it('POST creates debt', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/debts`).send(debt());
    expect(res.status).toBe(201);
  });

  it('POST invalid debtType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/debts`).send(debt({ debtType: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('PUT upserts debt', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/debts`).send(debt());
    const res = await request(app).put(`${base}/months/2024/6/debts/d-1`).send(debt({ currentBalance: 4500 }));
    expect(res.body.currentBalance).toBe(4500);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/debts/missing`);
    expect(res.status).toBe(404);
  });
});

describe('net-worth tax entries', () => {
  it('POST creates tax', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/taxes`).send(tax());
    expect(res.status).toBe(201);
    expect(res.body.isPaid).toBe(false);
  });

  it('POST invalid taxType → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/taxes`).send(tax({ taxType: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('PUT upserts tax', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/taxes`).send(tax());
    const res = await request(app).put(`${base}/months/2024/6/taxes/t-1`).send(tax({ isPaid: true }));
    expect(res.body.isPaid).toBe(true);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/taxes/missing`);
    expect(res.status).toBe(404);
  });
});

describe('net-worth operations (paginated)', () => {
  it('POST creates operation', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/operations`).send(op());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ externalId: 'o-1', type: 'PURCHASE' });
  });

  it('POST invalid type → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post(`${base}/months/2024/6/operations`).send(op({ type: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('GET returns paginated items', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/operations`).send(op({ externalId: 'o-a' }));
    await request(app).post(`${base}/months/2024/6/operations`).send(op({ externalId: 'o-b' }));
    const res = await request(app).get(`${base}/months/2024/6/operations`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body).toHaveProperty('nextCursor');
  });

  it('PUT upserts operation', async () => {
    const { app } = makeApp();
    await request(app).post(`${base}/months/2024/6/operations`).send(op());
    const res = await request(app).put(`${base}/months/2024/6/operations/o-1`).send(op({ amount: 999 }));
    expect(res.body.amount).toBe(999);
  });

  it('DELETE missing → 404', async () => {
    const { app } = makeApp();
    const res = await request(app).delete(`${base}/months/2024/6/operations/missing`);
    expect(res.status).toBe(404);
  });
});

describe('net-worth user scoping', () => {
  it('GET holdings empty after fresh init for user 1', async () => {
    const { app } = makeApp();
    const res = await request(app).get(`${base}/months/2024/6/holdings`).set('x-user-id', '1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
