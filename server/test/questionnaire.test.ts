import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const fullPayload = {
  persona: 'REGULAR_FIRE',
  personaExplanation: 'A balanced FIRE seeker',
  safeWithdrawalRate: 4,
  suggestedSavingsRate: 50,
  assetAllocation: { stocks: 70, bonds: 25, cash: 5 },
  suitableAssets: ['ETF', 'BONDS'],
  riskTolerance: 'moderate',
  responses: [{ q: 'age', a: 30 }],
};

describe('POST /api/v1/questionnaire/results', () => {
  it('stores a result', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/questionnaire/results').send(fullPayload);
    expect(res.status).toBe(201);
    expect(res.body.persona).toBe('REGULAR_FIRE');
    expect(res.body.assetAllocation.stocks).toBe(70);
    expect(typeof res.body.id).toBe('number');
  });

  it('accepts optional crypto and realEstate allocations', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/questionnaire/results')
      .send({
        ...fullPayload,
        assetAllocation: { stocks: 60, bonds: 20, cash: 5, crypto: 10, realEstate: 5 },
      });
    expect(res.status).toBe(201);
    expect(res.body.assetAllocation.crypto).toBe(10);
    expect(res.body.assetAllocation.realEstate).toBe(5);
  });

  it('rejects invalid persona', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/questionnaire/results')
      .send({ ...fullPayload, persona: 'WEIRD_FIRE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects invalid riskTolerance', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/questionnaire/results')
      .send({ ...fullPayload, riskTolerance: 'YOLO' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects missing required field', async () => {
    const { app } = makeApp();
    const { persona: _omit, ...partial } = fullPayload;
    const res = await request(app).post('/api/v1/questionnaire/results').send(partial);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects non-numeric allocation values', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/questionnaire/results')
      .send({ ...fullPayload, assetAllocation: { stocks: 'a lot', bonds: 25, cash: 5 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });
});

describe('GET /api/v1/questionnaire/results', () => {
  it('returns empty array initially', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/questionnaire/results');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns array of results', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/questionnaire/results').send(fullPayload);
    await request(app).post('/api/v1/questionnaire/results').send({ ...fullPayload, persona: 'LEAN_FIRE' });
    const res = await request(app).get('/api/v1/questionnaire/results');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });
});

describe('GET /api/v1/questionnaire/results/latest', () => {
  it('returns 404 when no results', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/questionnaire/results/latest');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('returns most recent result', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/questionnaire/results').send(fullPayload);
    await request(app).post('/api/v1/questionnaire/results').send({ ...fullPayload, persona: 'FAT_FIRE' });
    const res = await request(app).get('/api/v1/questionnaire/results/latest');
    expect(res.status).toBe(200);
    expect(res.body.persona).toBe('FAT_FIRE');
  });
});
