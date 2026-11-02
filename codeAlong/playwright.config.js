import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Specs share one database and sign in as the same seeded users, so they run one at a time.
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Only the specs tagged @responsive run at phone width.
      name: 'mobile-chrome',
      grep: /@responsive/,
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm preview' : 'pnpm dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
  },
})
