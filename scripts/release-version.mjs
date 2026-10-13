#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stableVersion = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function parseVersion(version) {
  if (!stableVersion.test(version)) {
    throw new Error(`'${version}' is not a valid stable version; expected X.Y.Z.`);
  }
  const components = version.split('.').map(Number);
  if (!components.every(Number.isSafeInteger)) {
    throw new Error('Version components must be safe integers.');
  }
  return components;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function checkVersion(current, requested, remote) {
  const currentComponents = parseVersion(current);
  const requestedComponents = parseVersion(requested);
  const refs = execFileSync('git', ['ls-remote', '--tags', '--refs', remote, 'refs/tags/v*'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  let latest;
  for (const line of refs.trim().split('\n')) {
    const tag = line.split('\t')[1];
    const version = tag?.replace(/^refs\/tags\/v/, '');
    if (!version || !stableVersion.test(version)) continue;
    const components = parseVersion(version);
    if (!latest || compareVersions(components, latest.components) > 0) {
      latest = { version, components };
    }
  }
  const baseline = latest?.components ?? currentComponents;
  if (compareVersions(requestedComponents, baseline) < 0) {
    const label = latest ? `release tag v${latest.version}` : `package version ${current}`;
    throw new Error(`Requested version ${requested} is older than ${label}.`);
  }
}

function verifyVersions(version) {
  parseVersion(version);
  for (const file of ['package.json', 'package-lock.json', 'server/package.json', 'server/package-lock.json']) {
    const data = JSON.parse(readFileSync(resolve(repoRoot, file), 'utf8'));
    if (data.version !== version || (file.endsWith('package-lock.json') && data.packages?.['']?.version !== version)) {
      throw new Error(`${file} does not match release version ${version}.`);
    }
  }
  const setup = readFileSync(resolve(repoRoot, 'tests/setup.ts'), 'utf8');
  const testVersion = setup.match(/vi\.stubGlobal\('__APP_VERSION__',\s*'([^']+)'\)/)?.[1];
  if (testVersion !== version) {
    throw new Error(`tests/setup.ts does not match release version ${version}.`);
  }
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check' && args.length === 3) {
    checkVersion(args[0], args[1], args[2]);
  } else if (command === 'verify' && args.length === 1) {
    verifyVersions(args[0]);
  } else {
    throw new Error('Usage: release-version.mjs check <current> <requested> <remote> | verify <version>');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
