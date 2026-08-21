# Claude Code handover — TÜV Training Portal

Date: 2026-08-15 (Asia/Manila)

Repository: `C:\Users\Alan\OneDrive\Documents\GitHub\tuv-training-portal`

Branch: `main`

Baseline commit: `34d9d5a codex review for latency and UX`
Remote state at handover: `HEAD`, `origin/main`, and `origin/HEAD` all pointed to `34d9d5a`.

## Mission and current state

The recent task was a full QA review followed by implementation of the identified
latency, usability, security, dependency, observability, and testing improvements.
The code changes are complete, committed, and pushed. The remaining work is
primarily live-environment validation and deployment, which requires Supabase
project access and test-user credentials.

Before doing anything, run:

```powershell
git status --short
git log -1 --oneline --decorate
npm ci
```

Do not assume the database migration has been applied merely because it is on
`main`. It was intentionally left undeployed pending staging validation.

## Technology baseline after the update

- Next.js `16.3.0` using Turbopack
- React / React DOM `19.2.8`
- Supabase JS `2.112.3`
- Recharts `3.10.1`
- TypeScript `5.9.3`
- ESLint `9.39.5` with `eslint-config-next` `16.3.0`
- Vitest `4.1.10`
- Playwright, Testing Library, JSDOM, and axe accessibility testing
- Node 22 in GitHub Actions; the final local verification used Node 24.18.0

The project scripts are:

```text
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run check       # lint + typecheck + unit tests + production build
```

## What changed

### 1. Framework, dependencies, and build quality

- Upgraded Next.js, React, Supabase JS, Recharts, TypeScript, ESLint, and types.
- Replaced the legacy ESLint setup with `eslint.config.mjs` and enforced zero
  warnings through `eslint . --max-warnings=0`.
- Removed `eslint.ignoreDuringBuilds` from `next.config.mjs`; lint is now an
  explicit quality gate instead of being bypassed.
- Next.js updated `tsconfig.json` to `jsx: react-jsx` and included
  `.next/dev/types/**/*.ts`.
- `npm audit --omit=dev` returned zero known production vulnerabilities.

Primary files:

- `package.json`, `package-lock.json`
- `eslint.config.mjs`
- `next.config.mjs`
- `tsconfig.json`
- `.github/workflows/quality.yml`

Note: `tsconfig.tsbuildinfo` is tracked and changed in the commit. It is a
generated incremental-build artifact; a future cleanup may choose to stop
tracking it, but do not remove it as part of unrelated work without checking the
repository convention.

### 2. Dashboard latency

Previously the dashboard downloaded many complete tables/views and performed
counts and sums in the browser. It now makes one RLS-scoped aggregate RPC call:

```text
public.fn_dashboard_metrics(p_year integer) -> jsonb
```

The function returns queue, session, approvals, duplicates, SLA, certificates,
receivables, pipeline, revenue, channel, monthly, and governance aggregates.
It is `security invoker`, has an empty `search_path`, revokes access from
`public`/`anon`, and grants execution only to `authenticated`.

Primary files:

- `src/screens/Dashboard.tsx`
- `src/hooks/data.ts` (`useDashboardMetrics`)
- `supabase/migrations/20260814010000_portal_performance_security_hardening.sql`

### 3. Query and database performance

The new migration adds focused indexes for:

- active orders by date, stage/age, and client
- order assignments, order lines, and participants
- inquiries by salesperson/status
- pending approvals and open duplicate candidates
- audit timestamps
- unread notifications and open tasks
- trigram search on client company/name/email and order/SAP identifiers

Other query changes include:

- schedule year filtering is now executed by PostgREST/Postgres instead of
  downloading all schedules and filtering in React
- report revenue and profitability month ranges are pushed into Postgres
- hidden tabs and role-inapplicable panels use React Query's `enabled` option
- orders and clients use server-side paging/filtering and debounced search
- React Query no longer refetches every query when the browser regains focus

