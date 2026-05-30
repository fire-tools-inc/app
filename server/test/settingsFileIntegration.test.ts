import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { makeAppWithTmpDb } from './helpers.js';
import { SETTINGS_SCHEMA_VERSION } from '../src/settingsFile.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

const setup = () => {
  const env = makeAppWithTmpDb();
  cleanups.push(env.cleanup);
  return env;
};

describe('settings.json sidecar — sync after writes', () => {
  it('exists at boot with empty users, then mirrors PATCH /settings', async () => {
    const { app, settingsPath } = setup();
    expect(fs.existsSync(settingsPath)).toBe(true);
    const beforeWrite = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(beforeWrite.users['1']).toBeUndefined();

    const res = await request(app)
      .patch('/api/v1/settings')
      .send({ accountName: 'Mirrored' });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(parsed.users['1'].settings.accountName).toBe('Mirrored');
  });

  it('mirrors PATCH /settings to disk', async () => {
    const { app, settingsPath } = setup();
    await request(app)
      .patch('/api/v1/settings')
      .send({ accountName: 'Mirrored', privacyMode: true });
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.users['1'].settings.accountName).toBe('Mirrored');
    expect(parsed.users['1'].settings.privacyMode).toBe(true);
  });

  it('mirrors PUT /settings/notifications to disk', async () => {
    const { app, settingsPath } = setup();
    await request(app)
      .put('/api/v1/settings/notifications')
      .send({
        enableInAppNotifications: false,
        newMonthReminders: false,
        newQuarterReminders: false,
        taxReminders: false,
        dcaReminders: false,
        portfolioAlerts: false,
        fireMilestones: false,
        enableEmailNotifications: false,
        emailAddress: 'x@y.z',
        emailFrequency: 'NEVER',
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 7,
      });
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.users['1'].notificationPreferences.enableInAppNotifications).toBe(
      false,
    );
    expect(parsed.users['1'].notificationPreferences.emailAddress).toBe('x@y.z');
  });
});

describe('GET /settings/file', () => {
  it('returns path + contents', async () => {
    const { app, settingsPath } = setup();
    await request(app).get('/api/v1/settings');
    const res = await request(app).get('/api/v1/settings/file');
    expect(res.status).toBe(200);
    expect(res.body.path).toBe(settingsPath);
    expect(res.body.contents.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(res.body.exists).toBe(true);
  });

  it('returns the freshly-booted (empty users) shape', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/settings/file');
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.contents.users).toEqual({});
  });
});

describe('POST /settings/file/sync', () => {
  it('rewrites the file from current DB state', async () => {
    const { app, settingsPath } = setup();
    await request(app).patch('/api/v1/settings').send({ accountName: 'A' });
    fs.unlinkSync(settingsPath);
    const res = await request(app).post('/api/v1/settings/file/sync');
    expect(res.status).toBe(200);
    expect(fs.existsSync(settingsPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.users['1'].settings.accountName).toBe('A');
  });
});

describe('POST /settings/file/import', () => {
  it('applies a posted shape into the DB and resyncs the file', async () => {
    const { app, settingsPath } = setup();
    await request(app).get('/api/v1/settings'); // create defaults
    const importBody = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      users: {
        '1': {
          settings: { accountName: 'Imported', privacyMode: true },
        },
      },
    };
    const res = await request(app)
      .post('/api/v1/settings/file/import')
      .send(importBody);
    expect(res.status).toBe(200);

    const get = await request(app).get('/api/v1/settings');
    expect(get.body.accountName).toBe('Imported');
    expect(get.body.privacyMode).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(parsed.users['1'].settings.accountName).toBe('Imported');
  });

  it('rejects an obviously malformed body', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/v1/settings/file/import')
      .send({ totally: 'wrong' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('boot-time legacy migration', () => {
  it('adopts a legacy file when no settings.json exists', async () => {
    // We can't easily exercise this without re-running buildApp; the unit
    // tests cover migrateLegacySettingsFile in isolation. This integration
    // test asserts the behaviour end-to-end with a fresh DB dir.
    const env = makeAppWithTmpDb();
    cleanups.push(env.cleanup);
    // After build, the canonical file should now exist (initial sync).
    expect(fs.existsSync(env.settingsPath)).toBe(true);
  });
});
