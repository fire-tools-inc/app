#!/usr/bin/env node
// Copies website/ -> dist/landing/ and publishes the OpenAPI contract under
// dist/api/ (yaml + ReDoc viewer) so GitHub Pages serves it alongside the SPA.
import { cp, mkdir, access, copyFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const src = resolve(repoRoot, 'website');
// PAGES_OUT_DIR lets dev-all build into a sibling dir so we don't pollute dist/.
const outRoot = resolve(repoRoot, process.env.PAGES_OUT_DIR || 'dist');
const dest = resolve(outRoot, 'landing');
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

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true, filter: (s) => !s.endsWith('README.md') });
console.error(`[build-landing] copied ${src} -> ${dest}`);

await mkdir(apiDest, { recursive: true });
await copyFile(openapiSrc, resolve(apiDest, 'openapi.yaml'));

const redocHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fire Tools — API reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="OpenAPI 3.0 reference for the local-first Fire Tools backend." />
    <link rel="icon" href="data:," />
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

