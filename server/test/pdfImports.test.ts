import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const validDraft = {
  id: 'd-1',
  kind: 'expense',
  date: '2024-03-15T00:00:00Z',
  amount: 12.5,
  description: 'Coffee',
  docType: 'receipt',
  sourceFile: 'receipt.pdf',
  include: true,
  confidence: 0.9,
  suggestedCategory: 'FOOD',
  suggestedExpenseType: 'WANT',
  currency: 'EUR',
};

const validImport = {
  sourceFile: 'receipt.pdf',
  docType: 'receipt',
  drafts: [validDraft],
};

describe('POST /api/v1/pdf-imports', () => {
  it('creates import with pending status', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/pdf-imports').send(validImport);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.drafts.length).toBe(1);
    expect(res.body.drafts[0].id).toBe('d-1');
  });

  it('rejects missing required field', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/pdf-imports').send({ sourceFile: 'a.pdf' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid docType', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/pdf-imports')
      .send({ ...validImport, docType: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('rejects drafts not array', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/pdf-imports')
      .send({ ...validImport, drafts: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('rejects draft missing field', async () => {
    const { app } = makeApp();
    const { id: _omit, ...bad } = validDraft;
    const res = await request(app)
      .post('/api/v1/pdf-imports')
      .send({ ...validImport, drafts: [bad] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('drafts[0]');
  });

  it('rejects draft invalid kind', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/pdf-imports')
      .send({ ...validImport, drafts: [{ ...validDraft, kind: 'weird' }] });
    expect(res.status).toBe(400);
  });

  it('rejects draft invalid docType', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/pdf-imports')
      .send({ ...validImport, drafts: [{ ...validDraft, docType: 'auto' }] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/pdf-imports', () => {
  it('lists imports paginated', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/pdf-imports').send(validImport);
    await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app).get('/api/v1/pdf-imports');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
  });

  it('filters by status', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/pdf-imports').send(validImport);
    const list = await request(app).get('/api/v1/pdf-imports?status=pending');
    expect(list.body.items.length).toBe(1);
    const empty = await request(app).get('/api/v1/pdf-imports?status=committed');
    expect(empty.body.items.length).toBe(0);
  });

  it('rejects invalid status filter', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/pdf-imports?status=weird');
    expect(res.status).toBe(400);
  });
});

describe('GET/PATCH/DELETE /api/v1/pdf-imports/:id', () => {
  it('GET by id', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app).get(`/api/v1/pdf-imports/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('GET 404 missing', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/pdf-imports/9999');
    expect(res.status).toBe(404);
  });

  it('PATCH updates status', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app)
      .patch(`/api/v1/pdf-imports/${created.body.id}`)
      .send({ status: 'reviewed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reviewed');
  });

  it('PATCH rejects invalid status', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app)
      .patch(`/api/v1/pdf-imports/${created.body.id}`)
      .send({ status: 'wat' });
    expect(res.status).toBe(400);
  });

  it('PATCH updates drafts', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app)
      .patch(`/api/v1/pdf-imports/${created.body.id}`)
      .send({ drafts: [{ ...validDraft, id: 'd-99', description: 'New' }] });
    expect(res.status).toBe(200);
    expect(res.body.drafts[0].id).toBe('d-99');
  });

  it('DELETE removes import', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const del = await request(app).delete(`/api/v1/pdf-imports/${created.body.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/v1/pdf-imports/${created.body.id}`);
    expect(get.status).toBe(404);
  });
});

describe('POST /api/v1/pdf-imports/:id/commit', () => {
  it('commits drafts to expense entries', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    const res = await request(app).post(`/api/v1/pdf-imports/${created.body.id}/commit`);
    expect(res.status).toBe(200);
    expect(res.body.importedExpenses).toBe(1);
    expect(res.body.importedIncomes).toBe(0);
    const reread = await request(app).get(`/api/v1/pdf-imports/${created.body.id}`);
    expect(reread.body.status).toBe('committed');
    expect(reread.body.committedAt).not.toBeNull();
  });

  it('commits income drafts to income entries', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send({
      ...validImport,
      drafts: [
        {
          ...validDraft,
          kind: 'income',
          id: 'i-1',
          suggestedIncomeSource: 'SALARY',
        },
      ],
    });
    const res = await request(app).post(`/api/v1/pdf-imports/${created.body.id}/commit`);
    expect(res.body.importedIncomes).toBe(1);
    expect(res.body.importedExpenses).toBe(0);
  });

  it('skips drafts with include=false', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send({
      ...validImport,
      drafts: [{ ...validDraft, include: false }],
    });
    const res = await request(app).post(`/api/v1/pdf-imports/${created.body.id}/commit`);
    expect(res.body.importedExpenses).toBe(0);
  });

  it('returns 409 if already committed', async () => {
    const { app } = makeApp();
    const created = await request(app).post('/api/v1/pdf-imports').send(validImport);
    await request(app).post(`/api/v1/pdf-imports/${created.body.id}/commit`);
    const res = await request(app).post(`/api/v1/pdf-imports/${created.body.id}/commit`);
    expect(res.status).toBe(409);
  });

  it('returns 404 for missing', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/pdf-imports/9999/commit');
    expect(res.status).toBe(404);
  });
});
