# Quality, latency, and usability hardening — 2026-08-14

## Implemented

- Upgraded Next.js, React, Supabase JS, Recharts, TypeScript, and ESLint to the
  reviewed compatible versions; production dependencies report zero known
  vulnerabilities.
- Replaced dashboard full-table downloads with one RLS-scoped aggregate RPC.
- Added partial, foreign-key, and trigram indexes for the portal's hot filters,
  joins, queues, and contains searches.
- Moved schedule-year and report-period filtering into Postgres.
- Stopped hidden role/tab panels from loading data; debounced large-list search
  and protected global search from stale-response races.
- Added fail-fast public environment validation, clearer auth-profile retry
  behavior, and reduced unnecessary refetching on window focus.
- Added provider-neutral error and Web Performance telemetry. Set
  `NEXT_PUBLIC_TELEMETRY_ENDPOINT` to an HTTPS collector endpoint to forward the
  privacy-filtered events; no user, form, record ID, or query-variable data is
  included.
- Added zero-warning ESLint, TypeScript, Vitest, Playwright route-guard tests,
  WCAG A/AA automated scans, optional authenticated setup, and GitHub Actions
  quality gates.

## Verified locally

- `npm run lint`
- `npm run typecheck`
- `npm test` — 7 unit tests
- `npm run build` — 39 routes on Next.js 16.3.0
- `npm run test:e2e` — 8 Chromium tests, including accessibility
- `npm audit --omit=dev` — 0 vulnerabilities

## Live-environment checks

These require the linked Supabase project and are intentionally not guessed
from local source:

1. Apply `supabase/migrations/20260814010000_portal_performance_security_hardening.sql`
   (or the synchronized program bundle) in staging first.
2. Run Supabase Security and Performance Advisors after deployment; resolve any
   finding introduced by the live schema or data distribution.
3. Compare `explain (analyze, buffers)` for the orders/client searches and
   `select public.fn_dashboard_metrics(<active year>)` before/after indexes.
4. Configure CI secrets `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` for a
   least-privileged test account to enable signed-in browser coverage.
5. Repeat role-based smoke checks for sales, operations, management, auditor,
   and super-admin accounts because RLS behavior depends on live profile data.
