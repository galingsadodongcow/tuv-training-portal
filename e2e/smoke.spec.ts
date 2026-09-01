import { expect, test } from '@playwright/test'

// These end-to-end tests require the local Supabase stack and dev server from the
// Cloud Agent environment (see .cursor/README.md). Run with `pnpm test:e2e`.

test.describe('unauthenticated access', () => {
  test('the root route redirects to the login page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to Academy Portal' })).toBeVisible()
  })

  test('the login page renders the sign-in form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('a protected route is redirected to login when signed out', async ({ page }) => {
    await page.goto('/customers')
    await expect(page).toHaveURL(/\/login$/)
  })
})
