import { defineConfig } from '@playwright/test'

const productionUrl = 'https://mojir.github.io/dvala'
const isProduction = process.env.E2E_BASE_URL === productionUrl

export default defineConfig({
  testDir: './e2e',
  timeout: 10_000,
  retries: 0,
  // Run tests within a file in parallel. Each test gets its own page in a
  // fresh worker context, so state isolation already holds. Big win for the
  // 95-test playground.spec — without this Playwright caps at one worker per
  // file, regardless of `--workers`.
  fullyParallel: true,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:22231',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  ...(isProduction ? {} : {
    webServer: {
      command: 'npx serve docs -l 22231 -s',
      port: 22231,
      reuseExistingServer: !process.env.CI,
    },
  }),
})
