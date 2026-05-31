import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

// Tests for cross-cutting validators in src/http.ts exercised via real routes.

describe('resolveUserId edge cases', () => {
  it('rejects x-user-id="0" with 400 invalid_user', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings').set('x-user-id', '0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_user');
  });

  it('rejects negative x-user-id with 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings').set('x-user-id', '-5');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_user');
  });

  it('rejects non-integer x-user-id with 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings').set('x-user-id', 'abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_user');
  });

  it('rejects fractional x-user-id with 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings').set('x-user-id', '1.5');
    expect(res.status).toBe(400);
  });

  it('accepts valid x-user-id', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/settings').set('x-user-id', '1');
    expect(res.status).toBe(200);
  });
});

describe('parseYearMonth edge cases', () => {
  it('year below range → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/1800/6');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('year above range → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/3000/6');
    expect(res.status).toBe(400);
  });

  it('non-numeric year → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/abc/6');
    expect(res.status).toBe(400);
  });

  it('month=0 → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/2024/0');
    expect(res.status).toBe(400);
  });

  it('month=13 → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/2024/13');
    expect(res.status).toBe(400);
  });
});

describe('parsePagination edge cases', () => {
  it('limit=0 → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/expenses?limit=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('limit > 500 → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/expenses?limit=501');
    expect(res.status).toBe(400);
  });

  it('non-integer limit → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/expenses?limit=abc');
    expect(res.status).toBe(400);
  });

  it('invalid cursor (non-base64) → 400', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/expenses?cursor=!!!notbase64!!!');
    expect(res.status).toBe(400);
  });

  it('valid cursor accepted', async () => {
    const { app } = makeApp();
    const cursor = Buffer.from('0', 'utf8').toString('base64url');
    const res = await request(app).get(`/api/v1/expense-tracker/expenses?cursor=${cursor}`);
    expect(res.status).toBe(200);
  });

  it('limit at max boundary (500) accepted', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/expenses?limit=500');
    expect(res.status).toBe(200);
  });
});

describe('error envelope shape', () => {
  it('400 errors include code + message', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/abc/6');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });

  it('Content-Type is application/json on errors', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/expense-tracker/months/abc/6');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('JSON body parsing', () => {
  it('handles malformed JSON without crashing', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/expense-tracker/expenses')
      .set('Content-Type', 'application/json')
      .send('{ not json ');
    // The fallback error handler returns 500 for body-parser SyntaxError;
    // either 400 or 500 is acceptable — we just need a structured envelope.
    expect([400, 500]).toContain(res.status);
    expect(res.body.error).toHaveProperty('code');
  });
});
