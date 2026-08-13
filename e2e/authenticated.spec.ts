import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('authenticated portal', () => {
  test('loads the role home and exposes primary navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('has no automatically detectable serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual([])
  })
})
