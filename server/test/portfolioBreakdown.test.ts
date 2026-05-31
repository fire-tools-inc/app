import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const stockAsset = {
  externalId: 'sa-1',
  name: 'Vanguard SP500',
  ticker: 'VOO',
  assetClass: 'STOCKS',
  subAssetType: 'ETF',
  currentValue: 1000,
  targetMode: 'PERCENTAGE',
  originalCurrency: 'USD',
};

const cashAsset = {
  externalId: 'sa-2',
  name: 'EUR cash',
  ticker: '',
  assetClass: 'CASH',
  subAssetType: 'SAVINGS_ACCOUNT',
  currentValue: 500,
  targetMode: 'OFF',
  originalCurrency: 'EUR',
};

describe('PUT/GET /api/v1/portfolio-breakdown/metadata/:ticker', () => {
  it('upserts and reads metadata', async () => {
    const { app } = makeApp();
    const put = await request(app).put('/api/v1/portfolio-breakdown/metadata/VOO').send({
      longName: 'Vanguard 500',
      currency: 'USD',
      exchange: 'NYSE',
      sector: 'Diversified',
      country: 'United States',
      fundFamily: 'Vanguard',
      sectorWeightings: [
        { sector: 'Tech', weight: 0.3 },
        { sector: 'Health', weight: 0.7 },
      ],
      regionWeightings: [{ region: 'North America', weight: 1.0 }],
    });
    expect(put.status).toBe(200);
    expect(put.body.ticker).toBe('VOO');
    expect(put.body.sectorWeightings.length).toBe(2);

    const get = await request(app).get('/api/v1/portfolio-breakdown/metadata/VOO');
    expect(get.status).toBe(200);
    expect(get.body.longName).toBe('Vanguard 500');
    expect(get.body.regionWeightings[0].region).toBe('North America');
  });

  it('GET returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/portfolio-breakdown/metadata/MISSING');
    expect(res.status).toBe(404);
  });

  it('PUT updates same ticker (upsert)', async () => {
    const { app } = makeApp();
    await request(app).put('/api/v1/portfolio-breakdown/metadata/AAA').send({ longName: 'v1' });
    const res = await request(app).put('/api/v1/portfolio-breakdown/metadata/AAA').send({ longName: 'v2' });
    expect(res.body.longName).toBe('v2');
  });
});

describe('GET /api/v1/portfolio-breakdown', () => {
  it('requires dimension', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/portfolio-breakdown');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_param');
  });

  it('rejects unknown dimension', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/portfolio-breakdown?dimension=galaxy');
    expect(res.status).toBe(400);
  });

  it('returns currency breakdown', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(stockAsset);
    await request(app).post('/api/v1/asset-allocation/assets').send(cashAsset);
    const res = await request(app).get('/api/v1/portfolio-breakdown?dimension=currency');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const [out] = res.body;
    expect(out.dimension).toBe('currency');
    expect(out.totalValue).toBe(1500);
    const labels = out.entries.map((e: { label: string }) => e.label).sort();
    expect(labels).toEqual(['EUR', 'USD']);
  });

  it('accepts multiple dimensions', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(stockAsset);
    const res = await request(app).get(
      '/api/v1/portfolio-breakdown?dimension=currency&dimension=holding',
    );
    expect(res.body.length).toBe(2);
    expect(res.body[0].dimension).toBe('currency');
    expect(res.body[1].dimension).toBe('holding');
  });

  it('counts assets without metadata as unknownValue for sector', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(stockAsset);
    const res = await request(app).get('/api/v1/portfolio-breakdown?dimension=sector');
    expect(res.body[0].unknownValue).toBe(1000);
  });

  it('applies sector weightings from metadata', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(stockAsset);
    await request(app).put('/api/v1/portfolio-breakdown/metadata/VOO').send({
      sectorWeightings: [
        { sector: 'Tech', weight: 0.6 },
        { sector: 'Health', weight: 0.4 },
      ],
    });
    const res = await request(app).get('/api/v1/portfolio-breakdown?dimension=sector');
    const entries = res.body[0].entries;
    const tech = entries.find((e: { label: string }) => e.label === 'Tech');
    const health = entries.find((e: { label: string }) => e.label === 'Health');
    expect(tech.value).toBeCloseTo(600);
    expect(health.value).toBeCloseTo(400);
    expect(res.body[0].unknownValue).toBe(0);
  });
});
