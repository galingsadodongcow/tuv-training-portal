import { defineConfig, devices } from '@playwright/test'

// Acceptance smoke tests. They run against a deployed URL (a preview or the
// production site) and need no credentials: they assert the login page renders
// and that protected routes send an unauthenticated visitor to /login. Point
// them at a target with BASE_URL.
const baseURL = process.env.BASE_URL || 'http://localhost:3000'
const authenticated = !!process.env.E2E_USER_EMAIL && !!process.env.E2E_USER_PASSWORD

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run start -- --hostname 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The pre-installed Chromium build lives here; do not download another.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/auth.setup.ts', '**/authenticated.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(authenticated ? [
      { name: 'auth-setup', testMatch: '**/auth.setup.ts' },
      {
        name: 'authenticated-chromium',
        testMatch: '**/authenticated.spec.ts',
        dependencies: ['auth-setup'],
        use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      },
    ] : []),
  ],
})
