import { describe, it, expect, onTestFinished } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/migrate.js';
import { makeApp, testEnv } from './helpers.js';
import { documents, expenseTrackerDoc, toChangeset, type DomainName } from './syncFixtures.js';

const DOMAINS = Object.keys(documents) as DomainName[];

type App = Awaited<ReturnType<typeof makeApp>>['app'];

const status = async (app: App) => (await request(app).get('/api/v1/sync/status')).body as {
  instanceId: string; domains: Record<DomainName, { revision: number; initialized: boolean }>;
};

const seedExpenseTracker = async (app: App) => {
  const res = await request(app).put('/api/v1/state/expenseTracker')
    .send(toChangeset('expenseTracker', expenseTrackerDoc));
  expect(res.status).toBe(200);
  return (await request(app).get('/api/v1/state/expenseTracker')).body;
};

describe('GET /sync/status and /state/:domain', () => {
  it('reports every domain as untouched on a fresh database', async () => {
    const { app } = await makeApp();
    const body = await status(app);
    expect(body.instanceId).toMatch(/^[0-9a-f]{32}$/);
    expect(Object.keys(body.domains).sort()).toEqual([...DOMAINS].sort());
    for (const domain of DOMAINS) {
      expect(body.domains[domain]).toEqual({ revision: 0, initialized: false });
      const state = await request(app).get(`/api/v1/state/${domain}`);
      expect(state.status).toBe(200);
      expect(state.body).toEqual({ domain, instanceId: body.instanceId, revision: 0, initialized: false, data: null });
    }
  });

  it('answers 404 for an unknown domain', async () => {
    const { app } = await makeApp();
    for (const method of ['get', 'patch', 'put'] as const) {
      const res = await request(app)[method]('/api/v1/state/scenarios').send({});
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
  });

  it('marks a domain initialized without inventing data or bumping its revision', async () => {
    const { app } = await makeApp();
    const first = await request(app).patch('/api/v1/state/netWorth').send({ initialize: true });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ domain: 'netWorth', revision: 0, previousRevision: 0, initialized: true });
    const again = await request(app).patch('/api/v1/state/netWorth').send({ initialize: true });
    expect(again.body.initialized).toBe(true);
    const state = await request(app).get('/api/v1/state/netWorth');
    expect(state.body).toMatchObject({ initialized: true, revision: 0, data: null });
    expect((await status(app)).domains.netWorth).toEqual({ revision: 0, initialized: true });
    expect((await status(app)).domains.expenseTracker).toEqual({ revision: 0, initialized: false });
  });
});

describe('PUT /state/:domain round trip', () => {
  it.each(DOMAINS)('stores and returns the %s document unchanged, in order', async (domain) => {
    const { app } = await makeApp();
    const put = await request(app).put(`/api/v1/state/${domain}`).send(toChangeset(domain, documents[domain]));
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ domain, previousRevision: 0, initialized: true });
    expect(put.body.revision).toBeGreaterThan(0);
    const state = await request(app).get(`/api/v1/state/${domain}`);
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ domain, revision: put.body.revision, initialized: true });
    expect(state.body.data).toEqual(documents[domain]);
    expect((await status(app)).domains[domain]).toEqual({ revision: put.body.revision, initialized: true });
  });

  it('replaces the previous document instead of merging into it', async () => {
    const { app } = await makeApp();
    await seedExpenseTracker(app);
    const smaller = {
      ...expenseTrackerDoc,
      years: [expenseTrackerDoc.years[1]!],
      customCategories: undefined,
      categoryOverrides: undefined,
      planning: undefined,
    };
    const put = await request(app).put('/api/v1/state/expenseTracker').send(toChangeset('expenseTracker', smaller));
    expect(put.status).toBe(200);
    expect(put.body.previousRevision).toBeGreaterThan(0);
    const { customCategories: _c, categoryOverrides: _o, planning: _p, ...expected } = smaller;
    expect((await request(app).get('/api/v1/state/expenseTracker')).body.data).toEqual(expected);
  });

  it('clears a domain with an empty changeset', async () => {
    const { app } = await makeApp();
    await seedExpenseTracker(app);
    expect((await request(app).put('/api/v1/state/expenseTracker').send({})).status).toBe(200);
    const state = await request(app).get('/api/v1/state/expenseTracker');
    expect(state.body).toMatchObject({ initialized: true, data: null });
  });

  it('keeps the device-local AI model configuration out of synced settings', async () => {
    const { app } = await makeApp();
    const llmCategorization = { baseUrl: 'http://localhost:11434/v1', apiKey: 'synthetic-key', model: 'synthetic', provider: 'local' };
    await request(app).patch('/api/v1/settings').send({ llmCategorization });
    const put = await request(app).put('/api/v1/state/settings').send({
      set: {
        settings: {
          ...documents.settings,
          llmCategorization: { baseUrl: 'http://elsewhere/v1', apiKey: 'other', model: 'other' },
          backend: { mode: 'custom', customUrl: 'http://synthetic.invalid' },
          loggingPiiEnabled: true,
        },
      },
    });
    expect(put.status).toBe(200);
    const state = await request(app).get('/api/v1/state/settings');
    expect(state.body.data).toEqual(documents.settings);
    expect((await request(app).get('/api/v1/settings')).body.llmCategorization).toEqual(llmCategorization);
  });
});

