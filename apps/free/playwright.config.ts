import { defineConfig } from '@playwright/test';

// Playwright runs only tests/e2e/*.spec.ts (Vitest runs tests/parity/*.test.ts).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: { viewport: { width: 360, height: 800 }, browserName: 'chromium', serviceWorkers: 'allow' },
});
