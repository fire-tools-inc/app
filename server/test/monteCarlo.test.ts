import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const fullRun = {
  numSimulations: 10000,
  stockVolatility: 0.15,
  bondVolatility: 0.05,
  blackSwanProbability: 0.02,
  blackSwanImpact: 0.4,
  successCount: 9500,
  failureCount: 500,
  successRate: 0.95,
  medianYearsToFIRE: 22,
  fixedParameters: { initialSavings: 10000 },
};

describe('POST /api/v1/calculator/monte-carlo/runs', () => {
  it('creates a run', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/calculator/monte-carlo/runs').send(fullRun);
    expect(res.status).toBe(201);
    expect(res.body.successRate).toBe(0.95);
    expect(res.body.numSimulations).toBe(10000);
    expect(typeof res.body.id).toBe('number');
    expect(res.body.fixedParameters).toEqual({ initialSavings: 10000 });
  });

  it('accepts null medianYearsToFIRE', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/calculator/monte-carlo/runs')
      .send({ ...fullRun, medianYearsToFIRE: null });
    expect(res.status).toBe(201);
    expect(res.body.medianYearsToFIRE).toBeNull();
  });

  it('accepts optional logs array', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/calculator/monte-carlo/runs')
      .send({ ...fullRun, logs: [{ level: 'info', msg: 'ok' }] });
    expect(res.status).toBe(201);
    expect(res.body.logs).toEqual([{ level: 'info', msg: 'ok' }]);
  });

  it('rejects missing required field', async () => {
    const { app } = makeApp();
    const { numSimulations: _omit, ...partial } = fullRun;
    const res = await request(app).post('/api/v1/calculator/monte-carlo/runs').send(partial);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
    expect(res.body.error.message).toContain('numSimulations');
  });
});

describe('GET /api/v1/calculator/monte-carlo/runs', () => {
  it('returns empty paginated list', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/calculator/monte-carlo/runs');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('paginates with limit and cursor', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/calculator/monte-carlo/runs').send(fullRun);
    }
    const first = await request(app).get('/api/v1/calculator/monte-carlo/runs?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBe(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await request(app).get(
      `/api/v1/calculator/monte-carlo/runs?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items.length).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('rejects limit over 500', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/calculator/monte-carlo/runs?limit=501');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });
});

describe('GET /api/v1/calculator/monte-carlo/runs/:id', () => {
  it('returns the run', async () => {
    const { app } = makeApp();
    const create = await request(app).post('/api/v1/calculator/monte-carlo/runs').send(fullRun);
    const res = await request(app).get(`/api/v1/calculator/monte-carlo/runs/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
    expect(res.body.successRate).toBe(0.95);
  });

  it('returns 404 for unknown id', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/calculator/monte-carlo/runs/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('rejects non-positive id', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/calculator/monte-carlo/runs/0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });
});

describe('DELETE /api/v1/calculator/monte-carlo/runs/:id', () => {
  it('deletes a run', async () => {
    const { app } = makeApp();
    const create = await request(app).post('/api/v1/calculator/monte-carlo/runs').send(fullRun);
    const del = await request(app).delete(`/api/v1/calculator/monte-carlo/runs/${create.body.id}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/v1/calculator/monte-carlo/runs/${create.body.id}`);
    expect(after.status).toBe(404);
  });

  it('returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/v1/calculator/monte-carlo/runs/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
