import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, statSync, createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'

// Lightweight static handler used in `npm run dev:all` to serve the pre-built
// landing page, OpenAPI viewer and docs from a sibling dir under their
// production paths. Only mounted when DEV_PAGES_DIR is set.
function devPagesPlugin() {
  const pagesDir = process.env.DEV_PAGES_DIR
    ? resolve(process.cwd(), process.env.DEV_PAGES_DIR)
    : null;
  return {
    name: 'serve-dev-pages',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (b?: string) => void }, next: () => void) => void) => void } }) {
      if (!pagesDir) return;
      const mounts = ['/landing', '/api', '/docs'];
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
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const pathname = url.split('?')[0];
        if (!mounts.some((m) => pathname === m || pathname.startsWith(m + '/'))) {
          next();
          return;
        }
        // Strip query string and resolve against pagesDir; pagesDir is project-relative.
        let filePath = join(pagesDir, pathname);
        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index.html');
        } else if (!existsSync(filePath) && existsSync(filePath + '/index.html')) {
          filePath = filePath + '/index.html';
        }
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          next();
          return;
        }
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        res.setHeader('content-type', mime[ext] || 'application/octet-stream');
        res.setHeader('cache-control', 'no-store');
        res.statusCode = 200;
        const stream = createReadStream(filePath);
        stream.on('error', () => { res.statusCode = 500; res.end('read error'); });
        stream.pipe(res as unknown as NodeJS.WritableStream);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    devPagesPlugin(),
    {
      name: 'handle-trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Handle /fire-calculator?params by rewriting to /fire-calculator/?params
          // Only process exact /fire-calculator or /fire-calculator? paths
          if (req.url === '/fire-calculator') {
            req.url = '/fire-calculator/';
          } else if (req.url?.startsWith('/fire-calculator?')) {
            req.url = '/fire-calculator/' + req.url.slice('/fire-calculator'.length);
          }
          next();
        });
      },
    },
  ],
  // Electron loads index.html via file://, so it needs a relative base.
  // Production web build keeps /fire-tools/ for GitHub Pages.
  base: mode === 'electron' ? './' : mode === 'production' ? '/fire-tools/' : '/',
  build: {
    outDir: mode === 'electron' ? 'dist-electron' : 'dist',
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
