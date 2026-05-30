#!/usr/bin/env node
// Renders docs/user/*.md and docs/engineering/*.md into dist/docs/{user,engineering}/*.html
// using marked + a shared HTML template. Copies docs/user/screenshots/ across so
// embedded images resolve when the site is served from GitHub Pages.
import { readdir, readFile, writeFile, mkdir, cp, access, copyFile } from 'node:fs/promises';
import { dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const docsRoot = resolve(repoRoot, 'docs');
// PAGES_OUT_DIR mirrors the override used by build-landing.mjs so `npm run dev:all`
// can stage everything into .dev-pages/ instead of dist/.
const distRoot = resolve(repoRoot, process.env.PAGES_OUT_DIR || 'dist');
const distDocs = resolve(distRoot, 'docs');
const websiteDir = resolve(repoRoot, 'website');

const sections = [
  {
    id: 'user',
    title: 'User guide',
    src: resolve(docsRoot, 'user'),
    dest: resolve(distDocs, 'user'),
  },
  {
    id: 'engineering',
    title: 'Engineering docs',
    src: resolve(docsRoot, 'engineering'),
    dest: resolve(distDocs, 'engineering'),
  },
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

function slugFor(file) {
  const name = basename(file, extname(file));
  return name.toLowerCase() === 'readme' ? 'index' : name.toLowerCase();
}

function prettyTitle(slug) {
  if (slug === 'index') return 'Overview';
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Rewrite intra-doc markdown links (./foo.md, ./README.md) -> rendered HTML neighbours.
marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      let target = href;
      if (target && !/^[a-z]+:\/\//i.test(target) && !target.startsWith('#')) {
        target = target.replace(/(^|\/)README\.md(#|$)/i, '$1index.html$2');
        target = target.replace(/\.md(#|$)/i, '.html$1');
      }
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${target}"${titleAttr}>${text}</a>`;
    },
  },
});

function pageHtml({ section, slug, html, pages, siblingSection }) {
  const title = pages.find((p) => p.slug === slug)?.title ?? prettyTitle(slug);
  const sidebar = pages
    .map((p) => {
      const href = p.slug === 'index' ? './' : `./${p.slug}.html`;
      const current = p.slug === slug ? ' aria-current="page"' : '';
      return `<li><a href="${href}"${current}>${p.title}</a></li>`;
    })
    .join('\n        ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Fire Tools ${section.title}</title>
    <meta name="description" content="${title} — Fire Tools ${section.title}" />
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="../styles.css" />
    <link rel="stylesheet" href="../docs.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="../../landing/">Fire Tools</a>
      <nav>
        <a href="../user/">User docs</a>
        <a href="../engineering/">Engineering docs</a>
        <a href="../../api/">API reference</a>
        <a href="https://github.com/mbianchidev/fire-tools" target="_blank" rel="noopener">GitHub</a>
        <a class="cta" href="../../">Open the app</a>
      </nav>
    </header>
    <div class="docs-shell">
      <aside class="docs-sidebar">
        <h2>${section.title}</h2>
        <ul>
        ${sidebar}
        </ul>
        <h2 style="margin-top:1.5rem">Also see</h2>
        <ul>
          <li><a href="../${siblingSection.id}/">${siblingSection.title}</a></li>
          <li><a href="../../api/">API reference</a></li>
          <li><a href="../../landing/">Landing</a></li>
        </ul>
      </aside>
      <article class="docs-content">
        <nav class="docs-breadcrumb"><a href="../../landing/">Home</a> &rsaquo; <a href="./">${section.title}</a></nav>
        ${html}
      </article>
    </div>
  </body>
</html>
`;
}

async function buildSection(section, allSections) {
  if (!(await exists(section.src))) {
    console.error(`[build-docs] skipping ${section.id}: ${section.src} does not exist`);
    return;
  }
  const entries = await readdir(section.src, { withFileTypes: true });
  const markdownFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name);

  await mkdir(section.dest, { recursive: true });

  // Gather titles up front so the sidebar can list every page.
  const pages = [];
  for (const file of markdownFiles) {
    const slug = slugFor(file);
    const raw = await readFile(resolve(section.src, file), 'utf8');
    const firstHeading = raw.match(/^#\s+(.+)$/m);
    const title = firstHeading ? firstHeading[1].trim() : prettyTitle(slug);
    pages.push({ slug, title, file, raw });
  }
  // index always first, then alphabetical
  pages.sort((a, b) => {
    if (a.slug === 'index') return -1;
    if (b.slug === 'index') return 1;
    return a.title.localeCompare(b.title);
  });

  const siblingSection = allSections.find((s) => s.id !== section.id);

  for (const page of pages) {
    const html = marked.parse(page.raw);
    const out = pageHtml({ section, slug: page.slug, html, pages, siblingSection });
    const outName = page.slug === 'index' ? 'index.html' : `${page.slug}.html`;
    await writeFile(resolve(section.dest, outName), out, 'utf8');
  }

  // Copy any screenshots/ folder verbatim so relative ./screenshots/foo.png works.
  const shotsSrc = resolve(section.src, 'screenshots');
  if (await exists(shotsSrc)) {
    const shotsDest = resolve(section.dest, 'screenshots');
    await cp(shotsSrc, shotsDest, { recursive: true });
  }

  console.error(`[build-docs] rendered ${pages.length} pages -> ${section.dest}`);
}

export async function buildDocs() {
  if (!process.env.PAGES_OUT_DIR && !(await exists(distRoot))) {
    console.error('[build-docs] dist/ does not exist — run `npm run build` first.');
    process.exit(1);
  }
  await mkdir(distRoot, { recursive: true });
  await mkdir(distDocs, { recursive: true });

  // Shared stylesheets live one level above each section, so /docs/styles.css.
  await copyFile(resolve(websiteDir, 'styles.css'), resolve(distDocs, 'styles.css'));
  await copyFile(resolve(websiteDir, 'docs.css'), resolve(distDocs, 'docs.css'));

  for (const section of sections) {
    await buildSection(section, sections);
  }

  // Top-level /docs/ landing page so the path resolves on its own.
  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Documentation — Fire Tools</title>
    <link rel="stylesheet" href="./styles.css" />
    <link rel="stylesheet" href="./docs.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="../landing/">Fire Tools</a>
      <nav>
        <a href="./user/">User docs</a>
        <a href="./engineering/">Engineering docs</a>
        <a href="../api/">API reference</a>
        <a href="https://github.com/mbianchidev/fire-tools" target="_blank" rel="noopener">GitHub</a>
        <a class="cta" href="../">Open the app</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <h1>Documentation</h1>
        <p>Two flavours: end-user guides and engineering references.</p>
      </section>
      <section class="features">
        <article class="feature">
          <h3><a href="./user/">User guide</a></h3>
          <p>Walkthroughs of every tool in the app, with screenshots.</p>
        </article>
        <article class="feature">
          <h3><a href="./engineering/">Engineering docs</a></h3>
          <p>Backend deploy, API contract, database schema and migrations.</p>
        </article>
      </section>
    </main>
  </body>
</html>
`;
  await writeFile(resolve(distDocs, 'index.html'), indexHtml, 'utf8');
  console.error(`[build-docs] wrote docs index at ${resolve(distDocs, 'index.html')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildDocs();
}
