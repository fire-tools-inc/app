import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const validSettings = {
  accountName: 'Alice',
  decimalSeparator: '.',
  decimalPlaces: 2,
  currencySettings: {
    defaultCurrency: 'EUR',
    fallbackRates: { USD: 1.1 },
    useApiRates: true,
    lastApiUpdate: null,
  },
  privacyMode: false,
  dateFormat: 'YYYY-MM-DD',
  fireAssetClassInclusion: { STOCKS: true },
  includePrimaryResidenceInFIRE: false,
  searchThreshold: 0.4,
  experimentalFeatures: { foo: true },
};

const validNotifPref = {
  enableInAppNotifications: true,
  newMonthReminders: true,
  newQuarterReminders: false,
  taxReminders: true,
  dcaReminders: false,
  portfolioAlerts: true,
  fireMilestones: true,
  enableEmailNotifications: false,
  emailAddress: 'a@b.com',
  emailFrequency: 'DAILY',
  taxReminderMonths: [3, 6, 9, 12],
  taxReminderDaysBefore: 7,
};

describe('GET /api/v1/settings', () => {
  it('auto-creates and returns default settings', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accountName');
    expect(res.body).toHaveProperty('decimalSeparator');
    expect(res.body).toHaveProperty('currencySettings');
    expect(res.body.currencySettings).toHaveProperty('defaultCurrency');
    expect(typeof res.body.privacyMode).toBe('boolean');
    expect(typeof res.body.includePrimaryResidenceInFIRE).toBe('boolean');
  });
});

describe('PUT /api/v1/settings', () => {
  it('replaces all settings fields', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/settings').send(validSettings);
    expect(res.status).toBe(200);
    expect(res.body.accountName).toBe('Alice');
    expect(res.body.decimalSeparator).toBe('.');
    expect(res.body.privacyMode).toBe(false);
    expect(res.body.currencySettings.defaultCurrency).toBe('EUR');
    expect(res.body.fireAssetClassInclusion).toEqual({ STOCKS: true });
  });

  it('rejects missing required field', async () => {
    const { app } = makeApp();
    const { decimalSeparator: _x, ...partial } = validSettings;
    const res = await request(app).put('/api/v1/settings').send(partial);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
    expect(res.body.error.message).toContain('decimalSeparator');
  });
});

describe('PATCH /api/v1/settings', () => {
  it('applies partial updates', async () => {
    const { app } = makeApp();
    const res = await request(app).patch('/api/v1/settings').send({ accountName: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.accountName).toBe('Bob');
  });

  it('ignores invalid decimalSeparator silently', async () => {
    const { app } = makeApp();
    const res = await request(app).patch('/api/v1/settings').send({ decimalSeparator: 'X' });
    expect(res.status).toBe(200);
    expect(res.body.decimalSeparator).not.toBe('X');
  });

  it('clears llmCategorization when set to null', async () => {
    const { app } = makeApp();
    await request(app)
      .patch('/api/v1/settings')
      .send({
        llmCategorization: { baseUrl: 'http://x', apiKey: 'k', model: 'm' },
      });
    const before = await request(app).get('/api/v1/settings');
    expect(before.body.llmCategorization).toBeDefined();
    await request(app).patch('/api/v1/settings').send({ llmCategorization: null });
    const after = await request(app).get('/api/v1/settings');
    expect(after.body.llmCategorization).toBeUndefined();
  });
});

describe('GET /api/v1/settings/notifications', () => {
  it('returns defaults', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enableInAppNotifications');
    expect(res.body).toHaveProperty('taxReminderMonths');
    expect(Array.isArray(res.body.taxReminderMonths)).toBe(true);
  });
});

describe('PUT /api/v1/settings/notifications', () => {
  it('replaces all fields', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/settings/notifications').send(validNotifPref);
    expect(res.status).toBe(200);
    expect(res.body.emailAddress).toBe('a@b.com');
    expect(res.body.taxReminderMonths).toEqual([3, 6, 9, 12]);
  });

  it('rejects missing required field', async () => {
    const { app } = makeApp();
    const { emailAddress: _x, ...partial } = validNotifPref;
    const res = await request(app).put('/api/v1/settings/notifications').send(partial);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });
});

describe('settings multi-user isolation', () => {
  it('keeps settings separate per x-user-id', async () => {
    const { app, db } = makeApp();
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (2, 'two@x', '2024-01-01T00:00:00Z')",
    ).run();
    await request(app)
      .patch('/api/v1/settings')
      .set('x-user-id', '1')
      .send({ accountName: 'OneName' });
    await request(app)
      .patch('/api/v1/settings')
      .set('x-user-id', '2')
      .send({ accountName: 'TwoName' });
    const u1 = await request(app).get('/api/v1/settings').set('x-user-id', '1');
    const u2 = await request(app).get('/api/v1/settings').set('x-user-id', '2');
    expect(u1.body.accountName).toBe('OneName');
    expect(u2.body.accountName).toBe('TwoName');
  });
});
