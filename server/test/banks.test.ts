import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const seedBanks = (db: import('better-sqlite3').Database) => {
  const stmt = db.prepare(
    `INSERT INTO banks (code, name, country_code, supports_open_banking, bic, institution_type, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  stmt.run('ITALPHA', 'Alpha IT', 'IT', 1, 'ALPHAITMM', 'BANK', null);
  stmt.run('ITBETA', 'Beta IT', 'IT', 0, null, 'BANK', null);
  stmt.run('FRGAMMA', 'Gamma FR', 'FR', 1, null, 'NEOBANK', null);
};

describe('GET /api/v1/banks', () => {
  it('returns empty array when no banks', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/banks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns seeded banks sorted by name', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    expect(res.body[0].name).toBe('Alpha IT');
    expect(res.body[0].code).toBe('ITALPHA');
    expect(res.body[0].supportsOpenBanking).toBe(true);
  });

  it('filters by countryCode', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks?countryCode=IT');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body.every((b: { countryCode: string }) => b.countryCode === 'IT')).toBe(true);
  });

  it('filters by supportsOpenBanking=true', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks?supportsOpenBanking=true');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body.every((b: { supportsOpenBanking: boolean }) => b.supportsOpenBanking)).toBe(true);
  });

  it('filters by supportsOpenBanking=false', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks?supportsOpenBanking=false');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].code).toBe('ITBETA');
  });

  it('combines filters', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks?countryCode=FR&supportsOpenBanking=true');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].code).toBe('FRGAMMA');
  });

  it('ignores invalid supportsOpenBanking value', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks?supportsOpenBanking=maybe');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });
});

describe('GET /api/v1/banks/:code', () => {
  it('returns single bank', async () => {
    const { app, db } = makeApp();
    seedBanks(db);
    const res = await request(app).get('/api/v1/banks/ITALPHA');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ITALPHA');
    expect(res.body.bic).toBe('ALPHAITMM');
  });

  it('returns 404 for unknown code', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/banks/NOPE');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
