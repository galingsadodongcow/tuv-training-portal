# 01 — Application inventory

Built from the repository at `d5600e6`, not from assumption. Counts are from
`find`/`grep` over the tree and from live catalogue queries.

## Totals

| Thing | Count |
|---|---|
| Route files (`page.tsx`) | 44 (43 under `(app)` + login) |
| Routes that render a screen | 30 |
| Routes that are legacy redirects | 13 |
| Screen components (`src/screens`) | 36 |
| Shared components (`src/components`) | 32 |
| Public views in Postgres | 30 (all `security_invoker`) |
| Migrations in repo | 66 |
| Roles (`user_role` enum) | 8 |

## Roles

`super_admin`, `operations`, `business_owner`, `sales`, `coordinator`,
`sales_manager`, `management`, `auditor`.

There is **no trainer login** — trainers are a managed resource
(`trainer` table), not users. This is a deliberate design choice and it means
the brief's "TRAINER" journey (§6) **cannot be simulated**: trainers do not
access the system. See `04-role-journeys.md`.

Two overlapping notions of "supervisor" existed until today: the
`salesperson.is_supervisor` flag and the `sales_manager` role
(`fn_is_team_lead()` = either). These were unified onto `sales_manager`.

## Routes → screens

### Screen routes (30)

| Route | Screen | Guard |
|---|---|---|
| `/login` | Login | public |
| `/` | root | redirect by role |
| `/my-work` | Worklist | all 8 roles |
| `/overview` | Overview | management, super_admin |
| `/calendar` | Calendar | **none** (intentional — all roles) |
| `/crm` | CRM (Pipeline·Quotes·Orders) | **none** |
| `/clients` | Clients | **none** |
| `/clients/[id]` | ClientDetail | **none** |
| `/orders/[id]` | OrderDetail | **none** |
| `/organizations/[id]` | OrganizationDetail | all 8 roles |
| `/quotations/[id]` | QuoteDetail | 7 roles (not auditor) |
| `/session/[id]` | SessionDetail | **none** |
| `/session/[id]/edit` | SessionForm | super_admin, operations |
| `/session/new` | SessionForm | super_admin, operations |
| `/courses` | Courses (+ edit drawer) | super_admin, operations |
| `/training` | Training (read-only catalogue) | 7 roles |
| `/resources` | Resources (trainers/venues) | super_admin, operations, business_owner, management |
| `/analytics` | Analytics (8 tabs) | **none** — but tabs gated in-screen |
| `/financial` | Financial | management, business_owner, operations, super_admin |
| `/team` | Team | sales_manager, super_admin |
| `/approvals` | Approvals | super_admin, operations, business_owner |
| `/complaints` | Complaints | super_admin, operations, business_owner, management |
| `/duplicates` | Duplicates | super_admin, operations, coordinator |
| `/pricing` | PricingRules | super_admin, operations, business_owner |
| `/communications` | Communications | super_admin, operations |
| `/rollover` | Rollover | super_admin, operations |
| `/admin` | Admin (users/access) | super_admin, operations, sales_manager |
| `/audit` | AuditLog | super_admin, auditor |
| `/search` | Search | `<Guard>` any authenticated |
| `/sales-entry` | SalesEntry | super_admin, sales, sales_manager, coordinator |

### Legacy redirects (13) — all verified resolving

`/home` → `/my-work` · `/dashboard`, `/reports`, `/quality`, `/data-quality` →
`/analytics` · `/operations-today` → `/my-work` · `/elearning`, `/orders`,
`/worklist` → `/crm` · `/inquiries`, `/quotations` → `/crm` ·
`/organizations` → `/clients` · `/course/new`, `/course/[id]/edit` → `/courses`

These are **not** dead code — they preserve bookmarks after the third-pass
consolidation, and several forward query params (e.g. `/orders?q=&stage=`).
Now regression-tested (13 new E2E tests).

## Unguarded screen routes — assessed, not just counted

21 of 43 routes lack a `<Guard>`, but the raw number overstates the issue:

- **13 are redirects** — they forward to a guarded destination. Not a defect.
- **`/analytics`** — no route Guard, but the screen filters its 8 tabs by role
  (`TABS.filter(t => t.roles.includes(role))`) and falls back to Overview for a
  tab the role cannot see. Defence-in-depth is adequate; a route Guard would
  still be tidier (**QW-3**).
- **`/calendar`** — intentional, decided this session: the calendar is the
  single source of truth for what is sold, and RLS (`p_sched_r using (true)`)
  already allows every role to read it.
- **`/crm`, `/clients`, `/clients/[id]`, `/orders/[id]`, `/session/[id]`** —
  genuinely unguarded. RLS scopes the *data* correctly (proven in
  `02-role-permission-matrix.md`), so this is a **UX/consistency defect, not a
  security hole**: a role whose nav omits the screen can still deep-link to it
  and will see a correctly-scoped but unexpected page. Tracked as **NEXT-4**.

## Domain entities

From the live catalogue. Core transactional: `orders`, `order_line`,
`order_assignment`, `order_note`, `order_disposition`, `participant`,
`schedule`, `client`, `contact`, `inquiry`, `quote`, `quote_line`, `payment`,
`refund`, `credit_note`, `invoice`.

Master data: `course`, `course_fee`, `category` hierarchy, `trainer`,
`trainer_course`, `venue`, `salesperson`, `profiles`, `calendar_year`,
`discount_rule`, `conversion_rate`, `webshop_product`.

Workflow/governance: `approval`, `duplicate_candidate`, `task`, `notification`,
`audit_log`, `saved_view`, `attribution`, `assignment_log`, `session_note`,
`session_trainer`, `feedback`, `complaint`, `escalation_rule`.

Staging: `staging_order_booking`, `staging_calendar` — **both lack a primary
key** (performance advisor `no_primary_key`). Acceptable for staging tables but
worth a comment; see `13-data-integrity-audit.md`.

## Workflow engine (RPCs)

~40 `SECURITY DEFINER` functions carry the business rules. The significant ones:
`fn_create_order`, `fn_endorse_order`, `fn_accept_endorsement`,
`fn_return_for_correction`, `fn_order_completeness`, `fn_merge_orders`,
`fn_transfer_line`, `fn_transfer_participant`, `fn_refund_payment`,
`fn_void_payment`, `fn_find_conflicts`, `fn_global_search`,
`fn_dashboard_metrics`, `fn_session_roster`, `fn_verify_certificate`, plus the
delegation set added this session (`fn_team_members`, `fn_grant_member_role`,
`fn_link_member_salesperson`, `fn_upsert_team_member`).

**These, not RLS, are the real gate for several workflows.** `fn_create_order`
is `SECURITY DEFINER` and therefore bypasses the `orders` INSERT policies
entirely — which is why `operations` can create orders while having no INSERT
policy at all. Any audit of "who can create an order" that reads only
`pg_policies` reaches the wrong answer.

## Integrations

- **Supabase** (Postgres + RLS + PostgREST + Auth) — the only backend.
- **Edge functions:** `send-comms`, `nightly-hygiene`, `weekly-digest`.
- **pg_cron** installed (scheduled hygiene/digest).
- **Netlify** hosting; deploy previews per PR.
- **Telemetry:** provider-neutral, off unless `NEXT_PUBLIC_TELEMETRY_ENDPOINT`
  is set — currently **not configured**, so no production error visibility.

## Notifications

`notification` table + `fn_queue_reminders` / `fn_notify_sla_breaches`, surfaced
in-app. Email goes through the `send-comms` edge function. There is no push or
SMS channel.
