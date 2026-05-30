#!/usr/bin/env node
// `npm run dev:all` — runs the SPA dev server alongside the landing page,
// OpenAPI viewer and docs so the local layout mirrors what GitHub Pages
// serves. Static pages are built into .dev-pages/ and re-built whenever
// their sources change.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pagesDir = '.dev-pages';

const env = {
  ...process.env,
  PAGES_OUT_DIR: pagesDir,
  DEV_PAGES_DIR: pagesDir,
};

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: repoRoot, env, stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', rej);
  });
}

async function buildAll() {
  try {
    await run('node', ['scripts/build-landing.mjs']);
    await run('node', ['scripts/build-docs.mjs']);
  } catch (err) {
    console.error('[dev:all] build failed:', err.message);
  }
}

async function main() {
  console.log('[dev:all] initial build of landing + docs into', pagesDir, '/');
  await buildAll();

  let timer = null;
  const debouncedBuild = (label) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      console.log(`[dev:all] change in ${label} — rebuilding pages`);
      buildAll();
    }, 200);
  };

  const watchTargets = [
    ['website', 'website/'],
    ['docs/user', 'docs/user/'],
    ['docs/engineering', 'docs/engineering/'],
    ['docs/api', 'docs/api/'],
  ];
  for (const [path, label] of watchTargets) {
    try {
      watch(resolve(repoRoot, path), { recursive: true }, () => debouncedBuild(label));
    } catch (err) {
      console.warn(`[dev:all] could not watch ${path}:`, err.message);
    }
  }

  console.log('[dev:all] starting vite — SPA at /, landing at /landing, api at /api, docs at /docs');
  const vite = spawn('npx', ['vite'], { cwd: repoRoot, env, stdio: 'inherit' });
  vite.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => vite.kill('SIGINT'));
  process.on('SIGTERM', () => vite.kill('SIGTERM'));
}

main();
