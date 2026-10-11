import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { expectDiagnostic } from '../../tests/shared/diagnostics.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYioAAAAASUVORK5CYII=', 'base64');
afterEach(() => {
  vi.restoreAllMocks();
});

function upload(app: Parameters<typeof request>[0], name = 'synthetic-receipt.png') {
  return request(app).post(`/api/v1/receipts?fileName=${encodeURIComponent(name)}`).set('Content-Type', 'image/png').send(png);
}

describe('receipt retention', () => {
  it('stores original bytes, lists metadata and makes upload retries idempotent', async () => {
    const { app, db } = await makeApp();
    const created = await upload(app);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ fileName: 'synthetic-receipt.png', mimeType: 'image/png', status: 'pending', byteLength: png.length });
    const retry = await upload(app);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(created.body.id);
    const list = await request(app).get('/api/v1/receipts');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).not.toHaveProperty('content');
    const content = await request(app).get(`/api/v1/receipts/${created.body.id}/content`);
    expect(content.headers['content-type']).toContain('image/png');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.body).toEqual(png);
    expect(db.prepare('SELECT count(*) AS count FROM expense_entries').get()).toEqual({ count: 0 });
  });

  it('keeps receipts after review and deletes only on explicit request', async () => {
    const { app } = await makeApp();
    const created = await upload(app);
    const reviewed = await request(app).patch(`/api/v1/receipts/${created.body.id}`).send({ status: 'reviewed' });
    expect(reviewed.status).toBe(200);
    expect((await request(app).get('/api/v1/receipts?status=pending')).body.items).toHaveLength(0);
    expect((await request(app).get('/api/v1/receipts?status=reviewed')).body.items).toHaveLength(1);
    expect((await request(app).get(`/api/v1/receipts/${created.body.id}/content`)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/receipts/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/receipts/${created.body.id}/content`)).status).toBe(404);
  });

  it('rejects spoofed images, paths, empty bytes and unsupported formats without saving', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/api/v1/receipts?fileName=a.png').set('Content-Type', 'image/png').send(Buffer.from('not an image'))).status).toBe(400);
    expect((await upload(app, '../receipt.png')).status).toBe(400);
    expect((await request(app).post('/api/v1/receipts?fileName=a.png').set('Content-Type', 'image/png').send(Buffer.alloc(0))).status).toBe(400);
    expect((await request(app).post('/api/v1/receipts?fileName=a.svg').set('Content-Type', 'image/svg+xml').send('<svg/>')).status).toBe(415);
    expect((await request(app).get('/api/v1/receipts')).body.items).toHaveLength(0);
  });

  it('retains existing receipts if a new insertion fails', async () => {
    const { app, db } = await makeApp();
    const created = await upload(app);
    db.exec("CREATE TRIGGER fail_receipt_insert BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL, 'synthetic write failure'); END");
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]);
    const failed = await request(app).post('/api/v1/receipts?fileName=b.jpg').set('Content-Type', 'image/jpeg').send(jpeg);
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('internal_error');
    expect((await request(app).get(`/api/v1/receipts/${created.body.id}/content`)).body).toEqual(png);
    expectDiagnostic('error', 'synthetic write failure');
  });

  it('scopes listing, content, review and deletion by user', async () => {
    const { app, db } = await makeApp();
    db.prepare("INSERT INTO users (id, email) VALUES (2, 'synthetic-two@example.test')").run();
    const created = await upload(app);
    expect((await request(app).get('/api/v1/receipts').set('x-user-id', '2')).body.items).toHaveLength(0);
    expect((await request(app).get(`/api/v1/receipts/${created.body.id}/content`).set('x-user-id', '2')).status).toBe(404);
    expect((await request(app).patch(`/api/v1/receipts/${created.body.id}`).set('x-user-id', '2').send({ status: 'reviewed' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/receipts/${created.body.id}`).set('x-user-id', '2')).status).toBe(404);
  });

  it('reset deletes only that user’s original receipts without deleting financial entries or another user’s receipts', async () => {
    const { app, db } = await makeApp();
    db.prepare("INSERT INTO users (id, email) VALUES (2, 'synthetic-two@example.test')").run();
    await upload(app);
    await request(app).post('/api/v1/receipts?fileName=receipt.png').set('x-user-id', '2').set('Content-Type', 'image/png').send(png);
    expect((await request(app).delete('/api/v1/receipts')).status).toBe(204);
    expect((await request(app).get('/api/v1/receipts')).body.items).toHaveLength(0);
    expect((await request(app).get('/api/v1/receipts').set('x-user-id', '2')).body.items).toHaveLength(1);
  });
});

