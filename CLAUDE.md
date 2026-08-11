# CLAUDE.md — TÜV Rheinland Academy PH Training Portal

Guidance for Claude Code working in this repo. Read this before making changes.

## What this is

An internal operations portal for TÜV Rheinland Academy Philippines: training
**catalog → calendar/sessions → sales orders → fulfillment → attendance &
certificates → AR → reporting**. Single-page app, role-gated, backed entirely by
Supabase (Postgres + RLS + RPCs). Version 2.0.0.

- **Live site:** https://tuv-training-portal.netlify.app (JS shell before login).
- **Supabase project ref:** `ruwuqzwtwngpcauzbrqj`.

## Stack

- **Next.js 14 App Router** + **React 18** + **TypeScript**, client-rendered
  (`'use client'` screens; no server components hitting the DB).
- **Supabase JS** (`@supabase/supabase-js`) with the **anon key** in the browser
  bundle — so **all real access control is RLS in the database**, never the UI.
- **TanStack Query v5** for data fetching/caching.
- **Recharts** for dashboards, **Geist** font.
- **Netlify** hosting via `@netlify/plugin-nextjs` (SSR as functions). PRs get a
  deploy preview at `deploy-preview-<N>--tuv-training-portal.netlify.app`.

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build (must pass before merge)
npm start          # serve the production build on :3000
npm run test:e2e   # Playwright smoke tests (e2e/smoke.spec.ts); set BASE_URL to target
npx tsc --noEmit   # typecheck
```

- No committed ESLint config; `next.config.mjs` sets `eslint.ignoreDuringBuilds`.
- **Playwright:** a Chromium is preinstalled at `/opt/pw-browsers` but its version
  may not match the pinned `@playwright/test`. Do **not** run `playwright install`.
  Point tests at the preinstalled binary via a throwaway config
  (`launchOptions.executablePath: '/opt/pw-browsers/chromium-<v>/chrome-linux/chrome'`).
  The smoke tests need a running server: `npm start` then
  `BASE_URL=http://localhost:3000 npx playwright test`.

## Environment

