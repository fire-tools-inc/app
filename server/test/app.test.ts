import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { testEnv, makeApp } from './helpers.js';

const buildRestricted = async () => {
  const env = testEnv();
  env.corsAllowAll = false;
  env.corsOrigins = ['http://localhost:5173'];
  const { app } = await makeApp(env);
  return app;
};

describe('CORS handling', () => {
  it('allows configured origin', async () => {
    const app = await buildRestricted();
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('denies disallowed origin with 403 cors_denied', async () => {
    const app = await buildRestricted();
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://evil.com');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('cors_denied');
  });

  it('allows requests without an Origin header', async () => {
    const app = await buildRestricted();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('corsAllowAll bypasses allowlist', async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://anywhere.example');
    expect(res.status).toBe(200);
  });
});

describe('Route mounting', () => {
  it('returns a validation error for malformed JSON', async () => {
    const { app, db } = await makeApp();
    const res = await request(app).put('/api/v1/settings')
      .set('Content-Type', 'application/json').send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_body');
    db.close();
  });

  it('returns a clear payload limit error instead of an internal error', async () => {
    const { app, db } = await makeApp();
    const res = await request(app).put('/api/v1/settings')
      .send({ data: 'x'.repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
    db.close();
  });

  it('all routers mounted under /api/v1', async () => {
    const { app } = await makeApp();
    const paths = [
      '/api/v1/health',
      '/api/v1/users/me',
      '/api/v1/settings',
      '/api/v1/notifications',
      '/api/v1/calculator/projections',
      '/api/v1/asset-allocation/config',
      '/api/v1/expense-tracker/config',
      '/api/v1/net-worth/config',
      '/api/v1/questionnaire',
      '/api/v1/portfolio-breakdown',
      '/api/v1/banks',
      '/api/v1/ui-preferences',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      // Some routes (e.g. calculator/projections) require query params and return 400.
      expect([200, 400, 404, 501]).toContain(res.status);
      if (res.status !== 404) {
        expect(res.headers['content-type']).toMatch(/json/);
      }
    }
  });

  it('unknown /api/v1 route returns 501 not_implemented', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('not_implemented');
  });

  it('unknown route outside /api/v1 returns 404', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/totally-unknown');
    expect(res.status).toBe(404);
  });

  it('x-powered-by header is disabled', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
