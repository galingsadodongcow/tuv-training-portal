import { test, expect } from '@playwright/test'

// Credential-free acceptance smoke tests. They confirm the app is served and
// that its authentication gate works, without needing a real account. Run them
// against any deployed target: BASE_URL=https://<preview> npm run test:e2e

test.describe('public surface', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Academy Portal/i)
    await expect(page.getByText('Academy Portal')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/work email/i)).toBeVisible()
  })

  test('the root path resolves to a known screen', async ({ page }) => {
    await page.goto('/')
    // Unauthenticated, the app lands on the login screen.
    await expect(page).toHaveURL(/\/(login|home)?$/)
    await expect(page.getByText('Academy Portal')).toBeVisible()
  })
})

test.describe('auth gate', () => {
  // Every protected route must send an unauthenticated visitor to /login.
  for (const path of ['/orders', '/calendar', '/worklist', '/clients', '/data-quality']) {
    test(`${path} redirects to login when signed out`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(/\/login/, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    })
  }
})