describe('PATCH /state/:domain merge semantics', () => {
  it('upserts, moves, deletes and auto-creates months', async () => {
    const { app } = await makeApp();
    const before = await seedExpenseTracker(app);
    const coffee = before.data.years[1].months[0].expenses[1];
    const res = await request(app).patch('/api/v1/state/expenseTracker').send({
      upsert: {
        expenses: [
          { ...coffee, year: 2025, month: 3, position: 0, date: '2025-03-04' },
          {
            id: 'exp-new', type: 'expense', date: '2026-05-02', amount: 42, description: 'New synthetic expense',
            category: 'TRAVEL', expenseType: 'WANT', isRecurring: false, year: 2026, month: 5, position: 0,
          },
        ],
        globalBudgets: [{ category: 'GROCERIES', monthlyBudget: 450, currency: 'EUR', position: 0 }],
      },
      delete: {
        incomes: ['inc-bonus'], months: ['2024-12'], customCategories: ['missing-is-fine'],
        monthBudgets: ['2025-01|DINING_OUT'], globalBudgets: ['custom-pets'],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.revision).not.toBe(before.revision);
    expect(res.body.previousRevision).toBe(before.revision);

    const data = (await request(app).get('/api/v1/state/expenseTracker')).body.data;
    const months = Object.fromEntries(data.years.flatMap((year: { months: Array<{ year: number; month: number }> }) =>
      year.months.map(month => [`${month.year}-${month.month}`, month])));
    expect(Object.keys(months)).toEqual(['2025-1', '2025-3', '2026-5']);
    expect(data.years.map((year: { year: number }) => year.year)).toEqual([2024, 2025, 2026]);
    expect(data.years[0].months).toEqual([]);
    expect(data.years[2]).toMatchObject({ year: 2026, isArchived: false });
    expect(months['2026-5']).toMatchObject({ isClosed: false, incomes: [], budgets: [] });
    expect(months['2026-5'].expenses.map((e: { id: string }) => e.id)).toEqual(['exp-new']);
    expect(months['2025-1'].expenses.map((e: { id: string }) => e.id)).toEqual(['exp-rent', 'exp-vet']);
    expect(months['2025-1'].incomes.map((e: { id: string }) => e.id)).toEqual(['inc-salary']);
    expect(months['2025-3'].expenses).toEqual([{ ...coffee, date: '2025-03-04' }]);
    expect(data.globalBudgets).toEqual([{ category: 'GROCERIES', monthlyBudget: 450, currency: 'EUR' }]);
    expect(months['2025-1'].budgets).toEqual([{ category: 'HOUSING', monthlyBudget: 1200, currency: 'EUR' }]);
  });

  it('moves net worth items between months and deletes before it upserts', async () => {
    const { app } = await makeApp();
    await request(app).put('/api/v1/state/netWorth').send(toChangeset('netWorth', documents.netWorth)).expect(200);
    const january = documents.netWorth.years[0]!.months[0]!;
    const res = await request(app).patch('/api/v1/state/netWorth').send({
      delete: { months: ['2025-01'] },
      upsert: { cashEntries: [{ ...january.cashEntries[0], year: 2026, month: 1, balance: 6100 }] },
    });
    expect(res.status).toBe(200);
    const data = (await request(app).get('/api/v1/state/netWorth')).body.data;
    expect(data.years.map((year: { year: number; months: Array<{ month: number }> }) =>
      [year.year, year.months.map(month => month.month)])).toEqual([[2025, [2]], [2026, [1]]]);
    expect(data.years[1].months[0]).toMatchObject({ isFrozen: false, assets: [], pensions: [] });
    expect(data.years[1].months[0].cashEntries).toEqual([{ ...january.cashEntries[0], balance: 6100 }]);
    expect(JSON.stringify(data)).not.toContain('nw-etf');
  });

  it('orders granular inserts after positioned items and keeps positions on granular edits', async () => {
    const { app } = await makeApp();
    await seedExpenseTracker(app);
    const created = await request(app).post('/api/v1/expense-tracker/expenses').send({
      externalId: 'exp-api', date: '2025-01-20', amount: 15, description: 'From the API', category: 'GROCERIES', expenseType: 'NEED',
    });
    expect(created.status).toBe(201);
    const edited = await request(app).put('/api/v1/expense-tracker/expenses/exp-rent').send({
      date: '2025-01-01', amount: 1250, description: 'Rent', category: 'HOUSING', expenseType: 'NEED',
    });
    expect(edited.status).toBe(200);
    const data = (await request(app).get('/api/v1/state/expenseTracker')).body.data;
    const january = data.years[1].months[0];
    expect(january.expenses.map((e: { id: string }) => e.id)).toEqual(['exp-rent', 'exp-coffee', 'exp-vet', 'exp-api']);
    expect(january.expenses[0]).toMatchObject({ amount: 1250, type: 'expense' });
  });
});

describe('invalid changes', () => {
  it('rejects an invalid entity and keeps everything that was saved before', async () => {
    const { app } = await makeApp();
    const before = await seedExpenseTracker(app);
    const res = await request(app).patch('/api/v1/state/expenseTracker').send({
      set: { config: { currency: 'USD', currentYear: 2026, currentMonth: 1 } },
      delete: { months: ['2025-01'] },
      upsert: {
        expenses: [
          { id: 'exp-ok', date: '2025-03-02', amount: 5, description: 'Valid', category: 'OTHER', expenseType: 'WANT', year: 2025, month: 3 },
          { id: 'exp-bad', date: '2025-03-03', amount: -5, description: 'Negative', category: 'OTHER', expenseType: 'WANT', year: 2025, month: 3 },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
    expect(res.body.error.details).toMatchObject({ collection: 'expenses', key: 'exp-bad' });
    expect(res.body.error.details.message).toMatch(/amount/);
    const after = (await request(app).get('/api/v1/state/expenseTracker')).body;
    expect(after.revision).toBe(before.revision);
    expect(after.data).toEqual(before.data);
  });

  it('keeps the previous document when a replacement fails', async () => {
    const { app } = await makeApp();
    const before = await seedExpenseTracker(app);
    const res = await request(app).put('/api/v1/state/expenseTracker').send({
      upsert: { incomes: [{ id: 'inc-bad', date: '2025-02-30', amount: 1, description: 'x', source: 'SALARY', year: 2025, month: 2 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ collection: 'incomes', key: 'inc-bad' });
    expect((await request(app).get('/api/v1/state/expenseTracker')).body).toEqual(before);
  });

  it('answers 409 for a scheduled occurrence that is already recorded', async () => {
    const { app } = await makeApp();
    const before = await seedExpenseTracker(app);
    const res = await request(app).patch('/api/v1/state/expenseTracker').send({
      upsert: {
        expenses: [{
          id: 'exp-dupe', date: '2025-01-01', amount: 1200, description: 'Rent again', category: 'HOUSING',
          expenseType: 'NEED', scheduleId: 'sched-rent', scheduledDate: '2025-01-01', year: 2025, month: 1,
        }],
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'conflict', details: { collection: 'expenses', key: 'exp-dupe' } });
    expect((await request(app).get('/api/v1/state/expenseTracker')).body.revision).toBe(before.revision);
  });

  it('names unknown collections, singletons and malformed entities', async () => {
    const { app } = await makeApp();
    const unknownCollection = await request(app).patch('/api/v1/state/netWorth').send({ upsert: { holdings: [] } });
    expect(unknownCollection.status).toBe(400);
    expect(unknownCollection.body.error.details).toMatchObject({ collection: 'holdings', key: null });
    const unknownSet = await request(app).patch('/api/v1/state/calculator').send({ set: { settings: {} } });
    expect(unknownSet.body.error.details).toMatchObject({ collection: 'set', key: 'settings' });
    const wrongType = await request(app).patch('/api/v1/state/netWorth').send({
      upsert: { pensions: [{ id: 'p', name: 'P', currentValue: '12', currency: 'EUR', pensionType: 'STATE', year: 2025, month: 1 }] },
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.details).toMatchObject({ collection: 'pensions', key: 'p' });
    expect(wrongType.body.error.details.message).toMatch(/currentValue/);
    const notAList = await request(app).patch('/api/v1/state/assetAllocation').send({ upsert: { assets: {} } });
    expect(notAList.status).toBe(400);
    expect(notAList.body.error.details).toMatchObject({ collection: 'assets' });
    const duplicate = await request(app).patch('/api/v1/state/assetAllocation').send({
      upsert: { assets: [documents.assetAllocation.assets[2], { ...documents.assetAllocation.assets[2], currentValue: 1 }] },
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.details).toMatchObject({ collection: 'assets', key: 'asset-cash' });
    const notJson = await request(app).put('/api/v1/state/assetAllocation').set('Content-Type', 'text/plain').send('{}');
    expect(notJson.status).toBe(400);
    for (const domain of DOMAINS) expect((await status(app)).domains[domain].revision).toBe(0);
  });
});

describe('revisions', () => {
  it('bump when granular routes write a domain', async () => {
    const { app } = await makeApp();
    const initial = await status(app);
    await request(app).post('/api/v1/expense-tracker/expenses').send({
      externalId: 'exp-granular', date: '2025-04-02', amount: 9, description: 'Granular', category: 'GROCERIES', expenseType: 'NEED',
    }).expect(201);
    await request(app).post('/api/v1/net-worth/months/2025/4/pensions').send({
      externalId: 'p-granular', name: 'Pension', currentValue: 100, currency: 'EUR', pensionType: 'STATE',
    }).expect(201);
    await request(app).put('/api/v1/asset-allocation/targets').send({ STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 100 } }).expect(200);
    await request(app).patch('/api/v1/settings').send({ language: 'de' }).expect(200);
    await request(app).put('/api/v1/calculator/inputs').send({ ...documents.calculator, fireType: undefined }).expect(200);
    const after = await status(app);
    for (const domain of DOMAINS) expect(after.domains[domain].revision).not.toBe(initial.domains[domain].revision);
    expect((await request(app).get('/api/v1/state/expenseTracker')).body.data.years[0].months[0].expenses[0])
      .toMatchObject({ id: 'exp-granular', type: 'expense', amount: 9 });
    expect((await request(app).get('/api/v1/state/settings')).body.data.language).toBe('de');
    const unchanged = await status(app);
    await request(app).get('/api/v1/state/netWorth').expect(200);
    expect(await status(app)).toEqual(unchanged);
  });
});

describe('bearer token', () => {
  const tokenApp = async () => {
    const env = testEnv();
    env.apiToken = 'synthetic-token';
    return (await makeApp(env)).app;
  };

  it('rejects requests without the token or with a wrong one', async () => {
    const app = await tokenApp();
    const missing = await request(app).get('/api/v1/sync/status');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('unauthorized');
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    const wrong = await request(app).get('/api/v1/settings').set('Authorization', 'Bearer synthetic-tokem');
    expect(wrong.status).toBe(401);
    const write = await request(app).put('/api/v1/state/calculator').send({ set: { inputs: documents.calculator } });
    expect(write.status).toBe(401);
    const ok = await request(app).get('/api/v1/state/calculator').set('Authorization', 'Bearer synthetic-token');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toBeNull();
  });

  it('accepts a revocable second token only while it is issued', async () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, testEnv().migrationsPath);
    let agentToken: string | null = 'synthetic-agent-token';
    const app = buildApp({
      db, env: { ...testEnv(), apiToken: 'synthetic-token' }, dbPath: ':memory:', disableRateLimit: true,
      secondaryApiToken: () => agentToken,
    });
    onTestFinished(async () => {
      await app.closeReceiptUploads();
      db.close();
    });
    const asAgent = () => request(app).get('/api/v1/sync/status').set('Authorization', 'Bearer synthetic-agent-token');
    expect((await asAgent()).status).toBe(200);
    agentToken = null;
    expect((await asAgent()).status).toBe(401);
    expect((await request(app).get('/api/v1/sync/status').set('Authorization', 'Bearer synthetic-token')).status).toBe(200);
  });

  it('keeps the health probe and CORS preflight open', async () => {
    const app = await tokenApp();
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    const preflight = await request(app).options('/api/v1/state/settings')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-user-id');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toBe('Authorization,Content-Type,x-user-id');
    expect(preflight.headers['access-control-max-age']).toBe('600');
  });
});

describe('rate limit', () => {
  it('does not count change polling against the request limit', async () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, testEnv().migrationsPath);
    const app = buildApp({ db, env: { ...testEnv(), rateLimit: { windowMs: 60_000, max: 2 } }, dbPath: ':memory:' });
    onTestFinished(async () => {
      await app.closeReceiptUploads();
      db.close();
    });
    for (let poll = 0; poll < 5; poll += 1) {
      expect((await request(app).get('/api/v1/sync/status')).status).toBe(200);
    }
    expect((await request(app).get('/api/v1/state/settings')).status).toBe(200);
    expect((await request(app).get('/api/v1/state/settings')).status).toBe(200);
    expect((await request(app).get('/api/v1/state/settings')).status).toBe(429);
  });
});

describe('body limits', () => {
  it('accepts state documents above 2 MB and keeps 2 MB elsewhere', async () => {
    const { app } = await makeApp();
    const description = 'x'.repeat(3 * 1024 * 1024);
    const large = await request(app).patch('/api/v1/state/expenseTracker').send({
      upsert: { expenses: [{ id: 'exp-large', date: '2025-01-02', amount: 1, description, category: 'OTHER', expenseType: 'WANT', year: 2025, month: 1 }] },
    });
    expect(large.status).toBe(200);
    const elsewhere = await request(app).post('/api/v1/expense-tracker/expenses').send({
      externalId: 'exp-large-2', date: '2025-01-02', amount: 1, description, category: 'OTHER', expenseType: 'WANT',
    });
    expect(elsewhere.status).toBe(413);
    expect(elsewhere.body.error).toEqual({ code: 'payload_too_large', message: 'Request body exceeds the 2 MB limit.' });
  });

  it('rejects state documents above 50 MB', async () => {
    const { app } = await makeApp();
    const res = await request(app).put('/api/v1/state/settings')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ set: { settings: { accountName: 'x'.repeat(51 * 1024 * 1024) } } }));
    expect(res.status).toBe(413);
    expect(res.body.error).toEqual({ code: 'payload_too_large', message: 'Request body exceeds the 50 MB limit.' });
  });
});
