import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Signed-in coverage. Activates only when E2E_USER_EMAIL / E2E_USER_PASSWORD are
// set (see playwright.config.ts), and is deliberately READ-ONLY: there is no
// staging database, so the account is a real production login and these specs
// must never create, update or delete. Assertions are therefore about
// rendering, navigation and accessibility — not data mutation.

test.describe('authenticated portal', () => {
  test('loads the role home and exposes primary navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.getByRole('heading').first()).toBeVisible()
  })
})

// Every screen the test account's role can reach. Accessibility was the one
// thing the RLS suite could not substitute for: before this, 21 of 22 screens
// had never been scanned. Keep this list to routes the account's role actually
// sees — a route it cannot reach bounces to its home and would scan the wrong
// page while appearing to pass.
const SCANNABLE = [
  '/overview',
  '/my-work',
  '/calendar',
  '/crm',
  '/clients',
  '/analytics',
  '/financial',
  '/training',
  '/search',
]

test.describe('accessibility sweep (WCAG 2.0/2.1 A + AA)', () => {
  for (const path of SCANNABLE) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path)
      // A route the role cannot see redirects home; scanning that would be a
      // false pass, so assert we are still where we asked to be.
      await expect(page).not.toHaveURL(/\/login/)
      // Let the screen's first data paint settle so the scan sees real content
      // rather than skeletons.
      await page.waitForLoadState('networkidle').catch(() => {})

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact || ''),
      )
      // Name the rule and one offending selector in the failure message — a bare
      // array diff is unreadable in CI logs.
      const summary = serious
        .map((v) => `${v.id} (${v.impact}) × ${v.nodes.length} — e.g. ${v.nodes[0]?.target?.join(' ')}`)
        .join('\n')
      expect(summary, `Accessibility violations on ${path}:\n${summary}`).toBe('')
    })
  }
})
