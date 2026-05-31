import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

describe('GET /api/v1/health', () => {
  it('returns ok shape with db driver and path', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database.driver).toBe('sqlite');
    expect(res.body.database.path).toBe(':memory:');
    expect(res.body.database.ok).toBe(true);
    expect(typeof res.body.version).toBe('string');
  });

  it('returns 503 when database is closed', async () => {
    const { app, db } = makeApp();
    db.close();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
    expect(res.body.error.code).toBe('database_unavailable');
  });
});
