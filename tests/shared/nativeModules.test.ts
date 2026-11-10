// @vitest-environment node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), read: vi.fn(), exists: vi.fn() }));
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: mocks.spawn, default: { ...actual, spawnSync: mocks.spawn } };
});
vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal<typeof import('node:module')>();
  const createRequire = () => () => '/synthetic/Electron';
  return { ...actual, createRequire, default: { ...actual, createRequire } };
});
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: mocks.read, existsSync: mocks.exists, default: { ...actual, readFileSync: mocks.read, existsSync: mocks.exists } };
});

beforeEach(() => {
  vi.resetModules();
  mocks.spawn.mockReset().mockReturnValue({ status: 0, stderr: '' });
  mocks.exists.mockReset().mockReturnValue(true);
  mocks.read.mockReset().mockReturnValue(JSON.stringify({ version: '44.7.0' }));
  vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`exit:${code}`); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

function run() {
  return import(pathToFileURL(resolve('scripts/ensure-native-modules.mjs')).href);
}

describe('Electron native-module preparation', () => {
  it('probes both bindings in Electron without launching the UI or rebuilding healthy binaries', async () => {
    await expect(run()).rejects.toThrow('exit:0');
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    for (const [, args, options] of mocks.spawn.mock.calls) {
      expect(args[0]).toBe('-e');
      expect(options.env.ELECTRON_RUN_AS_NODE).toBe('1');
      expect(args[1]).toContain("new Database(':memory:')");
    }
  });

  it('detects restored Node-ABI archives regardless of old mtimes or stale build markers', async () => {
    let probes = 0;
    mocks.spawn.mockImplementation((_command, args) => {
      if (args[0] === '-e' && ++probes <= 2) {
        return { status: 1, stderr: 'NODE_MODULE_VERSION 137; Electron requires 149' };
      }
      return { status: 0, stderr: '' };
    });
    await run();
    const rebuilds = mocks.spawn.mock.calls.filter(([, args]) => args[0] === '-m');
    expect(rebuilds).toHaveLength(2);
    for (const [, args] of rebuilds) expect(args).toEqual(expect.arrayContaining(['-v', '44.7.0', '-f']));
    expect(probes).toBe(4);
  });

  it('fails explicitly when the rebuild command fails', async () => {
    mocks.spawn.mockImplementation((_command, args) => args[0] === '-e'
      ? { status: 1, stderr: 'incompatible ABI' }
      : { status: 2 });
    await expect(run()).rejects.toThrow('exit:2');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('rebuild failed'), 2);
  });

  it('does not claim success when a rebuilt binding still cannot open a database', async () => {
    mocks.spawn.mockImplementation((_command, args) => args[0] === '-e'
      ? { status: 1, stderr: 'synthetic missing binding' }
      : { status: 0 });
    await expect(run()).rejects.toThrow('exit:1');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('binding still fails after rebuild'));
  });
});
