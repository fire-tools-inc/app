import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5188/demo/',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm --prefix server run build && npm run build:self-hosted && npx vite preview --mode self-hosted --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188/demo/',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 3000 },
  },
});
