# Prioritized Backlog (Part 50) + Acceptance Criteria (Part 52)

Every item carries: problem, first-pass reference, current status, affected role/workflow/screen, recommended change, benefit, implementation type, complexity, dependencies, priority. **Types:** UI · FRONTEND · BACKEND · DATABASE · WORKFLOW · PERMISSION · AUTOMATION · ARCHITECTURE. **Priorities:** P0 critical · P1 high · P2 medium · P3 enhancement. Status is against the post-Phase-1–4 build.

> Items already delivered in Phases 1–4 are **not** repeated here except where they need redesign. Full done-list is in `01-post-qa-gap-analysis.md`.

## P0 — Critical (correctness, trust, or blocks the role model)

| ID | Title | Problem | 1st-pass ref | Status | Role / Workflow / Screen | Type | Complexity | Deps | Recommended change |
|---|---|---|---|---|---|---|---|---|---|
| B01 | Duplicates screen ↔ merge permission mismatch | `/duplicates` is NAV-gated to `sales`, but `fn_merge_orders` is ops/super_admin only → a sales user sees merge buttons that hit an RLS wall | new (2nd pass) | NOT IMPLEMENTED (regression from Phase 1) | sales/ops · dedup · Duplicates | PERMISSION | Low | — | Re-gate Duplicates to `['super_admin','operations']` (per matrix sales shouldn't merge); or hide merge for sales and show "flag only" |
| B02 | Session-health read inconsistently | Home & DataQuality compute `belowMin` ad hoc from `useSchedules`; only My Work/Calendar read `v_session_health` → surfaces can disagree | new (2nd pass) | PARTIAL | ops/BO · session health · Home/DataQuality/Calendar/MyWork | FRONTEND | Low | — | Route every "at-risk session" surface through `v_session_health`/`healthNeedsAction` |
| D-DEC | Resolve product decisions D1–D8 | Role ownership, endorsement contract, money authority, customer model unresolved | 04 §3/§6/§7 | NEEDS PRODUCT DECISION | all | — | — | Decision session (`14-product-decisions.md`) |
| R01 | Order/Marketing Coordinator role | No role owns intake integrity; ops locked out of intake screens | 01 §3, 04 §3 | NOT IMPLEMENTED (deferred) | Coordinator · intake · Inquiries/SalesEntry/Orders | PERMISSION+DATABASE | Med | D1 | Add `coordinator` role + nav slice + RLS; open intake to it |
| R02 | Auditor role + before/after audit | Audit is super-admin-only and field-names-only | 04 §9 | NOT IMPLEMENTED (deferred) | Auditor · governance · AuditLog | PERMISSION+DATABASE | Med | D7 | `auditor` role; capture `{field:{old,new}}`+actor+source; relax `fn_audit_search` |
| H01 | Endorsement completeness gate | Sales→Ops is an unguarded dropdown; incomplete orders reach ops | 01 §4.6, 04 §3 | NOT IMPLEMENTED (deferred) | Sales/Coordinator/Ops · endorsement · OrderDetail/Worklist | WORKFLOW+DATABASE | Med | D2 | Block endorse until required fields pass (reuse `orderBlockers` as preflight) |
| H02 | Two-sided handoff receipt (Accept/Return) | Ops never accepts an endorsed order; sender's queue never clears; no return-for-correction | 01 §9 | NOT IMPLEMENTED (deferred) | Sales↔Ops · endorsement · OrderDetail/MyWork | WORKFLOW+DATABASE | Med | H01 | Accept transfers ownership + starts SLA + activity event; Return requires reason + tasks sender |
| O01 | Owners for sessions & inquiries | Sessions/inquiries belong to nobody; exceptions route to an anonymous count | 01 §Top-12, 04 §2 | NOT IMPLEMENTED (deferred) | ops/sales · all · SessionDetail/Inquiries | DATABASE+FRONTEND | Med | — | Add `schedule.owner`, `inquiry.owner`+`inquiry.client_id`; route to My Work |

## P1 — High (integrity, access, core experience)

| ID | Title | Problem | 1st-pass ref | Status | Role / Workflow / Screen | Type | Complexity | Deps | Recommended change |
|---|---|---|---|---|---|---|---|---|---|
| IA01 | Collapse 4 operational surfaces into My Work | Home, My Work, Worklist, Data Quality overlap; Home even embeds its own "My Work" block | 02 §3 | NOT IMPLEMENTED | all · attention · Home/MyWork/Worklist/DataQuality | ARCHITECTURE+FRONTEND | High | — | My Work becomes the surface; fold Worklist engine + DataQuality→Exceptions; retire Home |
| RM01 | Read-only Management role | "Just look" needs `business_owner` (can decide + edit pricing) | 04 §7 | NOT IMPLEMENTED (deferred) | Management · oversight · Dashboard/Reports | PERMISSION | Med | D4 | `management` read-only role (SELECT across orders/AR/sessions/customers) |
| RM02 | Real Sales Manager role | `is_supervisor` boolean; no manager surface | 01 §5, 04 §Top-6 | NOT IMPLEMENTED (deferred) | Sales Manager · team mgmt · Worklist | PERMISSION+FRONTEND | Med | D8 | `sales_manager` role + team surface (pipeline/unassigned/overdue/reassign) |
| REC01 | Record-page standard on OrderDetail & ClientDetail | Long single-column scroll; SessionDetail is the tabbed standard nobody adopted | 02 §7–8 | NOT IMPLEMENTED | all · all · OrderDetail/ClientDetail | FRONTEND | Med | — | Breadcrumb→header(status/health/owner/due)→attention→summary→tabs→right rail |
| CUS01 | Customer 360 + `inquiry.client_id` | 4 unlinked customer concepts; leads never resolve | 04 §1 | NOT IMPLEMENTED (deferred) | all · customer · Clients/Organizations/Inquiries | DATABASE+ARCHITECTURE | High | D5 | Unify Client+Org+Contact; add `inquiry.client_id`; one Customer 360 page |
| INQ01 | Inquiry detail + convert-to-order | No detail page; no next-action; won lead dead-ends | 02 §6, 04 §2 | NOT IMPLEMENTED | sales · lead · Inquiries | FRONTEND+DATABASE | Med | O01 | Detail page (Overview/Activity/Files), `next_action_at`, one-click convert carrying context |
| SAL01 | Quote→order line prefill + `fn_create_order` RPC | Every line retyped; SalesEntry is a non-transactional 4-write saga with placeholder header | 01 §Top-6, 03 §1.1 | NOT IMPLEMENTED | sales · sales · SalesEntry/QuoteDetail | BACKEND+FRONTEND | Med | — | Read `quote_line` on `?quote`; atomic `fn_create_order`; compute header from lines |
| PAY01 | Refund/void/credit model | "Refund" is a hard DELETE with un-persisted reason | 04 §6 | NOT IMPLEMENTED (deferred) | Coordinator/BO · payment · ReceivablePanel | DATABASE+WORKFLOW | High | D3 | Immutable payments + `payment.status` + `refund` + `credit_note`; authority split |
| ROS01 | Roster CSV import + participant soft-delete/transfer | Every attendee typed; remove is a hard delete; no single-participant transfer | 04 §5 | NOT IMPLEMENTED | ops · delivery · RosterPanel | FRONTEND+DATABASE | Med | — | Import with column-map + dedupe/preview; `participant.status` (Active/Cancelled/Substituted) |
| DASH01 | Role-specific drill-through dashboards | One generic Dashboard; 5 of 6 KPIs dead-end | 02 §4 | NOT IMPLEMENTED | all · oversight · Dashboard | FRONTEND | Med | — | Per-role dashboard; every KPI a `<Link>` to its filtered records |
| RET01 | Return-for-correction (universal) | No bounce-with-reason on handoffs or approvals | 04 §exceptions | NOT IMPLEMENTED | all · handoffs/approvals · OrderDetail/Approvals | WORKFLOW | Med | H02 | Add a Return state + reason + task to sender across handoffs and approvals |

## P2 — Medium (consolidation, automation start, coverage)

| ID | Title | Problem | Status | Type | Cx | Deps | Change |
|---|---|---|---|---|---|---|---|
| AN01 | Consolidate Analytics | Dashboard/Reports/Quality = 3 screens | NOT IMPL | FRONTEND | Med | DASH01 | One Analytics area with Overview/Reports/Feedback tabs |
| OPS01 | Operations command center | `v_digest_*` views feed only the nightly job | NOT IMPL | FRONTEND | Med | — | "Operations Today" (Today/This week/At risk/Decisions lanes) |
| CAL01 | Calendar week/day + session drawer | Only grid/list; editing leaves the calendar | NOT IMPL | FRONTEND | Med | — | Week/day view + edit-in-drawer |
| SV01 | Server-persisted saved views | Filters are ephemeral URL params | NOT IMPL | FRONTEND+DATABASE | Med | — | Saved views table; role-specific defaults |
| SRCH01 | Global search coverage + typo tolerance | Title/name only | NOT IMPL | BACKEND+FRONTEND | Med | — | Add email/phone/participant/trainer/quote/cert; `pg_trgm`; recents/preview |
| AUTO01 | Payment-exception detection | Overpay/underpay/on-cancelled not flagged | DEFERRED | AUTOMATION | Med | D3 | Detection + AR exceptions board (no auto-money-movement) |
| AUTO02 | Prep-deadline & roster-gap tasks | Generator doesn't cover prep/roster/cert | DEFERRED | AUTOMATION | Med | O01 | Extend `fn_generate_worklist_tasks` |
| AUTO03 | Escalation ladder | SLA breach doesn't escalate in-app | DEFERRED | AUTOMATION | Med | O01 | owner→supervisor→BO task ladder off `v_sla_breach` |
| WEB01 | Webshop ingestion | Manual re-keying | NOT IMPL | BACKEND | Med | D1 | Import queue landing orders New+Unpaid for Coordinator |
| STAT01 | Inquiry & quote health signals | Only order+session have health | NOT IMPL | FRONTEND | Low | — | Add derived health badge for inquiry (aging) + quote |
| TBL01 | Column sort + bulk on Orders/Worklist | No sort; bulk only in Worklist | NOT IMPL | FRONTEND | Low | — | Column sort; row bulk on Orders |

## P3 — Enhancement

| ID | Title | Status | Type | Change |
|---|---|---|---|---|
| ADM01 | Admin lookups/config console | NOT IMPL | FRONTEND+DATABASE | Back hardcoded enums (stages/methods/channels) with active/sort |
| ADM02 | User invite/deactivate | NOT IMPL | BACKEND | Provision/deactivate auth users; "can't remove last super_admin" guard |
| BRC01 | Breadcrumbs | NOT IMPL | UI | Route-fed breadcrumb primitive (≤3 levels) |
| ELN01 | Explain e-learning gating | NOT IMPL | FRONTEND | Show "Awaiting payment" reason + grant-with-reason |
| RPT01 | Reports global date-range | NOT IMPL | FRONTEND | Cross-tab period control + save/export view |
| SES01 | Session-health input fields | NOT IMPL | DATABASE | Add online-link, materials_ready, special_requirements |
| RLV01 | Rollover dry-run | NOT IMPL | FRONTEND+BACKEND | Preview count/conflicts before `fn_rollover_copy`; reversible grace window |

---

## Acceptance criteria for P0 / P1 (Part 52)

**B01 — Duplicates/merge permission.** Duplicates is visible only to roles that can execute `fn_merge_orders`; no user is shown a merge action that returns an RLS error; a sales user (if retained) sees a read-only/flag-only view.

**B02 — Consistent session health.** Every "at-risk sessions" surface (Home/DataQuality successor, Calendar, My Work) derives from `v_session_health`; a session's level is identical on every screen at the same moment; no surface recomputes `belowMin` independently.

**R01 — Order Coordinator.** A `coordinator` role exists; it can open Inquiries and New order; it owns orders from intake→endorse; RLS verified as coordinator (sees intake queue, cannot approve/refund/fulfil); the role appears in Admin and can be granted.

**R02 — Auditor + before/after.** An `auditor` role opens the audit log without super-admin; each audited write records old→new per field + actor + source(system/user); a reviewer can reconstruct a transaction end-to-end; auditor has zero write capability (RLS-verified).

**H01 — Endorsement completeness gate.** Attempting to endorse an order missing any required field is blocked with a specific list of what's missing; a complete order endorses; super-admin can override with a persisted reason; the check reuses the `orderBlockers` predicate set.

**H02 — Accept/Return handoff.** An endorsed order appears in Operations' My Work showing sales owner, customer, training, payment state, and any missing info; Operations chooses **Accept** (transfers operational ownership, starts the ops SLA, writes an activity event, clears the sender's active-handoff queue) or **Return for Correction** (requires a reason, tasks Sales, records the return in the timeline); the item leaves the sender's queue **only** on Accept.

