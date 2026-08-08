import { defineConfig, devices } from '@playwright/test'

// Acceptance smoke tests. They run against a deployed URL (a preview or the
// production site) and need no credentials: they assert the login page renders
// and that protected routes send an unauthenticated visitor to /login. Point
// them at a target with BASE_URL.
const baseURL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The pre-installed Chromium build lives here; do not download another.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
