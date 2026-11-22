import { describe, it, expect, onTestFinished } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { startEmbeddedServer } from '../src/embed.js';

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as AddressInfo;
    probe.close(() => resolve(port));
  });
});

const start = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-tools-embed-'));
  let clientToken: string | null = 'synthetic-client-token';
  const server = await startEmbeddedServer({
    dbPath: path.join(dir, 'synthetic.db'),
    migrationsPath: path.resolve('migrations'),
    apiToken: 'synthetic-app-token',
    secondaryApiToken: () => clientToken,
  });
  onTestFinished(async () => {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { server, revoke: () => { clientToken = null; } };
};

const status = (base: string, token: string) =>
  fetch(`${base}/api/v1/sync/status`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.status);

describe('embedded server public listener', () => {
  it('serves the same API on a fixed port, moves it and closes it', async () => {
    const { server, revoke } = await start();
    const first = await freePort();
    const opened = await server.openPublicListener(first);
    expect(opened).toEqual({ port: first, url: `http://127.0.0.1:${first}` });
    expect(await status(opened.url, 'synthetic-client-token')).toBe(200);
    expect(await status(opened.url, 'wrong-token')).toBe(401);

    const second = await freePort();
    const moved = await server.openPublicListener(second);
    expect(await status(moved.url, 'synthetic-client-token')).toBe(200);
    await expect(fetch(`${opened.url}/api/v1/health`)).rejects.toThrow();

    revoke();
    expect(await status(moved.url, 'synthetic-client-token')).toBe(401);
    expect(await status(server.url, 'synthetic-app-token')).toBe(200);

    await server.closePublicListener();
    await expect(fetch(`${moved.url}/api/v1/health`)).rejects.toThrow();
  });

  it('reports a port that is already taken and validates the range', async () => {
    const { server } = await start();
    const blocker = createServer();
    await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', () => resolve()));
    onTestFinished(() => new Promise<void>(resolve => blocker.close(() => resolve())));
    const taken = (blocker.address() as AddressInfo).port;

    await expect(server.openPublicListener(taken)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await expect(server.openPublicListener(80)).rejects.toThrow(RangeError);
    expect(await status(server.url, 'synthetic-app-token')).toBe(200);
  });
});
