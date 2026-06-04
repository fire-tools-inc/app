#!/usr/bin/env node
// Copies website/ -> dist/ (landing now sits at the site root) and publishes
// the OpenAPI contract under dist/api/ (yaml + ReDoc viewer). The SPA lives in
// dist/demo/ (vite outDir), so the two never collide.
import { cp, mkdir, access, copyFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const src = resolve(repoRoot, 'website');
// PAGES_OUT_DIR lets dev-all build into a sibling dir so we don't pollute dist/.
const outRoot = resolve(repoRoot, process.env.PAGES_OUT_DIR || 'dist');
const dest = outRoot;
const openapiSrc = resolve(repoRoot, 'docs', 'api', 'openapi.yaml');
const apiDest = resolve(outRoot, 'api');

if (!process.env.PAGES_OUT_DIR) {
  try {
    await access(outRoot);
  } catch {
    console.error('[build-landing] dist/ does not exist — run `npm run build` first.');
    process.exit(1);
  }
}
await mkdir(outRoot, { recursive: true });

await cp(src, dest, { recursive: true, filter: (s) => !s.endsWith('README.md') });
// Favicon shared across SPA, landing, docs and API viewer.
const faviconSrc = resolve(repoRoot, 'public', 'fire-icon.svg');
try {
  await copyFile(faviconSrc, resolve(dest, 'fire-icon.svg'));
} catch (err) {
  console.error(`[build-landing] warning: could not copy favicon: ${err.message}`);
}
console.error(`[build-landing] copied ${src} -> ${dest}`);

// SPA fallback for GitHub Pages: any deep link under /demo/* (e.g. shared
// /demo/fire-calculator?... URLs) would otherwise 404 because no static file
// exists at that path. GitHub Pages serves 404.html for unknown paths, so a
// copy of index.html lets the SPA boot and React Router resolves the route.
const spaIndex = resolve(outRoot, 'demo', 'index.html');
const spa404 = resolve(outRoot, 'demo', '404.html');
try {
  await copyFile(spaIndex, spa404);
  console.error(`[build-landing] wrote SPA fallback at ${spa404}`);
} catch (err) {
  console.error(`[build-landing] warning: could not write SPA 404 fallback: ${err.message}`);
}

await mkdir(apiDest, { recursive: true });
await copyFile(openapiSrc, resolve(apiDest, 'openapi.yaml'));
try {
  await copyFile(faviconSrc, resolve(apiDest, 'fire-icon.svg'));
} catch (err) {
  console.error(`[build-landing] warning: could not copy favicon to api/: ${err.message}`);
}

const redocHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fire Tools — API reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="OpenAPI 3.0 reference for the local-first Fire Tools backend." />
    <link rel="icon" type="image/svg+xml" href="./fire-icon.svg" />
    <style>
      body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <redoc spec-url="./openapi.yaml"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>
`;
await writeFile(resolve(apiDest, 'index.html'), redocHtml, 'utf8');
console.error(`[build-landing] published OpenAPI viewer at ${apiDest}`);

