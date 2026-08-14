# 16 — Prioritised backlog

Severity: P0 critical · P1 high · P2 medium · P3 low · P4 enhancement.
Effort: S <1d · M 1–3d · L >3d.

## IMMEDIATE — before wider deployment

| ID | Issue | Role | Module | Sev | Impact | Effort | Recommendation | Depends on | Acceptance |
|---|---|---|---|---|---|---|---|---|---|
| IMM-1 | Cost/margin/trainer rates readable by all roles | all | Analytics, Session | **P0** | High | S | Route P&L through a `security definer` RPC gated on `fn_role_reads_all()`, or move rate columns behind a restricted view | **Business decision on who may see margin** | As `sales`, `v_session_pnl`/rates return no cost or margin; management/BO/ops unchanged |
| IMM-2 | No authenticated test coverage | QA | whole app | P1 | High | S | Create a least-privileged test account; restore `E2E_USER_EMAIL`/`PASSWORD` + `STAGING_BASE_URL` | test account | `authenticated-browser` job runs (not skips) and passes |
| IMM-3 | 40/163 orders unowned | sales, ops | Orders | P1 | High | S | Backfill owners; default owner to creator (QW-1) | — | 0 unowned active orders; new orders get an owner |
| IMM-4 | Order can be endorsed with no owner | sales→ops | Workflow | P1 | High | S | Add owner blocker to `fn_order_completeness` | IMM-3 | Endorsing an unowned order returns a blocker |

## NEXT ITERATION

| ID | Issue | Role | Module | Sev | Impact | Effort | Recommendation | Acceptance |
|---|---|---|---|---|---|---|---|---|
| NEXT-1 | 6 live sessions unstaffed | ops | Calendar | P2 | Med | S | Surface unstaffed-within-21-days as a My Work task | Task appears and clears on assignment |
| NEXT-2 | No result counts on filtered lists | all | lists | P2 | Med | S | "N of M" beside the filter summary | Count updates with every filter change |
| NEXT-3 | Quote→order is manual re-entry | sales | CRM | P2 | High | M | "Convert to order" seeding `fn_create_order` from quote lines | Converted order matches quote lines exactly |
| NEXT-4 | 5 screens unguarded vs nav | mgmt, auditor | routing | P2 | Med | S | Add Guards matching nav lists | Deep-link as a nav-excluded role bounces home |
| NEXT-5 | Trigger-blocked fields render as inputs | sales | OrderDetail | P2 | Med | S | Render read-only text for sales | No editable control the DB will reject |
| NEXT-6 | No unsaved-changes warning | all | forms | P2 | Med | M | beforeunload + router guard on dirty forms | Navigating away prompts |
| NEXT-7 | Pax rule undecided | ops | Sessions | P2 | Med | S | Apply exactly one of the two draft migrations; delete the other | One applied; the other removed from the repo |
| NEXT-8 | `auth_rls_initplan` × 30 | all | DB perf | P2 | Med | M | Wrap `auth.<fn>()` as `(select auth.<fn>())` behind the RLS regression suite | Advisor count → 0; RLS tests still pass |
| NEXT-9 | Team structure is one flat team | sales_mgr | org data | P2 | Med | S | Model real teams/regions | `/team` and delegation show meaningful scope |
| NEXT-10 | 5 of 7 salespeople have no login | sales | Admin | P2 | Med | M | Invite flow via edge function (service key) | A new member can be invited from `/admin` |

## SHORT-TERM

| ID | Issue | Sev | Effort | Recommendation |
|---|---|---|---|---|
| ST-1 | No recurring sessions | P2 | M | Repeat rule on the session form |
| ST-2 | No duplicate in drawer | P3 | S | Duplicate action → pre-filled quick-create |
| ST-3 | No competency/utilisation in trainer picker | P2 | M | Annotate options; pre-flight `fn_find_conflicts` |
| ST-4 | No inquiry next-action | P2 | S | `next_action_at` + My Work item |
| ST-5 | Unbounded list queries | P2 | M | Add limits/pagination |
| ST-6 | 21 screens never a11y-scanned | P2 | M | axe across all screens (needs IMM-2); skip link already exists |
| ST-7 | Responsive unverified | P2 | M | Viewport matrix in Playwright (needs IMM-2) |
| ST-8 | Terminology split Customer/Client | P3 | S | Standardise on "Customer" |
| ST-9 | No telemetry destination | P3 | S | Configure endpoint |
| ST-10 | Leaked-password protection off | P3 | S | Enable in Auth settings |

## LONG-TERM

| ID | Item | Sev | Effort | Note |
|---|---|---|---|---|
| LT-1 | Trainer self-service role | P4 | L | New role, RLS scope, invite flow, 2–3 screens |
| LT-2 | Merge `/training` and `/courses` | P3 | M | One role-aware catalogue route |
| LT-3 | Drag-and-drop rescheduling | P4 | L | Only after conflict pre-flight exists |
| LT-4 | Selective FK indexes (39) | P3 | M | Driven by real query patterns (issue #171) |
| LT-5 | Consolidate multiple permissive policies (59) | P3 | L | Behaviour-risky; needs the RLS suite |
| LT-6 | Density toggle | P4 | S | Compact mode for heavy list users |
