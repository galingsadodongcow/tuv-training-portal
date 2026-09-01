import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests live in src as *.test.ts. The Playwright end-to-end specs in
    // e2e/*.spec.ts are run by Playwright, not Vitest — keep Vitest from
    // collecting them (they import @playwright/test and throw at load).
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { reporter: ['text', 'json', 'html'] },
  },
})

