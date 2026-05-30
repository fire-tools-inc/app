import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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