`.env.local` (copy from `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Only `NEXT_PUBLIC_*` vars reach the browser. `src/lib/supabase.ts` has
placeholders so `next build` doesn't throw without env, but a real deploy needs
the real values.

## Directory map

```
src/app/(app)/**/page.tsx   Route files — thin; wrap a screen in <Guard roles=[...]>
src/app/login, page.tsx     Auth entry + root
src/screens/*.tsx           The actual pages (~32): Dashboard, Worklist, Orders,
                            SessionDetail, SalesEntry, Quotations, Reports, Admin, …
src/components/*.tsx         Shared UI: Confirm, Toast, record.tsx, ui.tsx, panels
                            (ReceivablePanel, ContactsPanel, AttachmentsPanel, …)
src/hooks/data.ts           THE data layer — every Supabase query/mutation + query keys
src/hooks/useAuth.tsx        Session + profile (role, sales_id, salesperson)
src/lib/roles.ts             Role type, NAV list, per-route role gates
src/lib/{supabase,format,labels,pax,orderState,csv,activity}.ts
supabase/migrations/*.sql    Ordered DB migrations (source of truth for schema)
supabase/schema.sql          Best-effort reconstruction (see caveat below) — NOT runnable as-is
supabase/seed/rebuild_2026_full.sql   Full sample dataset (truncates + repopulates)
supabase/bundles/            Concatenated migration bundle (generated)
supabase/functions/          Edge functions: send-comms, nightly-hygiene, weekly-digest
.github/workflows/apply-supabase.yml  Applies migrations/seed to the DB from CI
docs/qa/                     QA reports (role matrix, audit, fix plan, verifications)
e2e/smoke.spec.ts            Credential-free acceptance smoke tests
```

## Roles & access model

Roles are the `user_role` enum: **`super_admin`, `operations`, `business_owner`,
`sales`** (there is no trainer login — ops manage the trainer pool). Two layers:

1. **UI gate** — `src/components/Guard.tsx` + the `NAV` list in `src/lib/roles.ts`
   decide which routes/nav a role sees. **This is cosmetic only.**
2. **RLS (authoritative)** — every table has policies keyed on SQL helpers:
   `fn_current_role()`, `fn_current_sales_id()`, `fn_current_team()`,
   `fn_current_region()`, `fn_is_supervisor()`, and `fn_can_see_order(order_id)`.
   Sales see their own + team orders (supervisors: region); ops/BO/super_admin see
   all. Child tables (`order_line`, `participant`, `invoice`, `payment`) are
   scoped to their order's visibility via `fn_can_see_order`.

**A UI-only block with a permissive DB policy is a bug.** When you add or change a
write path, add/verify the matching RLS policy. RLS must be *enabled* on the table
(a policy on a table with row security OFF is inert — see
`20260808310000_enable_rls_all`, which fixed exactly that class of hole).

## Data-layer conventions (`src/hooks/data.ts`)

- All reads/writes go through hooks here; screens don't call `supabase` ad hoc
  except for simple mutations.
- Helpers: `sel(query)` / `okOr(query, fallback)` run a query and either throw or
  degrade to a fallback (used so the UI survives a migration not yet applied).
- **Graceful degradation / strip-and-retry:** mutations that write newer columns
  catch the missing-column error (Postgres `42703`) and retry without them, so the
  app works whether or not the latest migration is live. Keep this pattern.
- After a mutation, invalidate the relevant query keys (`useInvalidate`).

## UI conventions (enforced by the QA pass)

- **Destructive actions** (delete/cancel/refund) go through the promise-based
  `useConfirm()` dialog (`tone: 'danger'`, optional reason) — never a bare click
  or `window.prompt`.
- Every list/panel handles **loading, error (`<ErrorNote>`), and empty** states —
  don't let a failed fetch render as "no data".
- Tables that aren't a direct `.card > table` child get a `.scroll-x` wrapper so
  they scroll on narrow screens.
- Inputs/selects need an associated label or `aria-label`; icon-only buttons need
  an accessible name; modals need `role="dialog" aria-modal` + Escape.
- Prefer the shared primitives in `record.tsx` / `ui.tsx` and the existing CSS
  tokens in `src/app/globals.css`.

## Database / migrations — the important rules

- **Every DB change is a migration file** in `supabase/migrations/`, named
  `YYYYMMDDHHMMSS_description.sql`, **idempotent** (`create or replace`,
  `... if not exists`, `drop policy if exists` then `create`).
- **Apply changes through `.github/workflows/apply-supabase.yml`** (needs the
  `SUPABASE_DB_URL` repo secret). **Do NOT hand-paste bundles** into the SQL
  editor — that manual path is what caused the drift below and hid two live
  security holes.
- **⚠️ Repo ↔ live DB drift:** the repo carries 30 migrations but the live
  migration ledger has historically recorded far fewer; much hardening reached the
  DB through manual pastes. **Never trust "fixed in the repo."** Before believing
  an RLS/grant claim, verify against the live DB by simulating as `anon` and as two
  different sales reps, and run the Supabase advisor.
- `supabase/schema.sql` is a **best-effort reconstruction** — it omits `enable row
  level security` statements, some functions lack trailing `;`, and it mixes CRLF.
  It is documentation, **not runnable as-is**. `audit_log` and some digest views
  exist only on the DB, not in any pre-`20260809` migration.
- **Enum gotcha:** a `CASE` of text literals is typed `text`, and `text → enum`
  has no implicit assignment cast. Assigning it to an enum column raises `42804`
  (bit us in `fn_ar_recompute`). Cast explicitly: `(... case ... end)::my_enum_t`.
  Likewise compare an enum to a text param as `col::text = p_param`.

## Sample data

`supabase/seed/rebuild_2026_full.sql` — **destructive**: truncates the
transactional tables and rebuilds a large 2026 dataset (real catalog, ~160
sessions each backed by a real order line so fill counts are genuine, ~1,200
participants with attendance + certificates, AR, quotes, feedback, complaints,
multi-country orders). Keeps `profiles` / `salesperson` / `auth.users`. Runs as
DB owner (bypasses RLS). Validate seed/migration SQL locally against a throwaway
Postgres before applying (this is how the enum/cast bugs were caught).

## Pax rules

`fn_enforce_pax` (trigger on `schedule`) currently forces `min_participants = 8`
and derives `max_participants` from the course (`course.max_pax`, else 10 for
certification courses / 20 otherwise). Whether max should be per-session vs.
course-derived is an **open decision** — see the two draft migrations
`20260809020000_pax_option_a_course_derived` and `20260809030000_pax_option_b_per_session`
(exactly one to be applied; do not apply both).

## Workflow expectations

- Branch, build, verify (tsc + `npm run build` + smoke tests where relevant),
  then open a PR. The Netlify deploy preview turning green is the CI signal (no
  other checks run).
- DB-affecting work: write the migration, validate on a local Postgres, and apply
  via the workflow — then re-simulate RLS as anon/sales before calling it done.
- Don't push to a shared branch without the owner's review when asked to gate it.
