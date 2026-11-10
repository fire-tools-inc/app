// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, copyFile, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter, once } from 'node:events';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import type { UpdateInfo, ResolvedUpdateFileInfo } from 'electron-updater';
import { expectDiagnostic } from './diagnostics';

const require = createRequire(import.meta.url);
const run = promisify(execFile);

interface InstallJob {
  appPath: string;
  stageDir: string;
  stagedApp: string;
  parentPid: number;
  relaunch: boolean;
}

interface InstallHooks {
  waitForExit?: (pid: number) => Promise<void>;
  openApp?: (appPath: string) => Promise<void>;
}

interface PrepareOptions {
  appPath: string;
  archive: string;
  sha512: string;
  version: string;
}

interface TestMacUpdater extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  httpExecutor: {
    download: (url: URL, destination: string, options: { sha512?: string }) => Promise<void>;
  };
  getUpdateInfoAndProvider: () => Promise<{
    info: UpdateInfo;
    provider: { resolveFiles: () => ResolvedUpdateFileInfo[] };
  }>;
  checkForUpdates: () => Promise<{ updateInfo: UpdateInfo }>;
  downloadUpdate: () => Promise<string[]>;
}

async function createMacArchive(root: string) {
  const bundle = join(root, 'download', 'Fire Tools.app');
  await mkdir(join(bundle, 'Contents', 'MacOS'), { recursive: true });
  const executable = join(bundle, 'Contents', 'MacOS', 'Fire Tools');
  await copyFile('/usr/bin/true', executable);
  await chmod(executable, 0o755);
  await writeFile(join(bundle, 'Contents', 'Info.plist'), `<?xml version="1.0"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.mb-consulting.firetools</string>
<key>CFBundleExecutable</key><string>Fire Tools</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1.0.1</string>
<key>CFBundleShortVersionString</key><string>1.0.1</string>
</dict></plist>`);
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
  const archive = join(root, 'update.zip');
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, archive]);
  const sha512 = createHash('sha512').update(await readFile(archive)).digest('base64');
  return { archive, sha512 };
}

async function createTestUpdater(root: string) {
  const { MacUpdater } = require('../../electron/mac-updater.cjs') as {
    MacUpdater: new (app: AppAdapter) => TestMacUpdater;
  };
  const appUpdateConfigPath = join(root, 'app-update.yml');
  await writeFile(appUpdateConfigPath, 'updaterCacheDirName: fire-tools-updater-test\n');
  const app: AppAdapter = {
    name: 'Fire Tools',
    version: '1.0.0',
    isPackaged: true,
    appUpdateConfigPath,
    userDataPath: root,
    baseCachePath: root,
    whenReady: async () => {},
    quit: vi.fn(),
    relaunch: vi.fn(),
    onQuit: vi.fn(),
  };
  const updater = new MacUpdater(app);
  updater.autoDownload = false;
  const payload = Buffer.from('synthetic release ZIP');
  const sha512 = createHash('sha512').update(payload).digest('base64');
  const files = ['arm64', 'x64'].map(arch => ({
    url: `Fire.Tools-1.0.1-${arch}-mac.zip`,
    sha512,
    size: payload.length,
  }));
  const info: UpdateInfo = { version: '1.0.1', releaseDate: '2026-01-01T00:00:00Z', files };
  const resolvedFiles = files.map(file => ({
    info: file,
    url: new URL(`https://github.com/fire-tools-inc/app/releases/download/v1.0.1/${file.url}`),
  }));
  updater.getUpdateInfoAndProvider = async () => ({ info, provider: { resolveFiles: () => resolvedFiles } });
  const download = vi.fn(async (_url: URL, destination: string, options: { sha512?: string }) => {
    expect(options.sha512).toBe(sha512);
    await writeFile(destination, payload);
  });
  updater.httpExecutor = { download };
  return { updater, download, resolvedFiles, sha512, payload };
}

