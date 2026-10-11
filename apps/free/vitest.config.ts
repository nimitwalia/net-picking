import { defineConfig } from 'vitest/config';

// Vitest runs only the parity tests. Playwright specs (tests/e2e/*.spec.ts) are run by Playwright.
export default defineConfig({
  test: { include: ['tests/parity/**/*.test.ts'], exclude: ['**/node_modules/**', 'tests/e2e/**', 'dist/**'] },
});
