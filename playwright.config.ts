import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:6001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:6001',
    headless: true,
  },
})
