// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const agentAccess = require('../../electron/agentAccess.cjs');

describe('electron/agentAccess.cjs', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'fire-tools-agent-access-'));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('is disabled until the user opts in, and reports unreadable preferences', () => {
    expect(agentAccess.readPrefs(userDataDir)).toEqual({ enabled: false, error: null });
    writeFileSync(join(userDataDir, 'agent-access.json'), '{ not json');
    const broken = agentAccess.readPrefs(userDataDir);
    expect(broken.enabled).toBe(false);
    expect(broken.error).toEqual(expect.any(String));
    agentAccess.writePrefs(userDataDir, { enabled: true });
    expect(agentAccess.readPrefs(userDataDir)).toEqual({ enabled: true, error: null });
  });

  it('writes an owner-only discovery file and removes it again', () => {
    agentAccess.writeDiscovery(userDataDir, {
      apiBaseUrl: 'http://127.0.0.1:41234/api/v1',
      token: 'synthetic-token',
      appVersion: '0.0.0-test',
      pid: 4242,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const file = agentAccess.discoveryPath(userDataDir);
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    expect(payload).toMatchObject({
      schemaVersion: 1,
      apiBaseUrl: 'http://127.0.0.1:41234/api/v1',
      token: 'synthetic-token',
      pid: 4242,
    });
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    agentAccess.removeDiscovery(userDataDir);
    expect(existsSync(file)).toBe(false);
    expect(() => agentAccess.removeDiscovery(userDataDir)).not.toThrow();
  });
});
