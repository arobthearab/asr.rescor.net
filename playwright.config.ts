import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w api',
      port: 3100,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      command: 'VITE_DEV_BYPASS_AUTH=true npm run dev -w frontend -- --port 5175',
      port: 5175,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
