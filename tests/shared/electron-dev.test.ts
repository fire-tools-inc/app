import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal<typeof import('node:module')>();
  const createRequire = () => () => '/synthetic/Electron';
  return { ...actual, createRequire, default: { ...actual, createRequire } };
});

class FakeChild extends EventEmitter {
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

let vite: FakeChild;
let electron: FakeChild;

beforeEach(() => {
  vi.resetModules();
  vite = new FakeChild();
  electron = new FakeChild();
  mocks.spawn.mockReset().mockReturnValueOnce(vite).mockReturnValueOnce(electron);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.spyOn(process, 'on').mockReturnValue(process);
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('launcher exit'); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startLauncher() {
  await import(pathToFileURL(resolve('scripts/electron-dev.mjs')).href);
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(2));
}

describe('Electron development launcher', () => {
  it('owns the actual Vite and Electron processes instead of npm wrappers', async () => {
    await startLauncher();
    expect(mocks.spawn.mock.calls[0][0]).toBe(process.execPath);
    expect(mocks.spawn.mock.calls[1][0]).toMatch(/(?:Electron|electron(?:\.exe)?)$/);
    expect(mocks.spawn.mock.calls[1][1]).toEqual(['electron/main.cjs']);
  });

  it('reports a native crash as failure and stops its own renderer server', async () => {
    await startLauncher();
    expect(() => electron.emit('exit', null, 'SIGSEGV')).toThrow('launcher exit');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(vite.kill).toHaveBeenCalledWith('SIGTERM');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('signal=SIGSEGV'));
  });

  it('retains successful exit status when the application closes normally', async () => {
    await startLauncher();
    expect(() => electron.emit('exit', 0, null)).toThrow('launcher exit');
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(vite.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('surfaces a spawn error instead of leaving Vite running', async () => {
    await startLauncher();
    expect(() => electron.emit('error', new Error('synthetic launch failure'))).toThrow('launcher exit');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(vite.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
