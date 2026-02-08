import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'cd ../server && npx tsx src/index.ts',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'cd ../client && npx vite --port 4175',
      port: 4175,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
});
