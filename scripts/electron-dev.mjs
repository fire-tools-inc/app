#!/usr/bin/env node
// `npm run electron:dev` — orchestrates a vite dev server (in `--mode electron`
// so the base is '/' and the web-only `/demo` middleware is bypassed) and
// spawns Electron once the renderer URL is reachable. Both children share the
// terminal; SIGINT propagates to both so Ctrl+C tears the stack down cleanly.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
const VITE_PORT = (() => {
  try {
    return new URL(RENDERER_URL).port || '5173';
  } catch {
    return '5173';
  }
})();

async function waitForUrl(url, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function shutdown(children, code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch (error) {
        console.error('[electron:dev] failed to stop child:', error);
      }
    }
  }
  process.exit(code);
}

async function main() {
  console.log(`[electron:dev] starting vite (mode=electron) on port ${VITE_PORT}…`);
  const vite = spawn(
    process.execPath,
    [resolve(repoRoot, 'node_modules/vite/bin/vite.js'), '--mode', 'electron', '--port', VITE_PORT, '--strictPort'],
    { cwd: repoRoot, env: process.env, stdio: 'inherit' }
  );

  const children = [vite];
  process.on('SIGINT', () => shutdown(children));
  process.on('SIGTERM', () => shutdown(children));
  vite.on('exit', (code, signal) => {
    if (signal || code !== 0) {
      console.error(`[electron:dev] vite exited (code=${code}, signal=${signal || 'none'})`);
      shutdown(children.filter((c) => c !== vite), code ?? 1);
    }
  });
  vite.on('error', (error) => {
    console.error('[electron:dev] vite failed to start:', error);
    shutdown(children.filter((child) => child !== vite), 1);
  });

  const ready = await waitForUrl(RENDERER_URL);
  if (!ready) {
    console.error('[electron:dev] vite never became reachable at', RENDERER_URL);
    shutdown(children, 1);
    return;
  }

  console.log('[electron:dev] vite is up — launching Electron');
  const electron = spawn(
    require('electron'),
    ['electron/main.cjs'],
    {
      cwd: repoRoot,
      env: { ...process.env, ELECTRON_RENDERER_URL: RENDERER_URL },
      stdio: 'inherit',
    }
  );
  children.push(electron);

  electron.on('exit', (code, signal) => {
    const log = signal || code !== 0 ? console.error : console.log;
    log(`[electron:dev] electron exited (code=${code}, signal=${signal || 'none'}) - stopping vite`);
    shutdown(children.filter((c) => c !== electron), code ?? 1);
  });
  electron.on('error', (error) => {
    console.error('[electron:dev] electron failed to start:', error);
    shutdown(children.filter((child) => child !== electron), 1);
  });
}

main().catch((err) => {
  console.error('[electron:dev] fatal:', err);
  process.exit(1);
});
