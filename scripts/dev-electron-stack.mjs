#!/usr/bin/env node
// `npm run dev:electron-stack` — boots the local backend (Express+SQLite under
// `server/`), waits for it to become reachable, then hands off to the existing
// `scripts/electron-dev.mjs` orchestrator which brings up Vite + Electron.
// Ctrl+C tears the whole stack down cleanly.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const serverDir = resolve(repoRoot, 'server');

const BACKEND_PORT = process.env.PORT || '8787';
const BACKEND_HOST = process.env.HOST || '127.0.0.1';
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); } catch { /* noop */ }
    }
  }
  setTimeout(() => process.exit(code), 200).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitForUrl(url, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function spawnChild(label, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev:electron-stack] ${label} exited (code=${code}, signal=${signal ?? 'none'}) — tearing down stack`);
    shutdown(code ?? 1);
  });
  child.on('error', (err) => {
    if (shuttingDown) return;
    console.error(`[dev:electron-stack] ${label} failed to start:`, err.message);
    shutdown(1);
  });
  return child;
}

async function main() {
  if (!existsSync(resolve(serverDir, 'package.json'))) {
    console.error('[dev:electron-stack] server/package.json not found — nothing to run');
    process.exit(1);
  }
  if (!existsSync(resolve(serverDir, 'node_modules'))) {
    console.warn('[dev:electron-stack] server/node_modules missing — run `npm install --prefix server` first');
  }

  console.log(`[dev:electron-stack] starting backend on ${BACKEND_URL}…`);
  spawnChild('backend', 'npm', ['run', 'dev'], {
    cwd: serverDir,
    env: { ...process.env, PORT: BACKEND_PORT, HOST: BACKEND_HOST },
  });

  const backendReady = await waitForUrl(BACKEND_URL);
  if (!backendReady) {
    console.error(`[dev:electron-stack] backend never became reachable at ${BACKEND_URL}`);
    shutdown(1);
    return;
  }
  console.log('[dev:electron-stack] backend is up — launching Electron + Vite');

  spawnChild('electron-dev', 'node', ['scripts/electron-dev.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RENDERER_URL: RENDERER_URL, VITE_API_BASE_URL: BACKEND_URL },
  });
}

main().catch((err) => {
  console.error('[dev:electron-stack] fatal:', err);
  shutdown(1);
});
