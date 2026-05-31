import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

describe('GET /api/v1/ui-preferences', () => {
  it('returns empty preferences object', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/ui-preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ preferences: {} });
  });
});

describe('PUT /api/v1/ui-preferences/:key', () => {
  it('creates a preference', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/ui-preferences/theme').send({ value: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('theme');
    expect(res.body.value).toBe('dark');
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('upserts existing preference', async () => {
    const { app } = makeApp();
    await request(app).put('/api/v1/ui-preferences/theme').send({ value: 'dark' });
    const res = await request(app).put('/api/v1/ui-preferences/theme').send({ value: 'light' });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('light');
  });

  it('rejects key starting with digit', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/ui-preferences/1invalid').send({ value: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('rejects key with invalid chars', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/ui-preferences/bad%20key').send({ value: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('rejects non-string value', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/ui-preferences/theme').send({ value: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects value over 8KB', async () => {
    const { app } = makeApp();
    const huge = 'a'.repeat(8 * 1024 + 1);
    const res = await request(app).put('/api/v1/ui-preferences/theme').send({ value: huge });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('accepts value at exactly 8KB', async () => {
    const { app } = makeApp();
    const exact = 'a'.repeat(8 * 1024);
    const res = await request(app).put('/api/v1/ui-preferences/edge').send({ value: exact });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/ui-preferences/:key', () => {
  it('returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/ui-preferences/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects invalid key in GET', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/ui-preferences/1nope');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });
});

describe('DELETE /api/v1/ui-preferences/:key', () => {
  it('returns 204 on success', async () => {
    const { app } = makeApp();
    await request(app).put('/api/v1/ui-preferences/theme').send({ value: 'dark' });
    const res = await request(app).delete('/api/v1/ui-preferences/theme');
    expect(res.status).toBe(204);
  });

  it('returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/v1/ui-preferences/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('multi-user ui-preferences isolation', () => {
  it('separates by x-user-id', async () => {
    const { app, db } = makeApp();
    db.prepare("INSERT INTO users (id, email, created_at) VALUES (2, 'u2@x', '2024-01-01T00:00:00Z')").run();
    await request(app).put('/api/v1/ui-preferences/k').send({ value: '1' });
    await request(app).put('/api/v1/ui-preferences/k').set('x-user-id', '2').send({ value: '2' });
    const r1 = await request(app).get('/api/v1/ui-preferences/k');
    const r2 = await request(app).get('/api/v1/ui-preferences/k').set('x-user-id', '2');
    expect(r1.body.value).toBe('1');
    expect(r2.body.value).toBe('2');
  });
});