describe('isolated phone upload pairing', () => {
  it('includes a configured private Wi-Fi host origin for published container ports', async () => {
    const { app } = await makeApp();
    const response = await request(app).post('/api/v1/receipt-pairings').send({ port: 0, publicUrl: 'http://192.168.10.20:8790' });
    expect(response.status).toBe(201);
    expect(response.body.urls.some((url: string) => url.startsWith('http://192.168.10.20:8790/receipt-upload#'))).toBe(true);
  });

  it('rejects oversized photos with the binary limit envelope and retains the inbox', async () => {
    const { app } = await makeApp();
    const response = await request(app).post('/api/v1/receipts?fileName=synthetic.png').set('Content-Type', 'image/png')
      .send(Buffer.alloc(10 * 1024 * 1024 + 1, 0));
    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({ code: 'payload_too_large', message: 'The document exceeds the 10 MB limit.' });
    expect((await request(app).get('/api/v1/receipts')).body.items).toHaveLength(0);
  });

  it('offers a camera page, accepts only token-authorized uploads and exposes no financial API', async () => {
    const { app, db } = await makeApp();
    db.prepare("INSERT INTO users (id, email) VALUES (2, 'synthetic-two@example.test')").run();
    const paired = await request(app).post('/api/v1/receipt-pairings').send({ port: 0, language: 'en' });
    expect(paired.status).toBe(201);
    const url = new URL(paired.body.urls[0]);
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    expect(token).toBeTruthy();
    const phone = request(url.origin);
    const page = await phone.get('/receipt-upload');
    expect(page.status).toBe(200);
    expect(page.text).toContain('capture="environment"');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect((await phone.get('/api/v1/settings')).status).toBe(404);
    expect((await phone.post('/receipts?fileName=receipt.png').set('Content-Type', 'image/png').send(png)).status).toBe(401);
    const accepted = await phone.post('/receipts?fileName=receipt.png')
      .set('Authorization', `Bearer ${token}`).set('x-user-id', '2').set('Content-Type', 'image/png').send(png);
    expect(accepted.status).toBe(201);
    expect((await request(app).get('/api/v1/receipts')).body.items).toHaveLength(1);
    expect((await request(app).get('/api/v1/receipts').set('x-user-id', '2')).body.items).toHaveLength(0);
    expect((await request(app).delete(`/api/v1/receipt-pairings/${paired.body.id}`).set('x-user-id', '2')).status).toBe(404);
    expect((await request(app).delete(`/api/v1/receipt-pairings/${paired.body.id}`)).status).toBe(204);
    await expect(fetch(`${url.origin}/receipt-upload`)).rejects.toThrow();
  });

  it('supports a user-provided HTTPS tunnel origin without exposing the normal server', async () => {
    const { app } = await makeApp();
    const paired = await request(app).post('/api/v1/receipt-pairings')
      .send({ port: 0, publicUrl: 'https://receipts.example.test', language: 'it' });
    expect(paired.status).toBe(201);
    const tunneled = paired.body.urls.find((value: string) => value.startsWith('https://receipts.example.test/'));
    expect(new URL(tunneled).pathname).toBe('/receipt-upload');
    expect(new URLSearchParams(new URL(tunneled).hash.slice(1)).get('lang')).toBe('it');
    expect(paired.body.port).toBeGreaterThan(0);
  });

  it.each(['http://public.example.test', 'https://user:secret@example.test', 'https://example.test/private/path'])(
    'rejects unsafe or ambiguous tunnel origin %s before opening a listener', async publicUrl => {
      const { app } = await makeApp();
      const result = await request(app).post('/api/v1/receipt-pairings').send({ publicUrl, port: 0 });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('invalid_body');
    },
  );

  it('rejects expired pairing tokens while preserving received receipts', async () => {
    const { app } = await makeApp();
    const paired = await request(app).post('/api/v1/receipt-pairings').send({ port: 0 });
    const url = new URL(paired.body.urls[0]);
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    vi.spyOn(Date, 'now').mockReturnValue(new Date(paired.body.expiresAt).getTime() + 1);
    const expired = await request(url.origin).post('/receipts?fileName=receipt.png')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(png);
    expect(expired.status).toBe(401);
    expect((await request(app).get('/api/v1/receipts')).body.items).toHaveLength(0);
  });
});