**O01 — Session & inquiry owners.** `schedule.owner` and `inquiry.owner` exist; an at-risk session and an ageing inquiry appear in their owner's My Work (not an anonymous count); ownership is shown on the record header and is reassignable with an audit entry.

**IA01 — One operational surface.** Home is retired into My Work; Data Quality and Duplicates become My Work "Exceptions" filters; the Worklist claim/advance/bulk engine is reachable inside My Work; no two surfaces recompute the same exception predicate; each role sees a role-shaped My Work.

**RM01 — Read-only Management.** A `management` role can view orders/AR/sessions/customers/analytics and export, with zero write/approve/pricing capability (RLS-verified as management); the executive dashboard renders for it.

**RM02 — Sales Manager.** A `sales_manager` role (or explicit team grant) exists with a team surface: team pipeline, unassigned leads, overdue follow-ups, stalled opportunities, reassign, escalate; team scope is visible (not invisible RLS); reassignment writes an audit entry.

**REC01 — Record standard.** OrderDetail and ClientDetail render the standard layout (breadcrumb, header with status+health+owner+due+actions, attention area, summary, tabs, right rail); parity with SessionDetail; back-link and breadcrumb both work.

**CUS01 — Customer 360.** `inquiry.client_id` resolves leads to customers; one Customer page shows summary, contacts, inquiries, quotes, orders, sessions, participants, payments, activity, documents, owner, related companies; org-level AR rolls up; no data-model change ships without D5 agreed.

**SAL01 — Order creation.** Converting a quote pre-fills all order lines from `quote_line` (a review step, not re-entry) with price parity guaranteed; `fn_create_order` writes client+order+lines+assignment atomically (no partial-failure state); header seats/amount/modality are computed, not placeholder.

**PAY01 — Money model.** Payments are immutable (never deleted); a refund/void/credit is a distinct object with amount/method/date/reason and linkage; AR recomputes from confirmed − refunds + applied credits; only BO/super-admin can void/refund, behind a persisted reason; an AR exceptions board lists overdue/overpaid/pending-confirmation/refunded.

**ROS01 — Roster.** Ops can import participants from CSV with column mapping, dedupe, and a preview validated against seats; participant removal is a soft cancel/substitute preserving attendance/assessment/cert history; single-participant transfer works without transferring the whole line.

**DASH01 — Role dashboards.** Each role sees a dashboard whose metrics are all drill-through (clicking "N at risk" opens those N records); no dead-end KPI; the dashboard reads `profile.role`.

**RET01 — Return-for-correction.** Every handoff and every approval supports Return-for-correction with a mandatory reason that creates a task for the originator and a timeline entry; a returned record leaves the receiver's queue and re-enters the sender's.
