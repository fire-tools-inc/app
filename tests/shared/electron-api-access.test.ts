// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiAccess = require('../../electron/apiAccess.cjs');

const reversible = {
  isAvailable: () => true,
  encrypt: (plain: string) => Buffer.from([...plain].reverse().join('')).toString('base64'),
  decrypt: (encoded: string) => [...Buffer.from(encoded, 'base64').toString()].reverse().join(''),
};
const unavailable = { isAvailable: () => false, encrypt: () => '', decrypt: () => '' };

describe('electron/apiAccess.cjs', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'fire-tools-api-access-'));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('is disabled on the default port until the user opts in, and reports unreadable preferences', () => {
    expect(apiAccess.readPrefs(userDataDir, reversible)).toEqual({ enabled: false, port: apiAccess.DEFAULT_PORT, token: null, error: null });
    writeFileSync(join(userDataDir, 'api-access.json'), '{ not json');
    const broken = apiAccess.readPrefs(userDataDir, reversible);
    expect(broken).toMatchObject({ enabled: false, token: null, error: expect.any(String) });
  });

  it('keeps the port and an encrypted token across restarts', () => {
    apiAccess.writePrefs(userDataDir, { enabled: true, port: 51234, token: 'synthetic-token' }, reversible);
    const raw = readFileSync(join(userDataDir, 'api-access.json'), 'utf8');
    expect(raw).not.toContain('synthetic-token');
    expect(apiAccess.readPrefs(userDataDir, reversible)).toEqual({ enabled: true, port: 51234, token: 'synthetic-token', error: null });
    if (process.platform !== 'win32') expect(statSync(join(userDataDir, 'api-access.json')).mode & 0o777).toBe(0o600);
  });

  it('asks for a new token when the saved one cannot be decrypted, and stores it plainly without a keychain', () => {
    apiAccess.writePrefs(userDataDir, { enabled: true, port: 51234, token: 'synthetic-token' }, reversible);
    expect(apiAccess.readPrefs(userDataDir, unavailable)).toMatchObject({ enabled: true, token: null, error: expect.stringContaining('new one') });

    apiAccess.writePrefs(userDataDir, { enabled: true, port: 80, token: 'synthetic-plain' }, unavailable);
    expect(apiAccess.readPrefs(userDataDir, unavailable)).toEqual({
      enabled: true, port: apiAccess.DEFAULT_PORT, token: 'synthetic-plain', error: null,
    });
  });

  it('validates ports and mints distinct tokens', () => {
    expect([1024, 47820, 65535].every(apiAccess.isValidPort)).toBe(true);
    expect([80, 1023, 65536, 4.5, '47820'].some(apiAccess.isValidPort)).toBe(false);
    expect(apiAccess.newToken()).not.toBe(apiAccess.newToken());
  });

  it('writes an owner-only connection file and removes it again', () => {
    apiAccess.writeDiscovery(userDataDir, {
      apiBaseUrl: 'http://127.0.0.1:47820/api/v1',
      token: 'synthetic-token',
      stablePort: true,
      appVersion: '0.0.0-test',
      pid: 4242,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const file = apiAccess.discoveryPath(userDataDir);
    expect(file.endsWith('local-api.json')).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      schemaVersion: 1, apiBaseUrl: 'http://127.0.0.1:47820/api/v1', token: 'synthetic-token', stablePort: true,
    });
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    apiAccess.removeDiscovery(userDataDir);
    expect(existsSync(file)).toBe(false);
    expect(() => apiAccess.removeDiscovery(userDataDir)).not.toThrow();
  });
});
