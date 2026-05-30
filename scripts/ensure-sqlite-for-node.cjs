#!/usr/bin/env node
// Ensure better-sqlite3's native binding matches the current Node runtime.
// The repo's regular postinstall runs electron-rebuild, which builds the
// addon for Electron's Node ABI. Tests run under plain Node (vitest), so
// the binary may fail to load with NODE_MODULE_VERSION mismatch.
// This script probes the addon and rebuilds against the current Node only
// if the probe fails. No-op on a healthy local dev environment.

const { execSync, spawnSync } = require('node:child_process');

function probe() {
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

const initial = probe();
if (initial === true) {
  process.exit(0);
}

console.log('[ensure-sqlite-for-node] better-sqlite3 binding incompatible with current Node runtime; rebuilding…');
console.log('[ensure-sqlite-for-node] probe error:', initial && initial.message);

try {
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
} catch (err) {
  console.error('[ensure-sqlite-for-node] rebuild failed:', err && err.message);
  process.exit(1);
}

// Node caches loaded native bindings at the C level — even after deleting
// the require cache, the original (incompatible) binary stays mapped into
// this process. The next process (vitest) will pick up the new binary
// fresh, so don't re-probe here. Trust npm rebuild's exit code.
console.log('[ensure-sqlite-for-node] rebuild succeeded; new binary will be loaded by next process.');
process.exit(0);
