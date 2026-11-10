#!/usr/bin/env node
// Test bindings with Electron's Node ABI, not archive timestamps or a marker
// that can survive a later plain-Node rebuild.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let electronPath;
let electronVersion;
try {
  electronPath = require('electron');
  electronVersion = JSON.parse(readFileSync(join(repoRoot, 'node_modules/electron/package.json'), 'utf8')).version;
  if (typeof electronPath !== 'string' || !existsSync(electronPath) || typeof electronVersion !== 'string') {
    throw new Error('The Electron binary or version is missing.');
  }
} catch (error) {
  console.error('[ensure-native-modules] Electron is unavailable. Run `npm install` first.', error);
  process.exit(1);
}

const targets = [
  { label: 'root', projectRoot: repoRoot },
  { label: 'server', projectRoot: join(repoRoot, 'server') },
].filter(target => existsSync(join(target.projectRoot, 'node_modules/better-sqlite3')));

function probe(target) {
  const script = `
    try {
      const Database = require(${JSON.stringify(join(target.projectRoot, 'node_modules/better-sqlite3'))});
      const db = new Database(':memory:');
      db.close();
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  `;
  const result = spawnSync(electronPath, ['-e', script], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  if (result.error) return result.error.message;
  if (result.signal) return `Electron binding probe terminated by ${result.signal}`;
  return result.status === 0 ? null : result.stderr?.trim() || `Binding probe exited ${result.status}`;
}

const incompatible = targets.flatMap(target => {
  const error = probe(target);
  return error ? [{ ...target, error }] : [];
});
if (incompatible.length === 0) process.exit(0);

const rebuild = join(repoRoot, 'node_modules/.bin', process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild');
if (!existsSync(rebuild)) {
  console.error(`[ensure-native-modules] ${rebuild} is missing. Run \`npm install\` first.`);
  process.exit(1);
}

for (const target of incompatible) {
  console.log(`[ensure-native-modules] ${target.label}: incompatible binding; rebuilding for Electron ${electronVersion}.`);
  console.error(`[ensure-native-modules] ${target.label}: ${target.error}`);
  const result = spawnSync(rebuild, ['-m', target.projectRoot, '-w', 'better-sqlite3', '-v', electronVersion, '-f'], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`[ensure-native-modules] ${target.label}: rebuild failed.`, result.error || result.signal || result.status);
    process.exit(result.status || 1);
  }
  const error = probe(target);
  if (error) {
    console.error(`[ensure-native-modules] ${target.label}: binding still fails after rebuild: ${error}`);
    process.exit(1);
  }
}

console.log('[ensure-native-modules] Electron native modules are ready.');
