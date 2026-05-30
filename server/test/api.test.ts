import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { rmSync } from 'node:fs';
import { makeApp, makeFileApp } from './helpers.js';

describe('GET /api/v1/health', () => {
  it('returns ok when DB reachable', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database.ok).toBe(true);
  });
});

describe('GET /api/v1/users/me', () => {
  it('returns the bootstrap user', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.email).toBe('local@firetools.local');
  });
});

describe('settings', () => {
  it('GET creates defaults, PATCH applies fields', async () => {
    const { app } = makeApp();
    const get = await request(app).get('/api/v1/settings');
    expect(get.status).toBe(200);
    expect(get.body.currencySettings.defaultCurrency).toBe('EUR');

    const patch = await request(app)
      .patch('/api/v1/settings')
      .send({ accountName: 'Alice', privacyMode: true });
    expect(patch.status).toBe(200);
    expect(patch.body.accountName).toBe('Alice');
    expect(patch.body.privacyMode).toBe(true);
  });

  it('GET/PUT notifications preferences', async () => {
    const { app } = makeApp();
    const get = await request(app).get('/api/v1/settings/notifications');
    expect(get.status).toBe(200);
    const put = await request(app)
      .put('/api/v1/settings/notifications')
      .send({
        enableInAppNotifications: true,
        newMonthReminders: false,
        newQuarterReminders: false,
        taxReminders: true,
        dcaReminders: false,
        portfolioAlerts: true,
        fireMilestones: true,
        enableEmailNotifications: false,
        emailAddress: 'me@example.com',
        emailFrequency: 'WEEKLY',
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 14,
      });
    expect(put.status).toBe(200);
    expect(put.body.enableInAppNotifications).toBe(true);
    expect(put.body.emailAddress).toBe('me@example.com');
  });
});

describe('calculator', () => {
  it('GET creates defaults, PUT replaces fields', async () => {
    const { app } = makeApp();
    const get = await request(app).get('/api/v1/calculator/inputs');
    expect(get.status).toBe(200);

    const put = await request(app).put('/api/v1/calculator/inputs').send({
      initialSavings: 50000,
      stocksPercent: 80,
      bondsPercent: 15,
      cashPercent: 5,
      currentAnnualExpenses: 30000,
      fireAnnualExpenses: 28000,
      annualLaborIncome: 60000,
      laborIncomeGrowthRate: 2,
      savingsRate: 50,
      desiredWithdrawalRate: 4,
      yearsOfExpenses: 25,
      expectedStockReturn: 7,
      expectedBondReturn: 3,
      expectedCashReturn: 1,
      yearOfBirth: 1990,
      retirementAge: 50,
      statePensionIncome: 0,
      privatePensionIncome: 0,
      otherIncome: 0,
      stopWorkingAtFIRE: true,
      maxAge: 90,
      useAssetAllocationValue: false,
      useExpenseTrackerExpenses: false,
      useExpenseTrackerIncome: false,
    });
    expect(put.status).toBe(200);
    expect(put.body.initialSavings).toBe(50000);
    expect(put.body.stopWorkingAtFIRE).toBe(true);
  });

  it('rejects PUT with missing field', async () => {
    const { app } = makeApp();
    const put = await request(app).put('/api/v1/calculator/inputs').send({ initialSavings: 1 });
    expect(put.status).toBe(400);
    expect(put.body.error.code).toBe('invalid_body');
  });
});

describe('notifications', () => {
  it('POST then GET then mark-all-read then DELETE', async () => {
    const { app } = makeApp();
    const create = await request(app).post('/api/v1/notifications').send({
      type: 'SYSTEM',
      title: 'Hi',
      message: 'Hello world',
      priority: 'HIGH',
    });
    expect(create.status).toBe(201);
    const ext = create.body.externalId;

    const list = await request(app).get('/api/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);

    const mark = await request(app).post('/api/v1/notifications/mark-all-read');
    expect(mark.status).toBe(200);
    expect(mark.body.updated).toBe(1);

    const get = await request(app).get(`/api/v1/notifications/${ext}`);
    expect(get.status).toBe(200);
    expect(get.body.read).toBe(true);

    const del = await request(app).delete(`/api/v1/notifications/${ext}`);
    expect(del.status).toBe(204);
  });
});

describe('asset allocation', () => {
  it('config + asset CRUD round-trip', async () => {
    const { app } = makeApp();
    const cfg = await request(app).get('/api/v1/asset-allocation/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.currency).toBe('EUR');

    const post = await request(app).post('/api/v1/asset-allocation/assets').send({
      externalId: 'asset-1',
      name: 'VWCE',
      ticker: 'VWCE.DE',
      assetClass: 'STOCKS',
      subAssetType: 'ETF',
      currentValue: 10000,
      targetMode: 'PERCENTAGE',
      targetPercent: 80,
    });
    expect(post.status).toBe(201);

    const list = await request(app).get('/api/v1/asset-allocation/assets');
    expect(list.body.length).toBe(1);
    expect(list.body[0].name).toBe('VWCE');
  });
});

describe('banks', () => {
  it('GET /banks returns array (may be empty), GET unknown returns 404', async () => {
    const { app } = makeApp();
    const list = await request(app).get('/api/v1/banks');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const miss = await request(app).get('/api/v1/banks/NOPE');
    expect(miss.status).toBe(404);
  });
});

describe('questionnaire', () => {
  it('POST stores a result and latest returns it', async () => {
    const { app } = makeApp();
    const post = await request(app).post('/api/v1/questionnaire/results').send({
      persona: 'REGULAR_FIRE',
      personaExplanation: 'You are a regular FIRE seeker',
      safeWithdrawalRate: 4,
      suggestedSavingsRate: 50,
      assetAllocation: { stocks: 70, bonds: 25, cash: 5 },
      suitableAssets: ['ETF', 'BONDS'],
      riskTolerance: 'moderate',
      responses: [{ q: 'age', a: 30 }],
    });
    expect(post.status).toBe(201);
    const latest = await request(app).get('/api/v1/questionnaire/results/latest');
    expect(latest.status).toBe(200);
    expect(latest.body.persona).toBe('REGULAR_FIRE');
  });
});

describe('portfolio breakdown', () => {
  it('returns array for given dimension', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send({
      externalId: 'pb-1',
      name: 'Stock A',
      ticker: 'AAPL',
      assetClass: 'STOCKS',
      subAssetType: 'SINGLE_STOCK',
      currentValue: 5000,
      targetMode: 'OFF',
    });
    const res = await request(app).get('/api/v1/portfolio-breakdown?dimension=currency');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].dimension).toBe('currency');
  });
});

