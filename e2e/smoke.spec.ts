import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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

  test('login has no serious automated accessibility violations', async ({ page }) => {
    await page.goto('/login')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual([])
  })

  test('the root path resolves to a known screen', async ({ page }) => {
    await page.goto('/')
    // Unauthenticated, the app lands on the login screen.
    await expect(page).toHaveURL(/\/(login|home)?$/)
    await expect(page.getByText('Academy Portal')).toBeVisible()
  })
})

// Every route that renders a screen. The auth gate is the one thing that can be
// proven without credentials, and it is the control that matters most: no
// protected surface may render to a signed-out visitor. Previously only five
// routes were covered, which left most of the app unverified — a route added
// without a Guard would not have been caught.
const SCREEN_ROUTES = [
  '/admin', '/analytics', '/approvals', '/audit', '/calendar', '/clients',
  '/communications', '/complaints', '/courses', '/crm', '/duplicates',
  '/financial', '/my-work', '/overview', '/pricing', '/resources', '/rollover',
  '/sales-entry', '/search', '/session/new', '/team', '/training',
]

// Routes kept alive only to forward old links/bookmarks after the third-pass
// consolidation. They must still resolve (not 404/500) and must not leak the
// destination screen to a signed-out visitor.
const LEGACY_REDIRECTS = [
  '/home', '/dashboard', '/operations-today', '/elearning', '/quality',
  '/data-quality', '/reports', '/inquiries', '/quotations', '/organizations',
  '/worklist', '/orders', '/course/new',
]

test.describe('auth gate', () => {
  for (const path of SCREEN_ROUTES) {
    test(`${path} redirects to login when signed out`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(/\/login/, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    })
  }
})

test.describe('legacy redirects', () => {
  for (const path of LEGACY_REDIRECTS) {
    test(`${path} still resolves and stays gated`, async ({ page }) => {
      const res = await page.goto(path)
      // The forward itself must not be broken.
      expect(res?.status(), `${path} returned ${res?.status()}`).toBeLessThan(400)
      // And the consolidated destination is still behind the auth gate.
      await page.waitForURL(/\/login/, { timeout: 15_000 })
    })
  }
})

test.describe('resilience', () => {
  test('an unknown route does not hang or 500', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist')
    expect(res?.status()).toBeLessThan(500)
  })

  test('a malformed record id does not crash the app', async ({ page }) => {
    // A non-uuid id reaching a detail route must fail closed at the auth gate
    // rather than throwing an unhandled client exception.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/session/not-a-real-uuid')
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    expect(errors).toEqual([])
  })
})
