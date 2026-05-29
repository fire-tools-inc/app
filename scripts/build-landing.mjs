#!/usr/bin/env node
// Copies website/ -> dist/landing/ after the main Vite build.
// Run via `npm run build:landing` (or chain after `npm run build`).
import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const src = resolve(repoRoot, 'website');
const dest = resolve(repoRoot, 'dist', 'landing');

try {
  await access(resolve(repoRoot, 'dist'));
} catch {
  console.error('[build-landing] dist/ does not exist — run `npm run build` first.');
  process.exit(1);
}

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true, filter: (s) => !s.endsWith('README.md') });

console.error(`[build-landing] copied ${src} -> ${dest}`);
