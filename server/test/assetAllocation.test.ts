import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const validAsset = {
  externalId: 'a-1',
  name: 'Acme ETF',
  ticker: 'ACM',
  assetClass: 'STOCKS',
  subAssetType: 'ETF',
  currentValue: 1000,
  targetMode: 'PERCENTAGE',
};

describe('asset-allocation config', () => {
  it('GET returns defaults', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/asset-allocation/config');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('EUR');
    expect(res.body.allowNegativeCash).toBe(false);
    expect(res.body.targetAllocationTolerance).toBe(2);
  });

  it('PUT updates config', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/asset-allocation/config').send({
      currency: 'USD',
      allowNegativeCash: true,
      targetAllocationTolerance: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
    expect(res.body.allowNegativeCash).toBe(true);
    expect(res.body.targetAllocationTolerance).toBe(5);
  });

  it('PUT rejects missing field', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put('/api/v1/asset-allocation/config')
      .send({ currency: 'EUR', allowNegativeCash: false });
    expect(res.status).toBe(400);
  });
});

describe('asset-allocation assets', () => {
  it('GET returns empty', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/asset-allocation/assets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST creates an asset', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    expect(res.status).toBe(201);
    expect(res.body.externalId).toBe('a-1');
    expect(res.body.assetClass).toBe('STOCKS');
    expect(res.body.currentValue).toBe(1000);
  });

  it('POST 409 on dup', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    const res = await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    expect(res.status).toBe(409);
  });

  it('POST rejects missing field', async () => {
    const { app } = makeApp();
    const { name: _x, ...partial } = validAsset;
    const res = await request(app).post('/api/v1/asset-allocation/assets').send(partial);
    expect(res.status).toBe(400);
  });

  it('POST rejects invalid assetClass', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({ ...validAsset, assetClass: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  it('POST rejects invalid subAssetType', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({ ...validAsset, subAssetType: 'NOPE' });
    expect(res.status).toBe(400);
  });

  it('POST rejects invalid targetMode', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({ ...validAsset, targetMode: 'WEIRD' });
    expect(res.status).toBe(400);
  });

  it('POST rejects invalid originalCurrency', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({ ...validAsset, originalCurrency: 'XYZ', originalValue: 100 });
    expect(res.status).toBe(400);
  });

  it('GET filters by assetClass', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({ ...validAsset, externalId: 'a-2', assetClass: 'CASH', subAssetType: 'SAVINGS_ACCOUNT' });
    const stocks = await request(app).get('/api/v1/asset-allocation/assets?assetClass=STOCKS');
    expect(stocks.body.length).toBe(1);
    const cash = await request(app).get('/api/v1/asset-allocation/assets?assetClass=CASH');
    expect(cash.body.length).toBe(1);
  });

  it('GET rejects invalid assetClass param', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/asset-allocation/assets?assetClass=NOPE');
    expect(res.status).toBe(400);
  });

  it('GET by externalId', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    const res = await request(app).get('/api/v1/asset-allocation/assets/a-1');
    expect(res.status).toBe(200);
    expect(res.body.externalId).toBe('a-1');
  });

  it('GET 404 for missing externalId', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/asset-allocation/assets/missing');
    expect(res.status).toBe(404);
  });

  it('PUT replaces (upserts) asset', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    const res = await request(app)
      .put('/api/v1/asset-allocation/assets/a-1')
      .send({ ...validAsset, name: 'Renamed', currentValue: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.currentValue).toBe(2000);
  });

  it('PUT creates if missing', async () => {
    const { app } = makeApp();
    const res = await request(app).put('/api/v1/asset-allocation/assets/new-1').send(validAsset);
    expect(res.status).toBe(200);
    expect(res.body.externalId).toBe('new-1');
  });

  it('POST includes mortgageData', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/asset-allocation/assets')
      .send({
        ...validAsset,
        externalId: 'house-1',
        assetClass: 'REAL_ESTATE',
        subAssetType: 'PROPERTY',
        isPrimaryResidence: true,
        mortgageData: {
          principalAmount: 200000,
          currentBalance: 150000,
          interestRate: 3.5,
          termYears: 30,
          remainingYears: 25,
          monthlyPayment: 1000,
          startDate: '2020-01-01',
          propertyValue: 300000,
          lender: 'Bank',
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.isPrimaryResidence).toBe(true);
    expect(res.body.mortgageData.lender).toBe('Bank');
  });

  it('DELETE removes asset', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/asset-allocation/assets').send(validAsset);
    const del = await request(app).delete('/api/v1/asset-allocation/assets/a-1');
    expect(del.status).toBe(204);
    const get = await request(app).get('/api/v1/asset-allocation/assets/a-1');
    expect(get.status).toBe(404);
  });

  it('DELETE 404 for missing', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/v1/asset-allocation/assets/none');
    expect(res.status).toBe(404);
  });
});
