#!/usr/bin/env node
// Capture per-page screenshots for the user docs with Playwright.
// Spawns Vite dev server, navigates each route at 1440x900, dismisses the
// cookie banner via a pre-set consent cookie, and writes PNGs into
// docs/user/screenshots/.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const CryptoJS = require('crypto-js');

// Matches src/utils/cookieEncryption.ts ENCRYPTION_KEY. The app stores
// preference flags AES-encrypted with this key; we re-encrypt here so the
// browser reads them back as already-acknowledged.
const ENCRYPTION_KEY = 'fire-calculator-secret-key-v1-2024';

function encryptPayload(obj) {
  return CryptoJS.AES.encrypt(JSON.stringify(obj), ENCRYPTION_KEY).toString();
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outDir = resolve(repoRoot, 'docs', 'user', 'screenshots');

const VIEWPORT = { width: 1440, height: 900 };
const HOST = '127.0.0.1';
const PORT = 5179;
const BASE = `http://${HOST}:${PORT}`;

const routes = [
  { slug: 'homepage',           path: '/demo/' },
  { slug: 'fire-calculator',    path: '/demo/fire-calculator' },
  { slug: 'monte-carlo',        path: '/demo/monte-carlo' },
  { slug: 'asset-allocation',   path: '/demo/asset-allocation' },
  { slug: 'expense-tracker',    path: '/demo/expense-tracker' },
  { slug: 'net-worth-tracker',  path: '/demo/net-worth-tracker' },
  { slug: 'questionnaire',      path: '/demo/questionnaire' },
  { slug: 'settings',           path: '/demo/settings' },
];

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch (err) {
  console.error('[take-screenshots] @playwright/test is not installed. Run `npm i`.');
  process.exit(1);
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 304) return;
    } catch { /* not ready */ }
    await sleep(250);
  }
  throw new Error(`Server at ${url} did not become ready in ${timeoutMs}ms`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  console.error(`[take-screenshots] starting vite dev server on ${BASE} ...`);
  const vite = spawn('npx', ['vite', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  vite.stdout.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  vite.stderr.on('data', (d) => process.stderr.write(`[vite!] ${d}`));

  const cleanup = () => { try { vite.kill('SIGTERM'); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    await waitForServer(BASE);

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });

    // Pre-accept the cookie banner so it doesn't cover the UI.
    const consent = JSON.stringify({
      version: '1',
      acknowledgedAt: new Date().toISOString(),
      cookieType: 'strictly-necessary',
    });
    await context.addCookies([
      {
        name: 'fire-tools-cookie-consent',
        value: encodeURIComponent(consent),
        url: BASE,
        sameSite: 'Strict',
      },
      // Mark the guided tour as completed so its full-screen welcome modal
      // doesn't cover every screenshot.
      {
        name: 'fire-tools-tour-completed',
        value: encodeURIComponent(encryptPayload({ completed: true })),
        url: BASE,
        sameSite: 'Strict',
      },
      // Dismiss the questionnaire prompt so it doesn't overlap CTAs.
      {
        name: 'fire-tools-questionnaire-prompt-dismissed',
        value: encodeURIComponent(encryptPayload({ dismissed: true })),
        url: BASE,
        sameSite: 'Strict',
      },
      // Dismiss the security banner so the top of the page is clean.
      {
        name: 'fire-tools-security-banner-dismissed',
        value: encodeURIComponent(encryptPayload({ dismissed: true })),
        url: BASE,
        sameSite: 'Strict',
      },
    ]);

    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('[page error]', err.message));

    for (const r of routes) {
      const url = `${BASE}${r.path}`;
      console.error(`[take-screenshots] -> ${r.slug} (${url})`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      });
      // Give charts/animations a moment to settle.
      await sleep(1500);
      // If the banner still showed up despite the cookie, dismiss it.
      try {
        const btn = await page.$('.cookie-btn-acknowledge');
        if (btn) { await btn.click(); await sleep(300); }
      } catch { /* ignore */ }
      const file = resolve(outDir, `${r.slug}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.error(`[take-screenshots]    saved ${file}`);
    }

    await context.close();
    await browser.close();
  } finally {
    cleanup();
  }

  // Add an attribution stub so the directory is committable even before
  // somebody re-runs the script (Git won't keep empty dirs).
  await writeFile(
    resolve(outDir, 'README.md'),
    '# Screenshots\n\nPNG screenshots in this folder are generated by `npm run docs:screenshots`.\nRegenerate locally after material UI changes.\n',
    'utf8',
  );
}

await main();
