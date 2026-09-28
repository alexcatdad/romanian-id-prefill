import { defineConfig, devices } from '@playwright/test';

const base = process.env.PAGES_BASE_PATH || '/';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  reporter: 'list',
  outputDir: process.env.QA_OUTPUT_DIR || 'test-results',
  use: { baseURL: `http://127.0.0.1:4173${base}`, locale: 'en-GB', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 1024 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 960 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 960 } } },
  ],
  webServer: { command: 'npm start', url: `http://127.0.0.1:4173${base}`, reuseExistingServer: !process.env.CI, timeout: 15000 },
});
