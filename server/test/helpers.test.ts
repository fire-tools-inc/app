import { Server } from 'node:http';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeApp, makeFileApp, makeAppWithTmpDb } from './helpers.js';

describe('HTTP test fixtures', () => {
  it.each([
    ['in-memory', makeApp],
    ['encrypted-file', makeFileApp],
    ['settings-file', makeAppWithTmpDb],
  ] as const)('binds the %s fixture to IPv4 loopback before accepting requests', async (_name, create) => {
    const fixture = await create();
    expect(fixture.app).toBeInstanceOf(Server);
    if (!(fixture.app instanceof Server)) throw new Error('Expected a listening HTTP server');
    const address = fixture.app.address();
    if (!address || typeof address === 'string') throw new Error('Expected an IP listener');
    expect(address.address).toBe('127.0.0.1');
    expect(address.family).toBe('IPv4');

    const health = await request(fixture.app).get('/api/v1/health');
    expect(health.status).toBe(200);
    const invalid = await request(fixture.app).post('/api/v1/notifications').send({});
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('invalid_body');
    expect(fixture.app.address()).toEqual(address);
  });

  it('closes the listener and database and removes temporary files, even when called twice', async () => {
    const fixture = await makeAppWithTmpDb();
    expect(existsSync(fixture.dir)).toBe(true);
    await fixture.cleanup();
    await fixture.cleanup();
    expect(fixture.app.listening).toBe(false);
    expect(fixture.db.open).toBe(false);
    expect(existsSync(fixture.dir)).toBe(false);
  });
});