### 4. Usability and accessibility

- Added an atomic URL-parameter helper so multiple filter changes from one user
  action cannot overwrite each other: `src/lib/urlParams.ts`.
- Debounced Orders and Clients searches.
- Protected Command Palette and full-page search from stale asynchronous
  responses replacing newer results.
- Added a real `Searching…` live state to the Command Palette.
- Improved auth/profile failure messages and retry behavior.
- Added fail-fast validation for required public Supabase environment values.
- Fixed lint and accessibility findings across sortable tables, navigation,
  forms, and screen components.

Relevant files:

- `src/components/CommandPalette.tsx`
- `src/screens/Search.tsx`
- `src/screens/Orders.tsx`
- `src/screens/Clients.tsx`
- `src/screens/Calendar.tsx`
- `src/hooks/useAuth.tsx`
- `src/lib/supabase.ts`

### 5. Observability

Provider-neutral browser telemetry was added without introducing a vendor SDK.
It captures:

- global errors and unhandled promise rejections
- app and root error-boundary failures
- React Query query and mutation errors
- DOM interactive timing
- Largest Contentful Paint
- long tasks

Payloads intentionally omit identity, record IDs, form values, and query
variables. Without configuration they are logged only in development. To send
events to a collector, configure:

```text
NEXT_PUBLIC_TELEMETRY_ENDPOINT=https://your-collector.example/events
```

Primary files:

- `src/lib/telemetry.ts`
- `src/components/Observability.tsx`
- `src/app/providers.tsx`
- `src/app/(app)/error.tsx`
- `src/app/global-error.tsx`

### 6. Automated QA and CI

Added unit tests for URL state, order-state logic, and the shared attention
scale. Added public Playwright tests for the login screen and protected-route
redirects, plus axe WCAG A/AA scanning.

Authenticated test scaffolding is present but activates only when both of these
are set:

```text
E2E_USER_EMAIL
E2E_USER_PASSWORD
```

Files:

- `vitest.config.mts`, `vitest.setup.ts`
- `src/lib/urlParams.test.ts`
- `src/lib/orderState.test.ts`
- `src/lib/health.test.ts`
- `playwright.config.ts`
- `e2e/smoke.spec.ts`
- `e2e/auth.setup.ts`
- `e2e/authenticated.spec.ts`
- `.github/workflows/quality.yml`

Important CI detail: the current GitHub Actions workflow runs public tests with
placeholder Supabase values. It does **not** currently pass the authenticated
test secrets or a real staging URL. Merely creating repository secrets will not
activate authenticated CI coverage; update the browser job environment and use
a staging deployment before enabling it.

## Validation evidence from the completed task

The following passed immediately before commit/handover:

```text
npm run lint       zero warnings
npm run typecheck  passed
npm test           3 files, 7 tests passed
npm run build      39 routes compiled successfully
npm run test:e2e   8 Chromium tests passed
npm audit --omit=dev  0 vulnerabilities
git diff --check   passed
migration parity   passed
```

The Playwright run included an automated serious/critical WCAG A/AA scan of the
login surface. Authenticated tests were not executed because credentials were
not provided.

## Supabase deployment handoff

Use the Supabase instructions and Postgres best practices when touching this
area. The migration to apply is:

```text
supabase/migrations/20260814010000_portal_performance_security_hardening.sql
```

The deployment bundle was also synchronized:

```text
supabase/bundles/2026_program_all_migrations.sql
```

The bundle contains an early disabled/commented copy and a later active compact
copy of the new migration because dependency ordering had to be preserved. Do
not uncomment the early copy. If cleaning the bundle, preserve the filename
marker required by `.github/workflows/migration-parity.yml`, retain exactly one
active copy after all referenced columns/views exist, and re-run parity checks.

The Supabase CLI could not scaffold this migration locally. The repository has
a legacy `supabase/` directory without `supabase/config.toml`, and
`npx supabase init` / `npx supabase migration new` failed on Windows with an
`AlreadyExists` error. The migration was therefore created manually following
the existing timestamp convention. Do not blindly reinitialize or overwrite the
existing Supabase directory.

