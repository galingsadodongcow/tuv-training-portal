import { expect, test } from '@playwright/test'

// Demo credentials seeded by the local environment (.cursor/local-supabase/setup.sh).
const ADMIN_EMAIL = process.env.ACADEMY_ADMIN_EMAIL ?? 'alanclifford.filart@tuv.com'
const ADMIN_PASSWORD = process.env.ACADEMY_DEV_PASSWORD ?? 'portaldev123'

test('an administrator can sign in and see real data', async ({ page }) => {
  await page.goto('/login')

  await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Landing on any authenticated page shows the app shell with a Sign out control
  // and the signed-in administrator's name.
  await expect(page).not.toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('banner').getByText('Alan Clifford Filart')).toBeVisible()

  // The customers area loads real sample data from the backend.
  await page.goto('/customers')
  await expect(page.getByText(/Acme Manufacturing/)).toBeVisible()
})

test('invalid credentials are rejected', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[name="password"]').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText(/incorrect/i)).toBeVisible()
})
