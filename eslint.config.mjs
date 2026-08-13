import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // The Supabase data layer is intentionally schema-tolerant and currently
      // ungenerated. Keep `any` available at that boundary while enforcing the
      // rest of the TypeScript and React rules.
      '@typescript-eslint/no-explicit-any': 'off',
      'react/no-unescaped-entities': 'off',
      // These React Compiler readiness rules flag established initialization
      // effects and stable row-key refs. The compiler is not enabled; retain the
      // standard Hooks correctness rules while migration happens incrementally.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'supabase/functions/**']),
])
