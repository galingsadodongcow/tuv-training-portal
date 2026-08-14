import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
})