describe('macOS bundle installation', () => {
  let root: string;
  let job: InstallJob;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'fire-tools-update-test-')));
    const appPath = join(root, "Fire Tools 'quoted' $.app");
    const stageDir = join(root, '.fire-tools-update-test');
    const stagedApp = join(stageDir, 'Fire Tools.app');
    await mkdir(appPath);
    await mkdir(stagedApp, { recursive: true });
    await writeFile(join(appPath, 'version'), '1.0.0');
    await writeFile(join(stagedApp, 'version'), '1.0.1');
    job = { appPath, stageDir, stagedApp, parentPid: process.pid, relaunch: true };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('waits for the running app to exit, swaps bundles, and relaunches the new version', async () => {
    const { installUpdate } = require('../../electron/mac-install.cjs') as {
      installUpdate: (job: InstallJob, hooks?: InstallHooks) => Promise<void>;
    };
    const parentExit = Promise.withResolvers<void>();
    const waitForExit = vi.fn(() => parentExit.promise);
    const openedVersions: string[] = [];

    const installing = installUpdate(job, {
      waitForExit,
      openApp: async appPath => {
        openedVersions.push(await readFile(join(appPath, 'version'), 'utf8'));
      },
    });

    await vi.waitFor(() => expect(waitForExit).toHaveBeenCalledWith(process.pid));
    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
    parentExit.resolve();
    await installing;

    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.1');
    expect(openedVersions).toEqual(['1.0.1']);
    await expect(readFile(join(job.stageDir, 'previous.app', 'version'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.runIf(process.platform === 'darwin')('prepares an ad-hoc-signed release ZIP without notarization', async () => {
    const { prepareUpdate } = require('../../electron/mac-install.cjs') as {
      prepareUpdate: (options: PrepareOptions) => Promise<InstallJob>;
    };
    const { archive, sha512 } = await createMacArchive(root);

    const prepared = await prepareUpdate({ appPath: job.appPath, archive, sha512, version: '1.0.1' });

    expect(prepared.stageDir.startsWith(join(root, '.fire-tools-update-'))).toBe(true);
    await expect(readFile(join(prepared.stagedApp, 'Contents', 'Info.plist'), 'utf8'))
      .resolves.toContain('dev.mb-consulting.firetools');
    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', prepared.stagedApp]);
  });

  it('runs the installer outside the old bundle and finishes after the app has exited', async () => {
    const { startInstaller } = require('../../electron/mac-install.cjs') as {
      startInstaller: (job: InstallJob, userDataDir: string) => Promise<ChildProcess>;
    };
    const oldProcess = spawn(process.execPath, ['-e', '']);
    await once(oldProcess, 'exit');
    expect(oldProcess.pid).toBeDefined();

    const helper = await startInstaller({ ...job, parentPid: oldProcess.pid!, relaunch: false }, root);
    try {
      const [code] = helper.exitCode === null ? await once(helper, 'exit') : [helper.exitCode];
      expect(code).toBe(0);
      expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.1');
      await expect(readFile(join(root, 'mac-update-error.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (helper.exitCode === null && helper.signalCode === null) helper.kill();
    }
  });

  it('downloads the matching architecture from the public GitHub release with its checksum', async () => {
    const { updater, download, payload } = await createTestUpdater(root);
    const events: UpdateInfo[] = [];
    updater.on('update-downloaded', event => events.push(event));

    expect((await updater.checkForUpdates()).updateInfo.version).toBe('1.0.1');
    const [downloaded] = await updater.downloadUpdate();

    expect(download.mock.calls[0][0].href)
      .toBe(`https://github.com/fire-tools-inc/app/releases/download/v1.0.1/Fire.Tools-1.0.1-${process.arch}-mac.zip`);
    expect(await readFile(downloaded)).toEqual(payload);
    expect(events.map(event => event.version)).toEqual(['1.0.1']);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it('restores the previous app and reports a post-quit failure on the next launch', async () => {
    const { startInstaller, readInstallError } = require('../../electron/mac-install.cjs') as {
      startInstaller: (job: InstallJob, userDataDir: string) => Promise<ChildProcess>;
      readInstallError: (userDataDir: string) => Promise<string | null>;
    };
    const oldProcess = spawn(process.execPath, ['-e', '']);
    await once(oldProcess, 'exit');
    await rm(job.stagedApp, { recursive: true });

    const helper = await startInstaller({ ...job, parentPid: oldProcess.pid!, relaunch: false }, root);
    try {
      const [code] = helper.exitCode === null ? await once(helper, 'exit') : [helper.exitCode];
      expect(code).toBe(1);
      expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
      expect(await readInstallError(root)).toContain('the previous app was restored');
      expect(await readInstallError(root)).toBeNull();
      expect(await readFile(join(root, 'mac-update-install.log'), 'utf8')).toContain('installation failed');
    } finally {
      if (helper.exitCode === null && helper.signalCode === null) helper.kill();
    }
  });

  it.each([
    { scenario: 'foreign-source', message: 'must come from the public fire-tools-inc/app' },
    { scenario: 'missing-architecture', message: 'does not contain a macOS update' },
    { scenario: 'missing-checksum', message: 'missing a valid SHA-512 checksum' },
  ])('rejects $scenario releases before downloading', async ({ scenario, message }) => {
    const { updater, download, resolvedFiles } = await createTestUpdater(root);
    for (const file of resolvedFiles) {
      if (scenario === 'foreign-source') file.url.hostname = 'untrusted.example';
      if (scenario === 'missing-architecture') file.url.pathname = '/other.zip';
      if (scenario === 'missing-checksum') file.info.sha512 = '';
    }
    await updater.checkForUpdates();

    await expect(updater.downloadUpdate()).rejects.toThrow(message);

    expect(download).not.toHaveBeenCalled();
    expectDiagnostic('error', message);
  });

  it('rejects a modified cached ZIP before extracting or changing the installed app', async () => {
    const { prepareUpdate } = require('../../electron/mac-install.cjs') as {
      prepareUpdate: (options: PrepareOptions) => Promise<InstallJob>;
    };
    const archive = join(root, 'update.zip');
    const sha512 = createHash('sha512').update('expected release').digest('base64');
    await writeFile(archive, 'modified cached release');

    await expect(prepareUpdate({ appPath: job.appPath, archive, sha512, version: '1.0.1' }))
      .rejects.toThrow('failed SHA-512 verification');
    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
  });

  it('leaves the installed app untouched when the old process does not exit', async () => {
    const { installUpdate, waitForExit } = require('../../electron/mac-install.cjs') as {
      installUpdate: (job: InstallJob, hooks?: InstallHooks) => Promise<void>;
      waitForExit: (pid: number, timeoutMs: number) => Promise<void>;
    };

    await expect(installUpdate(job, { waitForExit: pid => waitForExit(pid, 0) }))
      .rejects.toThrow('did not exit');

    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
    expect(await readFile(join(job.stagedApp, 'version'), 'utf8')).toBe('1.0.1');
  });

  it('rolls back the bundle if launching the new app fails', async () => {
    const { installUpdate } = require('../../electron/mac-install.cjs') as {
      installUpdate: (job: InstallJob, hooks?: InstallHooks) => Promise<void>;
    };
    const openApp = vi.fn().mockRejectedValue(new Error('synthetic launch failure'));

    await expect(installUpdate(job, { waitForExit: async () => {}, openApp }))
      .rejects.toThrow('the previous app was restored');

    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
    expect(openApp).toHaveBeenCalledOnce();
  });

  it.runIf(process.platform === 'darwin')('rejects a bundle version that differs from the release manifest', async () => {
    const { prepareUpdate } = require('../../electron/mac-install.cjs') as {
      prepareUpdate: (options: PrepareOptions) => Promise<InstallJob>;
    };
    const { archive, sha512 } = await createMacArchive(root);

    await expect(prepareUpdate({ appPath: job.appPath, archive, sha512, version: '1.0.2' }))
      .rejects.toThrow('bundle version does not match');
    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.0');
  });

  it.runIf(process.platform === 'darwin')('copies the packaged helper and removes an old ASAR bundle using real Electron', async () => {
    const electron = require('electron') as string;
    const { createPackage } = require('@electron/asar') as {
      createPackage: (source: string, destination: string) => Promise<void>;
    };
    const source = join(root, 'helper-source');
    await mkdir(source);
    await copyFile(new URL('../../electron/mac-install.cjs', import.meta.url), join(source, 'mac-install.cjs'));
    const archive = join(root, 'helper.asar');
    await createPackage(source, archive);
    await mkdir(join(job.appPath, 'Contents', 'Resources'), { recursive: true });
    await copyFile(archive, join(job.appPath, 'Contents', 'Resources', 'app.asar'));
    const oldProcess = spawn(process.execPath, ['-e', '']);
    await once(oldProcess, 'exit');

    await run(electron, ['-e', `
      const {once} = require('node:events');
      const fs = require('node:fs/promises');
      const {startInstaller} = require(process.argv[1]);
      (async () => {
        const helper = await startInstaller(JSON.parse(process.argv[2]), process.argv[3]);
        const [code] = helper.exitCode === null ? await once(helper, 'exit') : [helper.exitCode];
        if (code !== 0) throw new Error(await fs.readFile(process.argv[3] + '/mac-update-install.log', 'utf8'));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `, join(archive, 'mac-install.cjs'), JSON.stringify({ ...job, parentPid: oldProcess.pid!, relaunch: false }), root], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 15_000,
    });

    expect(await readFile(join(job.appPath, 'version'), 'utf8')).toBe('1.0.1');
    await expect(stat(job.stageDir))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});
