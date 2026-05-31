import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

describe('GET /api/v1/users/me', () => {
  it('returns bootstrap user', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.email).toBe('local@firetools.local');
    expect(typeof res.body.createdAt).toBe('string');
    expect(res.body).toHaveProperty('displayName');
  });

  it('returns 404 when bootstrap user is missing', async () => {
    const { app, db } = makeApp();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