### Required staging sequence

1. Confirm the target project and take/review the normal database backup or
   point-in-time recovery posture.
2. Apply the migration to staging.
3. Confirm `pg_trgm` is available in the `extensions` schema.
4. Call `select public.fn_dashboard_metrics(<active year>);` as representative
   authenticated roles and confirm RLS-scoped results.
5. Open Dashboard for sales, operations, management, auditor, business owner,
   coordinator, sales manager, and super-admin roles.
6. Run Supabase Security Advisor and Performance Advisor.
7. Run `explain (analyze, buffers)` for representative orders/client searches
   and the dashboard function using realistic data volumes.
8. Check index build impact and query latency before promoting to production.
9. Apply the same reviewed migration to production and monitor errors/latency.

### Security notes

- The repository already includes migrations that set reporting views to
  `security_invoker`, lock function search paths, and revoke anonymous execution
  from sensitive RPCs.
- The new dashboard function follows those conventions.
- A source-only audit cannot prove the live database has every migration or no
  drift. Treat the live Supabase advisors and catalog inspection as mandatory.
- Do not broadly change existing `security definer` functions to invoker mode;
  many are intentionally used for guarded workflows and triggers. Review their
  internal role checks, grants, and search paths function by function.

## Priority next actions for Claude Code

### P0 — staging/database verification

- Verify the current live/staging migration state.
- Apply and test the performance/security migration in staging.
- Run Security and Performance Advisors.
- Verify role-specific dashboard metrics and RLS boundaries.
- Record before/after latency measurements and query plans.

### P1 — authenticated browser coverage

- Create or identify a least-privileged staging test account.
- Run the existing authenticated Playwright project locally.
- Expand it to role-by-role read-only smoke tests.
- Wire a real staging `BASE_URL` and protected credentials into CI.
- Never run destructive production flows from browser tests.

### P1 — observability destination

- Choose the approved telemetry collector.
- Configure `NEXT_PUBLIC_TELEMETRY_ENDPOINT` in staging.
- Confirm CORS, retention, redaction, alert routing, and sampling.
- Validate that payloads remain free of customer/user data.

### P2 — performance follow-through

- Capture browser network waterfalls for Dashboard, Orders, Clients, Calendar,
  Reports, and global search with production-like data.
- Confirm the dashboard issues one aggregate RPC after active-year resolution.
- Check slow-query logs after index deployment.
- Add regression thresholds only after establishing a stable baseline.

### P2 — repository hygiene

- Decide whether `tsconfig.tsbuildinfo` should remain tracked.
- Consider consolidating the disabled/active migration copies in the program
  bundle once deployment tooling is clarified.
- Keep `package-lock.json` aligned with `package.json`; use `npm ci` in CI.

## Environment and operational cautions

- Required application variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- Optional variables:

```text
NEXT_PUBLIC_TELEMETRY_ENDPOINT
BASE_URL
PLAYWRIGHT_CHROMIUM_PATH
E2E_USER_EMAIL
E2E_USER_PASSWORD
```

- Placeholder Supabase values are sufficient for build and unauthenticated
  route-guard tests, but not for data, RLS, auth, or migration validation.
- Preserve user changes if the worktree is no longer clean when you begin.
- Do not reformat or rewrite the large SQL bundle casually; migration parity and
  dependency order matter.
- Do not expose test credentials in commits, test artifacts, traces, or logs.

## Recommended first prompt/action for the next agent

> Read this handover and `docs/qa/2026-08-14-quality-hardening.md`. Verify git
> status and commit `34d9d5a`. Do not modify code yet. First inspect the target
> Supabase migration state and report whether the new hardening migration is
> already applied, whether Security/Performance Advisors are clean, and what is
> required to run authenticated Playwright tests against staging.
