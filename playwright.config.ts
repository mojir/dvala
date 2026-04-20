import { defineConfig } from '@playwright/test'

const productionUrl = 'https://mojir.github.io/dvala'
const isProduction = process.env.E2E_BASE_URL === productionUrl

export default defineConfig({
  testDir: './e2e',
  timeout: 10_000,
  retries: 0,
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
