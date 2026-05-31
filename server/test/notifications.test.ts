import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const validNotif = {
  type: 'SYSTEM',
  title: 'Hello',
  message: 'World',
};

describe('POST /api/v1/notifications', () => {
  it('creates a notification with defaults', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/notifications').send(validNotif);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('SYSTEM');
    expect(res.body.priority).toBe('MEDIUM');
    expect(res.body.read).toBe(false);
    expect(res.body.externalId).toMatch(/^notif-/);
    expect(res.body.id).toBeGreaterThan(0);
  });

  it('uses provided externalId and priority', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({ ...validNotif, externalId: 'ext-1', priority: 'HIGH' });
    expect(res.status).toBe(201);
    expect(res.body.externalId).toBe('ext-1');
    expect(res.body.priority).toBe('HIGH');
  });

  it('returns 409 on duplicate externalId', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'dup' });
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({ ...validNotif, externalId: 'dup' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('rejects missing fields', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/notifications').send({ type: 'SYSTEM' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
  });

  it('rejects invalid type', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({ ...validNotif, type: 'BOGUS' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid type');
  });

  it('rejects invalid priority', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/notifications')
      .send({ ...validNotif, priority: 'URGENT' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid priority');
  });
});

describe('GET /api/v1/notifications', () => {
  it('returns empty', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('lists ordered by timestamp desc', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, title: 'A' });
    await request(app).post('/api/v1/notifications').send({ ...validNotif, title: 'B' });
    const res = await request(app).get('/api/v1/notifications');
    expect(res.body.items.length).toBe(2);
  });

  it('filters by unreadOnly', async () => {
    const { app } = makeApp();
    const c1 = await request(app)
      .post('/api/v1/notifications')
      .send({ ...validNotif, externalId: 'a' });
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'b' });
    await request(app).patch(`/api/v1/notifications/${c1.body.externalId}`).send({ read: true });
    const res = await request(app).get('/api/v1/notifications?unreadOnly=true');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].externalId).toBe('b');
  });

  it('paginates', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/notifications')
        .send({ ...validNotif, externalId: `p${i}` });
    }
    const first = await request(app).get('/api/v1/notifications?limit=2');
    expect(first.body.items.length).toBe(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await request(app).get(
      `/api/v1/notifications?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items.length).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });
});

describe('GET/PATCH/DELETE /api/v1/notifications/:externalId', () => {
  it('gets a notification by externalId', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'g1' });
    const res = await request(app).get('/api/v1/notifications/g1');
    expect(res.status).toBe(200);
    expect(res.body.externalId).toBe('g1');
  });

  it('returns 404 for unknown', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/notifications/missing');
    expect(res.status).toBe(404);
  });

  it('marks read via patch', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'p1' });
    const res = await request(app).patch('/api/v1/notifications/p1').send({ read: true });
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
  });

  it('rejects non-boolean read', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'p2' });
    const res = await request(app).patch('/api/v1/notifications/p2').send({ read: 'yes' });
    expect(res.status).toBe(400);
  });

  it('deletes a notification', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'd1' });
    const del = await request(app).delete('/api/v1/notifications/d1');
    expect(del.status).toBe(204);
    const get = await request(app).get('/api/v1/notifications/d1');
    expect(get.status).toBe(404);
  });
});

describe('POST /api/v1/notifications/mark-all-read', () => {
  it('marks all unread as read', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'm1' });
    await request(app).post('/api/v1/notifications').send({ ...validNotif, externalId: 'm2' });
    const res = await request(app).post('/api/v1/notifications/mark-all-read');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    const list = await request(app).get('/api/v1/notifications?unreadOnly=true');
    expect(list.body.items.length).toBe(0);
  });
});
