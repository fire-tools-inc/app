#!/usr/bin/env node
/**
 * bump-version.mjs — update the app version across all relevant files.
 *
 * Usage:
 *   node scripts/bump-version.mjs <new-version>
 *
 * Files updated:
 *   - package.json           (root)
 *   - server/package.json    (server sub-package)
 *   - tests/setup.ts         (__APP_VERSION__ vitest global stub)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: node scripts/bump-version.mjs <new-version>');
  console.error('Example: node scripts/bump-version.mjs 2.1.0');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
  console.error(`Error: "${newVersion}" does not look like a valid semver string (expected X.Y.Z).`);
  process.exit(1);
}

/** Update the "version" field inside a JSON file. */
function bumpJsonVersion(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const obj = JSON.parse(raw);
  const oldVersion = obj.version;
  obj.version = newVersion;
  // Preserve trailing newline if present.
  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + trailing, 'utf-8');
  console.log(`  ${filePath.replace(repoRoot + '/', '')}  ${oldVersion} → ${newVersion}`);
}

/** Replace a literal version string inside a text file using a regex. */
function bumpTextVersion(filePath, pattern, replacement) {
  const raw = readFileSync(filePath, 'utf-8');
  if (!pattern.test(raw)) {
    console.warn(`  WARNING: no match found in ${filePath.replace(repoRoot + '/', '')} — skipping`);
    return;
  }
  const updated = raw.replace(pattern, replacement);
  if (updated === raw) {
    console.log(`  ${filePath.replace(repoRoot + '/', '')}  (already at ${newVersion}, no change needed)`);
    return;
  }
  writeFileSync(filePath, updated, 'utf-8');
  console.log(`  ${filePath.replace(repoRoot + '/', '')}  (version stub updated)`);
}

console.log(`Bumping version to ${newVersion}...\n`);

/** Patch the top-level version inside an npm lockfile so it tracks package.json. */
function bumpLockVersion(filePath) {
  const label = filePath.replace(repoRoot + '/', '');
  try {
    const lockRaw = readFileSync(filePath, 'utf-8');
    const lock = JSON.parse(lockRaw);
    const oldLockVer = lock.version;
    lock.version = newVersion;
    if (lock.packages?.['']) lock.packages[''].version = newVersion;
    const trailing = lockRaw.endsWith('\n') ? '\n' : '';
    writeFileSync(filePath, JSON.stringify(lock, null, 2) + trailing, 'utf-8');
    console.log(`  ${label}  ${oldLockVer} → ${newVersion}`);
  } catch (err) {
    console.warn(`  WARNING: could not update ${label}: ${err.message}`);
  }
}

bumpJsonVersion(resolve(repoRoot, 'package.json'));
bumpJsonVersion(resolve(repoRoot, 'server', 'package.json'));

// Keep both lockfiles consistent with their package.json.
bumpLockVersion(resolve(repoRoot, 'package-lock.json'));
bumpLockVersion(resolve(repoRoot, 'server', 'package-lock.json'));

bumpTextVersion(
  resolve(repoRoot, 'tests', 'setup.ts'),
  /vi\.stubGlobal\('__APP_VERSION__',\s*'[^']+'\)/,
  `vi.stubGlobal('__APP_VERSION__', '${newVersion}')`,
);

console.log(`\nDone. Run the following to commit the version bump:`);
console.log(`  git add -u && git commit -m 'chore: bump version to ${newVersion}'`);