describe('ui preferences', () => {
  it('PUT/GET/DELETE round-trips a preference', async () => {
    const { app } = makeApp();

    const empty = await request(app).get('/api/v1/ui-preferences');
    expect(empty.status).toBe(200);
    expect(empty.body.preferences).toEqual({});

    const put = await request(app)
      .put('/api/v1/ui-preferences/tour_completed')
      .send({ value: '{"completed":true}' });
    expect(put.status).toBe(200);
    expect(put.body.key).toBe('tour_completed');
    expect(put.body.value).toBe('{"completed":true}');

    const get = await request(app).get('/api/v1/ui-preferences/tour_completed');
    expect(get.status).toBe(200);
    expect(get.body.value).toBe('{"completed":true}');

    const list = await request(app).get('/api/v1/ui-preferences');
    expect(list.status).toBe(200);
    expect(list.body.preferences.tour_completed).toBe('{"completed":true}');

    const del = await request(app).delete('/api/v1/ui-preferences/tour_completed');
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/v1/ui-preferences/tour_completed');
    expect(after.status).toBe(404);
  });

  it('rejects invalid keys and oversized values', async () => {
    const { app } = makeApp();
    const bad = await request(app)
      .put('/api/v1/ui-preferences/1bad')
      .send({ value: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_param');

    const huge = 'a'.repeat(9000);
    const tooBig = await request(app)
      .put('/api/v1/ui-preferences/some_key')
      .send({ value: huge });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.code).toBe('invalid_body');
  });
});

describe('unimplemented endpoints', () => {
  it('returns 501 for paths not yet wired', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/some/contract-only/path');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('not_implemented');
  });
});

describe('admin: db encryption', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) {
      const d = dirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it('GET /admin/db/encryption reports unencrypted by default', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    const res = await request(app).get('/api/v1/admin/db/encryption');
    expect(res.status).toBe(200);
    expect(res.body.encrypted).toBe(false);
  });

  it('set → rotate → remove happy path via HTTP', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);

    const set = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set', newPassphrase: 'first-pass-12345' });
    expect(set.status).toBe(200);
    expect(set.body.encrypted).toBe(true);
    expect(set.body.backupPath).toMatch(/bak-pre-encryption/);

    const status1 = await request(app).get('/api/v1/admin/db/encryption');
    expect(status1.body.encrypted).toBe(true);

    const rotate = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({
        action: 'rotate',
        currentPassphrase: 'first-pass-12345',
        newPassphrase: 'second-pass-67890',
      });
    expect(rotate.status).toBe(200);
    expect(rotate.body.encrypted).toBe(true);

    const remove = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'remove', currentPassphrase: 'second-pass-67890' });
    expect(remove.status).toBe(200);
    expect(remove.body.encrypted).toBe(false);

    const status2 = await request(app).get('/api/v1/admin/db/encryption');
    expect(status2.body.encrypted).toBe(false);
  });

  it('rotate with wrong currentPassphrase returns 401 wrong_passphrase', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set', newPassphrase: 'right-pass-12345' });

    const res = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({
        action: 'rotate',
        currentPassphrase: 'wrong-pass-99999',
        newPassphrase: 'irrelevant-12345',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('wrong_passphrase');
  });

  it('set on already-encrypted DB returns 409', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set', newPassphrase: 'first-pass-12345' });
    const res = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set', newPassphrase: 'second-pass-67890' });
    expect(res.status).toBe(409);
  });

  it('remove on unencrypted DB returns 409', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    const res = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'remove' });
    expect(res.status).toBe(409);
  });

  it('rejects body with missing newPassphrase for set', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    const res = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects too-short newPassphrase via zod', async () => {
    const { app, dir } = makeFileApp();
    dirs.push(dir);
    const res = await request(app)
      .post('/api/v1/admin/db/passphrase')
      .send({ action: 'set', newPassphrase: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });
});
