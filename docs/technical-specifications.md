# Technical Specifications & Requirements — TÜV Rheinland Academy PH Training Portal

**Version:** 2.0.0 · **Date:** 2026-08-30 · **Status:** As-built specification of
the deployed system.

This document specifies the system **as it exists in production** — every count
below was taken from the live database and the repository, not from a design
document. It complements, and does not replace:

| Document | Answers |
|---|---|
| `docs/project-charter.md` | Why the system exists |
| `docs/qa-exhaustive/` | What was audited and found |
| `docs/01–05-*.md` (RFC, PR #179) | A *proposed clean replacement* — a future-state proposal, not this system |
| **This document** | What the current system is and must do |

Requirement IDs: `FR-` functional, `NFR-` non-functional, `SEC-` security,
`DAT-` data, `INT-` integration, `OPS-` operational. **Shall** = mandatory and
implemented unless marked ⚠️ (known gap).

---

## 1. System overview

A single-page, role-gated internal operations portal covering the training
business end to end: catalogue → calendar/sessions → sales orders → fulfilment
→ attendance & certificates → receivables → reporting.

| Property | Value |
|---|---|
| Production URL | https://tuv-training-portal.netlify.app |
| Backend | Supabase project `ruwuqzwtwngpcauzbrqj` ("A02 Academy Hub"), region ap-south-1 |
| Database | PostgreSQL **17.6** |
| System of record for money | **SAP** (external). The portal stores `sap_order_no` as a reference only |
| Markets | `country_t = PH \| ID` (Philippines primary, Indonesia modelled) |
| Live scale (2026 book) | 163 orders · 161 sessions · 28 customers · 7 salespeople · 6 trainers · 5 venues |

## 2. Technology stack (exact, from `package.json` / live DB)

**Runtime:** Next.js **16.3.0** (App Router, Turbopack) · React **19.2.8** ·
TypeScript **5.9.3** · `@supabase/supabase-js` **2.112.3** · TanStack Query
**^5.51** · Recharts **3.10.1** · Geist font.

**Quality tooling:** ESLint **9.39.5** (`--max-warnings=0`) ·
Vitest **^4.1** · Playwright **^1.49** + `@axe-core/playwright` **^4.13** ·
Testing Library (installed; not yet used).

**Hosting:** Netlify via `@netlify/plugin-nextjs` (SSR as functions); deploy
preview per PR. **CI:** GitHub Actions, Node 22.

**Scripts:** `dev · build · start · lint · typecheck · test · test:e2e · check`.

## 3. Architecture requirements

- **AR-1** The application **shall** be client-rendered (`'use client'` screens);
  no server component may hold privileged credentials. The browser bundle
  carries only `NEXT_PUBLIC_SUPABASE_URL` and the **anon key**.
- **AR-2 (governing constraint)** Because the anon key is public, **all real
  access control shall live in the database** (RLS + `SECURITY DEFINER`
  functions). Any UI gate is presentation only; a UI-only block over a
  permissive policy is a defect by definition.
- **AR-3** All reads/writes **shall** go through the data layer
  (`src/hooks/data.ts`, TanStack Query); screens do not call Supabase ad hoc
  except simple mutations.
- **AR-4** Mutations that write columns introduced by newer migrations **shall**
  catch Postgres `42703` and retry without them (graceful degradation), so the
  deployed app works whether or not the latest migration is live.
- **AR-5** Filterable surfaces **shall** keep filter state in the URL, applied
  atomically (`src/lib/urlParams.ts`), so views are shareable and reloadable.
- **AR-6** Route access is expressed twice: a `NAV` list + `<Guard>` per route
  (cosmetic) and RLS (authoritative). ⚠️ Five detail routes carry no Guard
  (`/crm`, `/clients`, `/clients/[id]`, `/orders/[id]`, `/session/[id]`); data
  is correctly RLS-scoped (backlog NEXT-4).

## 4. Data model (live inventory)

| Object class | Count |
|---|---|
| Tables (`public`) | **54** |
| Views | **30** — all `security_invoker = true` |
| Functions | **96**, of which **84** `SECURITY DEFINER` |
| RLS policies | **133** across **53** tables |
| Enum types | **25** |
| Triggers (non-internal) | **49** |
| Migrations in repo | 70, ordered `YYYYMMDDHHMMSS_*`, idempotent |

**Core transactional entities:** `orders`, `order_line`, `order_assignment`,
`order_note`, `order_disposition`, `participant`, `schedule`, `client`,
`contact`, `organization`, `inquiry`, `quote`/`quote_line`, `payment`,
`refund`, `credit_note`, `invoice`.
**Master data:** `course` (+ `category`/`subcategory` hierarchy, `course_fee`
per modality), `trainer`, `trainer_course`, `venue`, `salesperson`, `profiles`,
`calendar_year`, `discount_rule`, `conversion_rate`, `webshop_product`.
**Governance:** `approval`, `duplicate_candidate`, `task`, `notification`,
`audit_log`, `saved_view`, `attribution`, `assignment_log`, `session_note`,
`session_trainer`, `feedback`, `complaint`, `escalation_rule`.

**Key enums (live values):**

| Enum | Values |
|---|---|
| `user_role` | super_admin · operations · business_owner · sales · coordinator · sales_manager · management · auditor |
| `fulfillment_stage_t` | New · In Communication · For Order Creation · Endorsed to Ops · SAP Created · No Feedback · Cancelled |
| `schedule_status_t` | Tentative · Confirmed · Running · Completed · Cancelled |
| `order_status_t` | New · Confirmed · Cancelled · Completed · Waitlist |
| `inquiry_status_t` | Received · Responded · RFQ or P Sent · Awaiting Feedback · Closed Won · Closed Lost |
| `channel_t` | Webshop · Inside Sales · Field Sales · In-house Request |
| `modality_t` | Live Online Training · Face-to-face · E-learning |
| `payment_status_t` / `payment_state_t` | Unpaid · Partial · Paid / Pending · Confirmed · Voided |
| `handoff_status_t` | Endorsed · Accepted · Returned |
| `go_status_t` | Go · No-Go |
| `country_t` | PH · ID |

Data rules:

- **DAT-1** Soft delete (`deleted_at`) on orders/clients/schedules; partial
  indexes exclude deleted rows.
- **DAT-2** One owner per order: `order_assignment` upserted on `order_id` —
  double-assignment is structurally impossible.
- **DAT-3** Trainer/venue codes (`TR-nn`/`VN-nn`) are DB-generated (sequences +
  BEFORE INSERT triggers) with case-insensitive unique indexes; explicit codes
  honoured.
- **DAT-4** Referential integrity is enforced by FKs and is currently clean
  (0 orphans on every audited path).
- **DAT-5** `audit_log` records actor, role, old/new data, `source` and reason;
  reason-gated overrides write their reason to the trail.
- **DAT-6** Pax enforcement: `fn_enforce_pax` forces `min_participants = 8`,
  derives max from course. ⚠️ Per-session vs course-derived max is an **open
  decision** — two draft migrations exist; exactly one is to be applied.

## 5. Functional requirements (by module)

### Catalogue & calendar
- **FR-1** Maintain courses with category hierarchy, per-modality fees, pricing
  and discount rules (operations/super_admin edit; others read).
- **FR-2** The calendar **shall** be readable by all eight roles (source of
  truth for what is sold); session create/edit/cancel is operations/super_admin
  only. Month/week/list views; session drawer renders the same shared record
  component as the full page (`SessionRecord`).
- **FR-3** Trainer/venue assignment **shall** run conflict detection
  (`fn_find_conflicts`) across date segments; the same person/room cannot be
  double-booked on a training day.
- **FR-4** Session confirmation **shall** go through the Go/No-Go decision (the
  single path); raw status change is a reason-gated super_admin correction only.
- **FR-5** Annual rollover builds the next calendar year (`Rebuild | Copy`).

### Sales / CRM
- **FR-6** Pipeline: inquiries with status flow to Closed Won/Lost; quotes with
  line items and totals (`v_quote_total`); inquiry→quote/order conversion.
- **FR-7** Order creation **shall** go exclusively through `fn_create_order`
  (no direct table insert from the UI). Its allowlist — not RLS — is the gate:
  sales, sales_manager, coordinator, operations, super_admin; selling roles are
  restricted to Inside Sales / Field Sales channels.
- **FR-8** Orders carry lines bound to scheduled sessions, seats, amounts, and
  an owner; owner is assignable from both the queue and the order record.
  ⚠️ Ownership is not yet mandatory (24.5% unowned; backlog IMM-3/4).
- **FR-9** Duplicate candidates are detected, listed, and resolved by merge
  (`fn_merge_orders`, reason-gated) or dismissal.

### Fulfilment & handoff
- **FR-10** Sales→Operations handoff **shall** be explicit:
  `fn_endorse_order` (with `fn_order_completeness` blockers; super_admin may
  override with a required reason) → `fn_accept_endorsement` →
  `fn_return_for_correction` (reason required).
- **FR-11** Payment status and SAP number **shall not** be editable by sales —
  enforced by a DB trigger, not the UI.
- **FR-12** Line transfers between sessions and participant transfers preserve
  history (`fn_transfer_line`, `fn_transfer_participant`, dispositions).
- **FR-13** Capacity: bookings beyond max go to `Waitlist`; operations promotes
  to seats as capacity allows.

### Delivery & closure
- **FR-14** Rosters (`fn_session_roster`), attendance, certificates with public
  verification (`fn_verify_certificate`), session close-out with actuals,
  post-session feedback and complaints.
- **FR-15** Trainers are a managed resource **without logins**; all trainer
  interaction is performed by operations. (Deliberate scope decision; the
  largest process gap on record.)

### Money & reporting
- **FR-16** Receivables: invoices, payments (`fn_refund_payment`,
  `fn_void_payment` — confirm + reason), AR ageing (`v_order_ar`).
- **FR-17** Dashboards **shall** aggregate in the database: one RLS-scoped RPC
  (`fn_dashboard_metrics(p_year)`) returns queue/session/approval/SLA/AR/
  pipeline/revenue/governance aggregates per role.
- **FR-18** Analytics area: 8 tabs (Overview, Revenue, Receivables,
  Certificates, Profitability, Pipeline, Quality, Data quality) gated per role
  in-screen with safe fallback.
- **FR-19** Session P&L **shall** mask cost and margin per role (§6 SEC-4);
  revenue is intentionally visible to all (derivable from calendar data).

### Cross-cutting UX
- **FR-20** Global search (`fn_global_search`, trigram-indexed contains-match)
  + ⌘K palette; saved views per surface with RLS-scoped role defaults and an
  active-filter summary; destructive actions through a promise-based confirm
  with optional/required reason; every list handles loading/error/empty.

## 6. Security requirements

- **SEC-1** RLS **shall** be enabled on every application table (53/54 tables
  carry policies; `schema_migrations` is deny-all).
- **SEC-2** Sales visibility: own + team orders (supervisors: region);
  ops/BO/management/super_admin read all; child tables scope via
  `fn_can_see_order`. Verified live: sales reads 123/163 orders, 0 audit rows,
  1 profile (self).
- **SEC-3** Role delegation **shall** be downward-only via RPCs
  (`fn_member_grantable_roles`, `fn_can_manage_member`, `fn_grant_member_role`,
  `fn_link_member_salesperson`, `fn_upsert_team_member`): super_admin → any;
  operations → sales/coordinator/sales_manager; supervisor → sales on own team
  only (team forced server-side). Nobody changes their own role; only
  super_admin touches super_admin or the oversight roles (business_owner,
  management, auditor). All grants audited.
- **SEC-4** Cost visibility (`20260814090000`): `fn_cost_visible()` limits
  cost/margin to super_admin, operations, business_owner, management, auditor.
  `trainer.daily_rate` / `venue.day_rate` are excluded from the column-level
  SELECT grant; `v_session_pnl` returns NULL cost/margin to other roles.
  Verified live both ways (sales blocked, operations unchanged).
- **SEC-5** Trigger functions **shall not** be RPC-callable: EXECUTE revoked
  from public/anon/authenticated (does not stop triggers firing).
- **SEC-6** All 30 views **shall** be `security_invoker = true`.
- **SEC-7** `SECURITY DEFINER` functions **shall** pin `search_path` and
  revoke anon EXECUTE; grants to `authenticated` only.
- **SEC-8** Auth: Supabase GoTrue email+password. Profiles are provisioned on
  first sign-in and role-assigned in `/admin` (the anon key cannot call the
  Auth admin API). ⚠️ Leaked-password protection (HIBP) is OFF — dashboard
  toggle, Pro-plan feature. ⚠️ No self-service password reset in the UI.

## 7. Non-functional requirements

- **NFR-1 Performance:** dashboards aggregate in Postgres (no full-table
  downloads); schedule year filters and report ranges execute server-side;
  Orders/Clients paginate server-side with debounced search; trigram GIN
  indexes serve leading-wildcard search; partial indexes cover hot filters.
  ⚠️ ~79 long-tail list queries remain unbounded (acceptable at current scale;
  backlog ST-5). ⚠️ 30 `auth_rls_initplan` policy warnings (at-scale cost;
  issue #171).
- **NFR-2 Resilience:** UI survives an unapplied migration (AR-4); every list
  handles loading/error/empty; refetch-on-focus disabled; stale-response races
  guarded in search/palette.
- **NFR-3 Accessibility:** WCAG 2.x A/AA intent — labelled inputs, accessible
  names on icon buttons, `role="dialog" aria-modal` + focus trap + Escape,
  skip link, status text alongside colour. Verified by axe on `/login` (0
  serious/critical) in CI; 9-screen signed-in sweep exists ⚠️ inert until E2E
  secrets are set.
- **NFR-4 Observability:** provider-neutral browser telemetry (errors,
  unhandled rejections, query/mutation errors, LCP, long tasks) with
  identity-free payloads; dev-only unless `NEXT_PUBLIC_TELEMETRY_ENDPOINT` is
  set. ⚠️ No endpoint configured — production errors are currently unobserved.
- **NFR-5 Compatibility:** evergreen desktop browsers; responsive intent via
  `.scroll-x` table wrappers and drawer `max-width: 94vw`. ⚠️ Viewport matrix
  untested; fixed 2-col grids on record pages are the likely mobile break.
- **NFR-6 Maintainability:** typed throughout (`tsc --noEmit` clean), zero-
  warning lint gate, shared UI primitives, conventions documented in CLAUDE.md.

## 8. Integrations

- **INT-1 Supabase** — Postgres + PostgREST + GoTrue + storage; the only
  backend. `pg_trgm` and `pg_cron` installed.
- **INT-2 Edge functions** — `send-comms` (email), `nightly-hygiene`,
  `weekly-digest` (digest views feed it).
- **INT-3 SAP** — reference-only (`sap_order_no`); no API integration. The
  portal is explicitly not the financial ledger.
- **INT-4 Netlify** — hosting + PR deploy previews (the primary CI signal for
  UI changes).
- **INT-5 Webshop** — `webshop_product` maps catalogue entries; `Webshop` is an
  order channel.

## 9. Environments & operations

- **OPS-1** Environments: local dev (`npm run dev`), PR deploy previews,
  production. **There is no staging database — permanent owner decision
  (2026-08-14).** Consequences (binding): every migration is a production
  change on first application; signed-in automation must be read-only; write
  paths are tested only in the RLS suite's throwaway Postgres.
- **OPS-2** Every DB change **shall** be an idempotent migration in
  `supabase/migrations/`, mirrored into
  `supabase/bundles/2026_program_all_migrations.sql` (CI parity gate), and
  validated against a disposable PostgreSQL before application. Never hand-
  paste SQL into the dashboard (documented drift history).
- **OPS-3** Config: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (required; fail-fast validated); optional `NEXT_PUBLIC_TELEMETRY_ENDPOINT`,
  `BASE_URL`, `PLAYWRIGHT_CHROMIUM_PATH`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`,
  `STAGING_BASE_URL` (CI secret).
- **OPS-4** CI gates (GitHub Actions): `quality.yml` (lint → typecheck → unit →
  build; public browser suite; self-skipping authenticated suite),
  `migration-parity.yml`, `rls-regression.yml` (throwaway Postgres 16, real
  migration files), `apply-supabase.yml` (sanctioned DB apply). Netlify deploy
  preview must go green.
- **OPS-5** RLS regression suite: **20 assertions** (A–T) covering order
  scoping, anon lockout, RPC locks, the delegation matrix, order-creation
  authority and cost masking; mutation-tested (breaking a gate fails CI with
  exit 3).
- **OPS-6** Test inventory: 7 unit tests · 40 public E2E (auth gate on every
  screen route, 13 legacy redirects, resilience) · 9-screen axe sweep (inert
  pending secrets) · 20 RLS assertions. ⚠️ No signed-in browser test has ever
  executed; a read-only `management` test account exists
  (`qa-axe-bot@tuv-training-portal.netlify.app`).

## 10. Known gaps register (normative)

The ⚠️ items above, consolidated — these are accepted, tracked deviations, not
undocumented surprises:

| # | Gap | Tracking |
|---|---|---|
| 1 | 40/163 orders unowned; ownership not required for endorsement | IMM-3/IMM-4 |
| 2 | Signed-in test suites inert (secrets not set) | IMM-2 |
| 3 | 5 unguarded detail routes (RLS-safe) | NEXT-4 |
| 4 | Pax rule undecided (two draft migrations) | NEXT-7 |
| 5 | Telemetry endpoint unset | ST-9 |
| 6 | Leaked-password protection off; no password reset UI | ST-10 |
| 7 | Unbounded long-tail queries; RLS initplan warnings | ST-5, #171 |
| 8 | Responsive matrix untested | ST-7 |
| 9 | No trainer self-service (by design, revisit) | LT-1 |
| 10 | Flat single-team structure | NEXT-9 |

## 11. Acceptance criteria for "production-ready" (target 85/100; current 75)

1. Gaps 1–2 closed and verified live.
2. Signed-in axe + viewport matrix green across the reachable screens.
3. Advisor findings limited to documented by-design items.
4. A pilot cohort (operations + sales) has completed real work in the system —
   the objectives in `docs/project-charter.md` §4 are validated by use, not
   inference.
