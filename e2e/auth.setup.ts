import { test as setup, expect } from '@playwright/test'
import path from 'node:path'

const authFile = path.join(process.cwd(), 'e2e', '.auth', 'user.json')

setup('authenticate test account', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/work email/i).fill(process.env.E2E_USER_EMAIL!)
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_PASSWORD!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
  await page.context().storageState({ path: authFile })
})
