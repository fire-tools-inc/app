#!/usr/bin/env node
// Ensure better-sqlite3's native binding matches the current Node runtime.
// The repo's regular postinstall runs electron-rebuild, which builds the
// addon for Electron's Node ABI. Tests run under plain Node (vitest), so
// the binary may fail to load with NODE_MODULE_VERSION mismatch.
// This script probes the addon and rebuilds against the current Node only
// if the probe fails. No-op on a healthy local dev environment.

const { execSync, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Locations of better-sqlite3 to verify. Root copy backs vitest at the repo
// root; server copy backs `npm --prefix server test`. Either can become
// Electron-ABI-bound after `electron-rebuild` (postinstall) and must be
// rebuilt for the current Node before running tests.
const TARGETS = [
  { label: 'root', cwd: resolve(__dirname, '..') },
  { label: 'server', cwd: resolve(__dirname, '..', 'server') },
].filter((t) => existsSync(join(t.cwd, 'node_modules', 'better-sqlite3')));

function probe(cwd) {
  const probeScript = `
    try {
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      db.close();
      process.exit(0);
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    }
  `;

  const result = spawnSync(process.execPath, ['-e', probeScript], {
    stdio: 'pipe',
    encoding: 'utf8',
    cwd,
  });

  if (result.error) {
    return result.error;
  }
  if (result.status === 0) {
    return true;
  }
  if (result.signal) {
    return new Error(`probe process terminated by signal ${result.signal}`);
  }

  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  const message = stderr || stdout || `probe process exited with code ${result.status}`;
  return new Error(message);
}

let failed = false;
for (const target of TARGETS) {
  const result = probe(target.cwd);
  if (result === true) {
    continue;
  }

  console.log(`[ensure-sqlite-for-node] ${target.label}: better-sqlite3 binding incompatible with current Node runtime; rebuilding…`);
  console.log(`[ensure-sqlite-for-node] ${target.label}: probe error:`, result && result.message);

  try {
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit', cwd: target.cwd });
    const verification = probe(target.cwd);
    if (verification !== true) throw verification;
    console.log(`[ensure-sqlite-for-node] ${target.label}: rebuild succeeded; new binary will be loaded by next process.`);
  } catch (err) {
    console.error(`[ensure-sqlite-for-node] ${target.label}: rebuild failed:`, err && err.message);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
