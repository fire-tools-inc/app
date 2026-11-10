// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expectDiagnostic } from './diagnostics';

const require = createRequire(import.meta.url);

interface UpdaterApi {
  setupUpdater: () => Promise<void>;
  quitAndInstall: () => Promise<boolean>;
  getState: () => { status: string; error: string | null };
}

class TestAutoUpdater extends EventEmitter {
  autoInstallOnAppQuit = true;
  quitAndInstall = vi.fn<() => Promise<void>>();
}

async function loadUpdater(root: string, platform = 'darwin', installError: string | null = null) {
  const native = new TestAutoUpdater();
  const backup = {
    createBackup: vi.fn().mockResolvedValue({ id: 'synthetic-backup' }),
    rotateBackups: vi.fn().mockResolvedValue({ kept: ['synthetic-backup'], removed: [] }),
  };
  const module = { exports: {} };
  const app = { isPackaged: true, getPath: () => root, getVersion: () => '1.0.0' };
  const source = await readFile(new URL('../../electron/updater.cjs', import.meta.url), 'utf8');
  runInNewContext(source, {
    module,
    console,
    process: { env: {}, platform },
    setTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app };
      if (id === 'electron-updater') return { autoUpdater: native };
      if (id === './backup.cjs') return backup;
      if (id === './mac-updater.cjs') return { MacUpdater: function () { return native; } };
      if (id === './mac-install.cjs') return { readInstallError: async () => installError };
      return require(id);
    },
  });
  const api = module.exports as UpdaterApi;
  await api.setupUpdater();
  return { api, native, backup };
}

describe('updater installation backup gate', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fire-tools-updater-gate-'));
    await writeFile(join(root, 'auto-update.json'), JSON.stringify({ autoCheck: false }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each(['darwin', 'win32'])('backs up and awaits asynchronous installation errors on %s', async platform => {
    const { api, native, backup } = await loadUpdater(root, platform);
    const installer = Promise.withResolvers<void>();
    native.quitAndInstall.mockReturnValue(installer.promise);
    let settled = false;
    const result = api.quitAndInstall().then(value => {
      settled = true;
      return value;
    });

    await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledOnce());
    expect(backup.createBackup).toHaveBeenCalledOnce();
    expect(backup.rotateBackups).toHaveBeenCalledOnce();
    expect(native.autoInstallOnAppQuit).toBe(false);
    expect(settled).toBe(false);
    installer.reject(new Error('synthetic install failure'));

    expect(await result).toBe(false);
    expect(api.getState()).toMatchObject({ status: 'error', error: 'synthetic install failure' });
    expectDiagnostic('error', 'update installation failed:');
  });

  it('refuses to invoke an installer when the backup fails', async () => {
    const { api, native, backup } = await loadUpdater(root);
    backup.createBackup.mockRejectedValue(new Error('synthetic backup failure'));

    expect(await api.quitAndInstall()).toBe(false);

    expect(native.quitAndInstall).not.toHaveBeenCalled();
    expect(api.getState()).toMatchObject({ status: 'backup-failed', error: 'synthetic backup failure' });
    expectDiagnostic('error', 'backup before update failed:');
  });

  it('surfaces a persisted installer failure through the existing update state', async () => {
    const { api } = await loadUpdater(root, 'darwin', 'synthetic previous installation failure');

    expect(api.getState()).toMatchObject({ status: 'error', error: 'synthetic previous installation failure' });
    expectDiagnostic('error', 'previous macOS update failed:');
  });
});
