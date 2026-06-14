import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'),
) as {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  repository?: string | { url?: string }
  homepage?: string
}

const resolveCommitHash = (): string => {
  if (process.env.GIT_COMMIT_HASH) return process.env.GIT_COMMIT_HASH
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

// Normalize any git remote / package.json repository URL into a clean
// "https://host/owner/repo" form (no trailing .git, no git+ prefix, no SSH).
const normalizeRepoUrl = (raw: string | undefined | null): string => {
  if (!raw) return ''
  let url = raw.trim()
  if (!url) return ''
  url = url.replace(/^git\+/, '')
  // git@github.com:owner/repo(.git) -> https://github.com/owner/repo
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) url = `https://${sshMatch[1]}/${sshMatch[2]}`
  // ssh://git@host/owner/repo(.git) -> https://host/owner/repo
  url = url.replace(/^ssh:\/\/git@/, 'https://')
  url = url.replace(/\.git$/, '')
  url = url.replace(/\/+$/, '')
  return url
}

const resolveRepoUrl = (): string => {
  if (process.env.APP_REPO_URL) return normalizeRepoUrl(process.env.APP_REPO_URL)
  const fromPkg =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : pkg.repository?.url ?? pkg.homepage
  const normalized = normalizeRepoUrl(fromPkg)
  if (normalized) return normalized
  try {
    const remote = execSync('git config --get remote.origin.url', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return normalizeRepoUrl(remote)
  } catch {
    return ''
  }
}

const allDeps: Record<string, string> = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
}
const FEATURED_DEPS = [
  'react',
  'react-router-dom',
  'recharts',
  'vite',
  'typescript',
  'electron',
  'better-sqlite3',
  'express',
  'i18next',
  'js-cookie',
  'crypto-js',
] as const
const featuredDependencies: Record<string, string> = {}
for (const name of FEATURED_DEPS) {
  if (allDeps[name]) featuredDependencies[name] = allDeps[name]
}

const APP_VERSION = pkg.version ?? '0.0.0'
const APP_COMMIT_HASH = resolveCommitHash()
const APP_BUILD_TIME = process.env.BUILD_TIME ?? new Date().toISOString()
const APP_REPO_URL = resolveRepoUrl()

// Lightweight static handler used in `npm run dev:all` to serve the pre-built
// landing page (at /), OpenAPI viewer (at /api) and docs (at /docs) from a
// sibling dir under their production paths. SPA stays at /demo. Only mounted
// when DEV_PAGES_DIR is set.
function devPagesPlugin() {
  const pagesDir = process.env.DEV_PAGES_DIR
    ? resolve(process.cwd(), process.env.DEV_PAGES_DIR)
    : null;
  // Paths that Vite (or our SPA at /demo) must handle — never intercept these.
  const reservedPrefixes = ['/demo', '/@', '/src/', '/node_modules/', '/api/yahoo'];
  return {
    name: 'serve-dev-pages',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (b?: string) => void }, next: () => void) => void) => void } }) {
      if (!pagesDir) return;
      // Explicit mounts always handled here (under their prefixes).
      const explicitMounts = ['/api', '/docs'];
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.yaml': 'text/yaml; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
      };
      const serveFile = (filePath: string, res: Parameters<Parameters<typeof server.middlewares.use>[0]>[1]) => {
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        res.setHeader('content-type', mime[ext] || 'application/octet-stream');
        res.setHeader('cache-control', 'no-store');
        res.statusCode = 200;
        const stream = createReadStream(filePath);
        stream.on('error', () => { res.statusCode = 500; res.end('read error'); });
        stream.pipe(res as unknown as NodeJS.WritableStream);
      };
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const pathname = url.split('?')[0];
        if (reservedPrefixes.some((p) => pathname === p || pathname.startsWith(p === '/api/yahoo' ? p : p.endsWith('/') ? p : p + '/'))) {
          next();
          return;
        }
        const isExplicit = explicitMounts.some((m) => pathname === m || pathname.startsWith(m + '/'));
        // Landing root: serve pagesDir/index.html when hitting /.
        if (pathname === '/') {
          const indexPath = join(pagesDir, 'index.html');
          if (existsSync(indexPath)) {
            serveFile(indexPath, res);
            return;
          }
          next();
          return;
        }
        // For explicit mounts (/api, /docs) and landing-relative assets at root,
        // resolve against pagesDir; fall through otherwise so Vite can handle it.
        let filePath = join(pagesDir, pathname);
        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index.html');
        } else if (!existsSync(filePath) && existsSync(filePath + '/index.html')) {
          filePath = filePath + '/index.html';
        }
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          if (isExplicit) {
            // No match under /api or /docs — 404 is fine, but defer to Vite.
            next();
            return;
          }
          next();
          return;
        }
        serveFile(filePath, res);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    devPagesPlugin(),
    {
      name: 'handle-trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Electron dev runs vite in `--mode electron` and loads routes
          // directly (no `/demo` basename). Skip web-only path rewrites.
          if (mode === 'electron') {
            next();
            return;
          }
          // SPA lives under /demo in web builds. Normalise the calculator route
          // so URLs like /demo/fire-calculator?params resolve to /demo/fire-calculator/?params.
          if (req.url === '/demo/fire-calculator') {
            req.url = '/demo/fire-calculator/';
          } else if (req.url?.startsWith('/demo/fire-calculator?')) {
            req.url = '/demo/fire-calculator/' + req.url.slice('/demo/fire-calculator'.length);
          }
          // For plain `npm run dev` (no DEV_PAGES_DIR landing), redirect / -> /demo/
          // so opening localhost:5173 lands the developer inside the SPA.
          if (req.url === '/' && !process.env.DEV_PAGES_DIR) {
            res.statusCode = 302;
            res.setHeader('location', '/demo/');
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  // Electron build loads index.html via file:// → needs a relative base.
  // Electron dev uses the vite dev server at http://localhost:5173 → base '/'
  // so HMR + asset URLs work. Web builds: landing sits at the site root; SPA
  // lives under /demo so the landing page can market the project.
  base:
    mode === 'electron'
      ? command === 'serve'
        ? '/'
        : './'
      : mode === 'production'
      ? '/app/demo/'
      : '/demo/',
  build: {
    outDir: mode === 'electron' ? 'dist-electron' : 'dist/demo',
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT_HASH__: JSON.stringify(APP_COMMIT_HASH),
    __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME),
    __APP_DEPENDENCIES__: JSON.stringify(featuredDependencies),
    __APP_REPO_URL__: JSON.stringify(APP_REPO_URL),
  },
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; fire-tools/1.0)',
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx'],
    },
  },
}))
