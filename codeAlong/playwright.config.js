import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Specs share one database and sign in as the same seeded users, so they run one at a time.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  // several browsers per test, and the first run also starts the Edge Functions
  timeout: 60 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    // a click or fill on something that never shows fails here, not at the end of a long journey
    actionTimeout: 15 * 1000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // everything except the phone-width journeys
      name: 'desktop-chrome',
      grepInvert: /@responsive/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Only the specs tagged @responsive run at phone width, and only here.
      name: 'mobile-chrome',
      grep: /@responsive/,
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
    },
  ],
  webServer: [
    {
      command: process.env.CI ? 'pnpm preview' : 'pnpm dev',
      port: process.env.CI ? 4173 : 5173,
      reuseExistingServer: !process.env.CI,
    },
    {
      // The Edge Functions, with Telegram / GitHub / LLM calls going to test_outbox instead.
      // Any answer from the gateway (even 401) means they are up.
      command: 'pnpm exec supabase functions serve --env-file e2e/functions.env',
      url: 'http://127.0.0.1:54321/functions/v1/telegram-notify',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
