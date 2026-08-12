# Post-QA Gap Analysis — TÜV Academy PH Portal (Second Pass)

> Covers mega-prompt Parts 1, 2, 43, 44, 45. Baseline = the first-pass review in
> `docs/qa/ux-review/` (Parts 01–05) plus the two execution logs
> (`PHASE-1-2-EXECUTION.md`, `PHASE-3-4-EXECUTION.md`). Every classification below
> was re-checked against the current code (`src/screens/*`, `src/lib/roles.ts`,
> `src/hooks/data.ts`, `src/lib/orderState.ts`, `src/lib/health.ts`), not taken on
> faith from the logs. Where doc and reality disagree, it is flagged **⚠ MISMATCH**.

The design test every operational screen must pass (used throughout):
**(1) What needs my attention? (2) What do I do next? (3) Where do I do it?
(4) Who owns the next step? (5) Is the process progressing correctly?**

---

## 1. Baseline recommendation ledger

Classification legend: **IMPL** = implemented · **PART** = partially implemented ·
**NOT** = not implemented · **DEF** = deferred (logged, intentional) ·
**N/R** = no longer relevant · **PROD** = needs product decision ·
**TECH** = needs technical validation.

### 1a. First-pass P0 / correctness fixes

| # | First-pass recommendation | Class | Evidence in current code |
|---|---|---|---|
| P0-1 | Build `fn_merge_orders` to actually reconcile duplicates | **IMPL** | `Duplicates.tsx` calls `useMergeOrders()` → `fn_merge_orders(keep,dup,reason)`; danger-confirm keep/cancel chooser. Cancels dup + lines. |
| P0-2 | Wire `fn_queue_reminders` into nightly job | **IMPL** | Per PHASE-1-2 log, `fn_nightly_hygiene` now `perform fn_queue_reminders()`. ⚠ Note: `send-comms` still not scheduled, so queue populates but no email sends — reminders are *queued*, not *delivered*. |
| P0-3 | Enforce stage state machine in DB | **IMPL** | `fn_orders_stage_guard` BEFORE UPDATE trigger. `Worklist.tsx advance()` still fires a raw `.update({fulfillment_stage})` — correctly relying on the trigger to reject illegal moves. |
| P0-4 | Unique participant index `(schedule_id, lower(email))` | **IMPL** (variant) | Shipped as `fn_participant_dedup_guard` BEFORE INSERT (raises `23505`), not a unique index. INSERT-only → transfers/substitutions still unguarded (see §4). |
| P0-5 | Fix SessionForm: editable pax, restrict status picker, date-range guard | **IMPL** | PHASE-1-2 + PHASE-3-4 logs; min/max editable+submitted, picker limited to Tentative/Confirmed, monotonic date validation. |

### 1b. Status / health / workflow

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| S-1 | Stored session-health model (green/amber/red) | **IMPL** | `v_session_health` + `src/lib/health.ts` (`healthMeta`, `healthNeedsAction`). |
| S-2 | Health surfaced identically on Calendar / Home / digest | **PART / TECH** | ⚠ **MISMATCH**: My Work (`MyWork.tsx` via `useSessionHealth`) and Calendar read `v_session_health`; **Home.tsx and DataQuality.tsx still compute `belowMin` ad hoc from `useSchedules`** (line 97–99 Home, 51–53 DataQuality). Health is *not* one truth across surfaces. |
| S-3 | Split process-status from computed-health for every entity | **PART** | Done for order (`primaryFlag`) + session (`v_session_health`). Inquiry and quote have **no** health signal. |
| S-4 | Auto-expire Sent quotes past `valid_until` | **IMPL** | `fn_nightly_hygiene` expires stale Sent quotes. |
| S-5 | Endorsement completeness gate | **DEF** | Explicitly deferred (needs completeness contract + override UX). Handoff is still a bare stage change. |
| S-6 | Inquiry / quote health + aging | **NOT** | Quote Expired auto-fires; inquiry aging still manual, no health badge. |

### 1c. Navigation / IA / My Work

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| N-1 | Build a My Work operational center | **PART** | `/my-work` (`MyWork.tsx`) exists: tasks, approvals, orders-needing-attention, session health, SLA. **But** see §2/§3 — it was added additively; Home still carries its own inline "My Work". |
| N-2 | Merge Home + Worklist + DataQuality into My Work | **NOT** | ⚠ All four still live: `/home`, `/my-work`, `/worklist`, `/data-quality`. Redundancy *grew*. |
| N-3 | Grouped navigation instead of 23 flat items | **IMPL** | `roles.ts NAV` has `group`: Sales/Operations/Customers/Oversight/Insights/Admin; Shell renders headers. |
| N-4 | Notification center (bell + unread + panel) | **IMPL** | `NotificationCenter.tsx` per log; reads `notification` table. |
| N-5 | Consolidate Analytics (Dashboard/Reports/Quality → tabs) | **NOT** | Three separate nav items under "Insights". |
| N-6 | Fold DataQuality + Duplicates into "Exceptions" | **NOT** | Both still top-level (DataQuality under Admin, Duplicates under Sales). |
| N-7 | Merge Clients + Organizations into Customer 360 | **NOT / DEF** | Two nav items under "Customers"; `inquiry` still has no `client_id`. |
| N-8 | Breadcrumbs on records | **DEF** | Not added; back-link only. |
| N-9 | Global search beyond title/name (email/phone/participant) | **NOT** | Still name/title only. |

### 1d. Role model / permissions / ownership

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| R-1 | Introduce Order/Marketing Coordinator role | **PROD** | Enum still `super_admin, operations, business_owner, sales` (`roles.ts:1`). |
| R-2 | Real Sales Manager role (not `is_supervisor` boolean) | **PROD** | Still a boolean widening RLS team→region (`MyWork.tsx:113`, `Worklist.tsx:47`). |
| R-3 | Read-only Management role | **PROD/NOT** | Absent. BO still exec+operator. |
| R-4 | Dedicated Auditor role (not super_admin) | **PROD/NOT** | Audit log gated `super_admin` only (`roles.ts:55`). Worst least-privilege gap unchanged. |
| R-5 | Let operations open Inquiries / New sales order (intake home) | **PROD/DEF** | `roles.ts`: `/inquiries` and `/sales-entry` gated `['super_admin','sales']` — ops still locked out of intake. |
| R-6 | Stored ownership contract (owner/team/due/next-action/next-owner/escalation) on every record | **NOT** | Only orders have owners (`order_assignment`). Sessions + inquiries have no assignee. |
| R-7 | Sales blocked from `payment_status` / `sap_order_no` | **IMPL** | `fn_guard_orders_sales_fields` (42501). |
| R-8 | Ops can reassign order owners | **IMPL** | `Worklist.tsx reassign()` via `fn_transfer_line`/`order_assignment`, confirm+reason. |

### 1e. Handoffs

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| H-1 | Handoff = transaction (completeness → send → Accept/Return → transfer + SLA) | **NOT** | Endorsement is still a dropdown/next-step button (`Worklist.tsx NEXT` map). No accept/return receipt, no completeness gate, no sender-queue clear on accept. Stage order is now DB-enforced but that is *sequencing*, not *handoff*. |
| H-2 | Explicit dual sales/fulfillment ownership on endorsement | **DEF** | `schedule.operations_owner`/`sales_owner` columns noted as existing but UI unwired. |

### 1f. Records / dashboards / customer

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| D-1 | Role-specific dashboards, every KPI drill-through | **NOT** | Dashboard is one view for all; only "Sessions at risk" drills, other KPIs dead-end. |
| D-2 | Standard record page (SessionDetail pattern) on OrderDetail + ClientDetail | **NOT** | OrderDetail/ClientDetail still long single-column; SessionDetail is the lone tabbed page. |
| D-3 | Central customer record (Client under Organization + Inquiry) | **DEF** | CRM data-model change; deferred. |
| D-4 | Activity timeline on every record | **PART** | Present on some records via `activity.ts`; not standardized. |

### 1g. Payments / finance / audit

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| F-1 | Refund/void/credit model (stop hard-deleting payments) | **DEF** | "Refund" still a hard payment DELETE with un-persisted reason; no credit note. |
| F-2 | Overpayment guard (validate ≤ balance) | **NOT** | AR recomputes, does not reject. |
| F-3 | Currency: commit PHP-only + label, or add `currency`/`fx_rate` | **PART** | Committed to PHP-only + "All amounts in PHP (₱)" caption (Orders/Worklist). No multi-currency. Acceptable per decision; still means multi-country orders show PHP only. |
| F-4 | Audit-grade before/after values (not field-names only) | **NOT** | `changed_fields` is field-names only. |
| F-5 | Payment-exception flagging | **DEF** | DB automation, MCP-down, deferred. |

### 1h. Roster / participants / SLA / automation

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| A-1 | CSV roster import (stop typing every attendee) | **NOT** | Every attendee typed. |
| A-2 | Single-participant transfer / substitute / soft-cancel | **NOT** | Remove is a HARD delete; no substitute/soft-cancel. |
| A-3 | SLA escalation ladder (owner→supervisor→BO) + auto-task on breach | **PART/DEF** | `v_sla_breach` surfaced in My Work + Worklist notice with a "Notify owners" button (`fn_notify_sla_breaches`). No ladder, no in-context "you are late" banner on the record, no auto-task. |
| A-4 | Auto inquiry assignment (round-robin) | **DEF** | MCP-down; deferred. |
| A-5 | Prep-deadline tasks (T-14/T-7/T-3) | **DEF** | Deferred. |
| A-6 | Auto status transitions (Tentative→Confirmed, order→Closed) | **DEF** | Deferred (judgment-adjacent). |

### 1i. Design system / a11y / responsive

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| U-1 | Darken `--text-faint` to pass AA | **IMPL** | `#8f8f8f → #6b6b6b`. |
| U-2 | Shared `:focus-visible` ring | **IMPL** | Applied to nav/tab/linkbtn/seg/cmdk/cal-event/back-link/button. |
| U-3 | Chart "View as table" toggle | **IMPL** | `ChartTable`/`ChartTableToggle` on Dashboard/Reports/Quality. |
| U-4 | Status not by color alone | **IMPL** | Calendar risk text tag + month-grid status token. |
| U-5 | Sticky first column on wide tables | **IMPL** | `table.sticky-1` on Worklist/Orders (≤1200px). |
| U-6 | Tokenize hard-coded pill hexes | **IMPL** | `--pill-purple`/`--pill-pink`. |
| U-7 | Migrate/retire `--tr-*` aliases | **NOT / N/R** | ⚠ Still used inline: `var(--tr-amber)`/`var(--tr-red)` in `Home.tsx`, `MyWork.tsx`, `Worklist.tsx`. Logged as low-value churn — treat as **N/R** unless a brand decision reopens it. |
| U-8 | Collapse duplicated dark palette to one block | **N/R** | Correctly rejected — both blocks needed for the theme toggle. |
| U-9 | Icon-only rail at 861–1180px | **DEF** | Shell-layout risk; `sticky-1` delivers the core laptop win. |
| U-10 | Required markers + inline field errors (SalesEntry) | **IMPL** | `.req-star` + `.field-error` + `.invalid`. |
| U-11 | Reference/SAP format check | **IMPL** | Non-blocking `^[A-Za-z0-9-]{3,30}$`. |
| U-12 | Inline duplicate-client warning at entry | **IMPL** | `usePossibleDuplicateClients(email)` banner in SalesEntry. |

### 1j. Admin / calendar / reports

| # | First-pass recommendation | Class | Evidence |
|---|---|---|---|
| M-1 | Admin lookups/config console (stages/methods/channels editable) | **NOT** | Still string literals in TSX (`Worklist.tsx STAGES`); changing needs a deploy. |
| M-2 | Invite / deactivate auth users from Admin | **NOT** | Not present. |
| M-3 | Calendar week/day view + session drawer | **NOT** | Month + card-collapse only. |
| M-4 | "Operations Today" command center | **NOT** | `v_digest_*` views feed only the nightly job, no screen. |
| M-5 | Reports global date-range control | **NOT** | Absent. |
| M-6 | Session-health inputs (meeting-link, materials_ready, special_requirements) | **NOT** | Fields not added. |
| M-7 | Server-persisted saved views | **NOT** | Still ephemeral URL params. |

**Ledger headline:** the first-pass **correctness/P0 layer is genuinely closed**
(merge, stage guard, dedup, reminders-wiring, SessionForm, a11y, capture-time
validation). What remains is almost entirely **structural** — role model,
ownership, handoffs, IA consolidation, records, finance, and the DB-automation
slice that the MCP outage forced to defer. Two doc-vs-reality mismatches to carry
forward: **S-2** (health not read consistently) and **N-2** (redundancy grew, not
shrank).

---

## 2. Post-remediation gap analysis

Organized by area. Emphasis on **technically-correct-but-operationally-inefficient**
gaps — the things that pass a build and an RLS check but still make an operator
click more, type more, or guess who owns the next step.

### 2.1 The headline second-pass finding — additive My Work grew the surface, didn't consolidate it

The first pass prescribed **one** operating surface: *"Unify Home + Worklist +
DataQuality into a single My Work."* The remediation instead **added** `/my-work`
next to the untouched originals. Current state, verified in code:

| Surface | File | Computes | Overlap |
|---|---|---|---|
| Home "Needs your attention" cards | `Home.tsx:109–137` | belowMin (ad hoc), unassigned, stalled, dupCount, pending approvals | role-sliced KPI launcher |
| Home embedded "My Work" section | `Home.tsx:175–288` | tasks, unread notifications, pending approvals | **duplicates the /my-work screen** |
| My Work screen | `MyWork.tsx` | tasks, approvals, orders-needing-attention, session health, SLA | superset of Home's embedded block |
| Fulfillment (Worklist) | `Worklist.tsx` | same order predicates (`isStalled`/`isUnowned`/`isOverdue`) as the workbench | the actual work table |
| Data quality | `DataQuality.tsx` | unowned + stalled + overdue + belowMin + unstaffed + dups | **superset of Home's super_admin cards** |

So the same exception predicates (`isStalled`, `isUnowned`, `isOverdue`,
`orderNeedsAttention`) are now evaluated and rendered on **four** screens, and
"tasks assigned to me" renders on **two** (Home *and* My Work). An operator asking
"what needs my attention?" gets four different partial answers. This is the
central structural regression of the remediation pass and the anchor for §3.

**Worse:** the surfaces disagree. Home/DataQuality use `belowMin` (raw
`booked < min` from `useSchedules`); My Work/Calendar use `v_session_health`. A
session can be "below minimum" on Home yet "Healthy" (proximity-weighted, far out)
on My Work. The single-source-of-truth the health model was built to provide is
defeated at the point of consumption.

### 2.2 Role fit

Four DB roles still wear eight jobs. Operationally this shows up as:
- **Intake has no owner.** Ops — who process webshop orders — cannot open
  `/inquiries` or `/sales-entry` (`roles.ts:29,31`). Webshop orders are hand-rekeyed
  by whoever happens to look.
- **Auditor = super_admin.** Reading the audit log requires the most powerful
  role; there is no read-only path (`roles.ts:55`).
- **Sales Manager is a flag.** `is_supervisor` widens RLS but gives no distinct
  surface, no team roll-up screen, no "my team's stalled orders" view beyond the
  generic Worklist `who=all`.
- **BO is exec + operator.** Same person approves cancellations, writes payments,
  and edits pricing — no separation of duties, and no read-only management view for
  leadership who should not be able to mutate.

### 2.3 Workflow logic

- **Stage sequencing ≠ workflow.** `fn_orders_stage_guard` enforces *order* of
  stages but nothing about *readiness* to advance. "Endorse to Ops" fires on a
  stage with blank contact/country/roster — the completeness gate (S-5) is still
  open.
- **No convert-from-lead path.** Inquiry has no detail page, no next-action, no
  "convert to order." A lead that matures is retyped as a new sales order.
- **Quote→order retypes every line.** `SalesEntry` does not read `quote_line` on
  `?quote`; it writes a placeholder header (seats=1, amount=0, first-line modality)
  and the operator re-enters everything. Reuse was one join away.

### 2.4 Ownership

- Only orders carry a stored owner. **Sessions and inquiries have no assignee** —
  so "who owns the next step?" is unanswerable for two of the three core entities.
- Ownership is a single field, not a contract: no due date, next-action, next-owner,
  blocking-reason, or escalation-state stored on the record. My Work infers all of
  this at render time from predicates, so it cannot show *"assigned to you 3 days
  ago, due tomorrow, blocked on roster."*

### 2.5 Handoffs

- The endorsement handoff is still a `<select>`/button, not a transaction. No
  completeness check, no ops **Accept**/**Return-for-correction**, no sender-queue
  clear on accept, no SLA timer started at handoff. The one moment where work
  changes hands is the least-instrumented step.

### 2.6 Navigation / IA

- Grouping is real progress, but the groups fight the workflow: **Fulfillment and
  Duplicates sit under "Sales"** though they are ops work; **Orders** is under
  Sales rather than its own spine; there is **no Finance/Payments** group (payments
  hide inside OrderDetail); **Analytics is three items** under "Insights."
- **Duplicates is gated `['super_admin','sales']` but the merge RPC is
  ops/super_admin only** (`Duplicates.tsx` comment: sales "hits the RLS wall"). A
  sales user is shown a screen whose primary action they cannot perform — a
  role/action mismatch that produces a guaranteed error.

### 2.7 Screen architecture

- No adopted record-page standard. SessionDetail is the tabbed reference; OrderDetail
  and ClientDetail remain long single-column scrolls. No breadcrumbs anywhere.
- Home mixes two jobs on one page (a KPI launcher **and** a work list), so it is
  neither a clean dashboard nor a clean queue.

### 2.8 Record layouts

- OrderDetail buries payments, AR, participants, and activity in one column; an
  operator scrolls to find the outstanding balance. The right-rail "owner / next
  action / next owner / due" pattern from the future-state anchor exists nowhere.

### 2.9 My Work

- Missing the "why now" ranking: sections are entity-typed (tasks, orders,
  sessions, SLA) not urgency-ranked across types. A due-tomorrow task and a
  90-days-over SLA breach live in separate sections; nothing merges them into "top
  5 things right now."
- Approvals row is a **link out** (`Decide ›` → `/approvals`), not an inline
  decide — a BO cannot approve from My Work, defeating the mobile-approval use case
  the first pass called for.
- Self-scoping is correct but silent: a rep sees "My orders needing attention" with
  no way to peek at team load without leaving for Worklist.

### 2.10 Dashboards

- One dashboard for all roles; only "Sessions at risk" drills through. Every other
  KPI is a dead end — the operator sees a number and cannot reach the records
  behind it. Contrast with DataQuality/Home cards, which *do* deep-link — so the
  drill-through pattern exists in the codebase and is simply not applied to
  Dashboard.

### 2.11 Customer structure

- `inquiry` has no `client_id`; Client, Organization, and Inquiry are three
  unlinked tables across two screens. A lead never resolves to a customer, and
  ClientDetail never shows the inquiries that became its orders. "Customer 360" is
  impossible without the join.

### 2.12 Sales

- SalesEntry is a non-transactional 4-write saga (no `fn_create_order` RPC). A
  partial failure leaves a placeholder header with seats=1/amount=0. Correct-looking
  in the happy path, silently corrupt on error.

### 2.13 Training ops

- Sessions have no owner (2.4). No CSV roster import, no substitute/transfer,
  hard-delete removal (2.15). No week/day calendar, no session drawer — every
  session interaction is a full navigation to SessionDetail.

### 2.14 Payments

- "Refund" is a hard DELETE with an un-persisted reason; payments are mutable and
  deletable; no credit-note or void concept. No overpayment guard. Financially the
  most fragile area and untouched by the remediation.

### 2.15 Auditability

- `changed_fields` records which fields changed, not their before/after values —
  not audit-grade. Combined with mutable/deletable payments, a refund leaves no
  reconstructable trail. And the only role that can read the log is super_admin.

### 2.16 Admin

- Stages, methods, and channels are string literals in TSX (`Worklist.tsx:15`
  `STAGES`); changing a lookup needs a code deploy. No user invite/deactivate.

### 2.17 Automation

- The detection scaffolding is strong and mostly live (hygiene, worklist tasks,
  session health, reminders-queued). The **paperwork** automations that would
  remove manual typing — auto inquiry assignment, prep-deadline tasks, escalation
  ladder, payment-exception flags, auto status transitions — are all deferred
  behind the MCP-validator outage. None are judgment calls; all are safe to build
  once validation is restored.

---

## 3. Redundancy audit (Part 43)

Duplicate screens, functions, metrics, statuses, and nav still present after the
remediation.

### 3.1 Duplicate operational surfaces

| Redundant pair/group | Evidence | Same underlying compute |
|---|---|---|
| **Home embedded "My Work" ↔ `/my-work` screen** | `Home.tsx:175–288` vs `MyWork.tsx` | tasks (`useMyTasks`), approvals (`useApprovals`), notifications — rendered twice |
| **Home cards ↔ DataQuality tiles** | `Home.tsx:128–133` (super_admin) vs `DataQuality.tsx:55–62` | unowned/stalled/overdue/belowMin/dups — DataQuality is a superset |
| **My Work "orders needing attention" ↔ Worklist views** | `MyWork.tsx:130–139` vs `Worklist.tsx` `ORDER_VIEWS` | same `isStalled/isUnowned/isOverdue` predicates |
| **My Work SLA section ↔ Worklist SLA notice** | `MyWork.tsx:339–372` vs `Worklist.tsx:219–229` | both read `useSlaBreaches()` |
| **DataQuality ↔ My Work session attention** | `DataQuality.tsx` belowMin vs `MyWork.tsx` health | **and they disagree** (belowMin vs v_session_health) |

**Recommendation:** retire Home's embedded work block and DataQuality as a screen;
make My Work the single work surface with an "Exceptions / Data health" tab; keep
Home only if it becomes a pure role-KPI launcher (every card drill-through), or
absorb it into My Work entirely per the future-state anchor.

### 3.2 Duplicate analytics screens

Dashboard / Reports / Feedback-and-quality — three Recharts surfaces, three nav
items under "Insights". Consolidate to one Analytics area with tabs
(Overview/Reports/Feedback).

### 3.3 Duplicate customer screens

Clients + Organizations — two nav items, two detail pages for one "customer".
Merge into a Customer 360 record.

### 3.4 Duplicate / conflicting metrics

- **"Sessions below minimum" computed two ways** (belowMin vs v_session_health) —
  §2.1. One truth, one query.
- **Order attention count** appears on Home, My Work, Worklist, and DataQuality with
  four independent filter expressions of the same predicates.

### 3.5 Duplicate status vocabularies

- **"Learning format" ×3** — `modality` enum / "Learning Type" / friendly label —
  unresolved; `MyWork.tsx:327` renders raw `s.modality`.
- Bare "status" still used for four distinct axes (order stage / payment / session /
  health) without disambiguating labels.

### 3.6 Navigation redundancy / mislabeling

- `Worklist.tsx` renders title **"Fulfillment"** (nav label matches) but the file,
  route (`/worklist`), and query keys are "worklist" — terminology drift persists.
- `Duplicates.tsx` nav label is **"Duplicates"** but the screen `<h1>` is
  **"Duplicate resolution"**.
- Duplicates nav-gated to sales, action ops-only (§2.6).

---

## 4. Top-20 remaining friction workflows (Part 44)

Scored 1–5 (5 = worst) across nine dimensions. **Friction rank** = sum. Excludes
anything fixed in Phases 1–4 (merge, stage guard, dedup-on-insert, reminders
wiring, SessionForm, a11y, capture-time validation, inline dup-client warning).

Legend: Freq = frequency · Impact = business impact · Clk = clicks · Scr = screens
touched · Type = manual typing · Err = error risk · RoleA = role ambiguity ·
OwnA = ownership ambiguity · Cog = cognitive load.

| # | Workflow | Freq | Impact | Clk | Scr | Type | Err | RoleA | OwnA | Cog | **Rank** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Quote → sales order (retype every line, `SalesEntry` ignores `quote_line`) | 5 | 5 | 4 | 3 | 5 | 5 | 2 | 3 | 4 | **36** |
| 2 | Endorse order to ops (no completeness gate, no accept/return) | 5 | 5 | 2 | 3 | 2 | 5 | 4 | 5 | 4 | **35** |
| 3 | Webshop order intake / re-key (ops locked out, `roles.ts:29,31`) | 5 | 5 | 4 | 3 | 5 | 4 | 5 | 3 | 3 | **37** |
| 4 | Build a roster (type every attendee, no CSV import) | 4 | 4 | 5 | 2 | 5 | 4 | 2 | 2 | 3 | **31** |
| 5 | Convert an inquiry to an order (no detail page, no convert) | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 4 | 4 | **38** |
| 6 | Answer "what needs me now?" across Home/MyWork/Worklist/DataQuality | 5 | 4 | 4 | 4 | 1 | 3 | 3 | 4 | 5 | **33** |
| 7 | Refund a payment (hard delete, un-persisted reason) | 3 | 5 | 2 | 2 | 3 | 5 | 3 | 3 | 4 | **30** |
| 8 | Substitute / transfer one participant (hard delete + re-add) | 3 | 4 | 4 | 2 | 4 | 5 | 2 | 2 | 3 | **29** |
| 9 | Approve a cancellation from My Work (link-out, no inline decide) | 4 | 4 | 3 | 3 | 1 | 2 | 3 | 4 | 3 | **27** |
| 10 | Find a customer's full history (Client/Org/Inquiry unlinked) | 4 | 4 | 4 | 4 | 2 | 3 | 3 | 3 | 4 | **31** |
| 11 | Read outstanding balance / AR on OrderDetail (single-column scroll) | 4 | 4 | 3 | 1 | 1 | 2 | 2 | 3 | 4 | **24** |
| 12 | Duplicate review as a sales user (sees screen, merge RLS-blocked) | 2 | 3 | 2 | 2 | 1 | 5 | 5 | 3 | 3 | **26** |
| 13 | Assign / own a session (no assignee exists) | 4 | 4 | 3 | 3 | 2 | 3 | 3 | 5 | 3 | **30** |
| 14 | Escalate a stuck order (notify-button only, no ladder) | 3 | 4 | 3 | 2 | 2 | 3 | 3 | 5 | 3 | **28** |
| 15 | Drill from a Dashboard KPI to its records (only 1 of N drills) | 4 | 3 | 3 | 2 | 1 | 2 | 2 | 2 | 3 | **22** |
| 16 | Global search for a person by email/phone/participant | 4 | 3 | 3 | 2 | 3 | 3 | 1 | 1 | 3 | **23** |
| 17 | Change a lookup value (stage/channel string literals → deploy) | 2 | 3 | 2 | 1 | 3 | 4 | 3 | 2 | 2 | **22** |
| 18 | Reconstruct who-changed-what (field-names only, no before/after) | 2 | 4 | 2 | 2 | 1 | 4 | 4 | 3 | 4 | **26** |
| 19 | Plan a week in Calendar (month-only, no week/day, no drawer) | 3 | 3 | 4 | 3 | 1 | 2 | 2 | 2 | 3 | **23** |
| 20 | Run a date-bounded report (no global date-range control) | 3 | 3 | 3 | 2 | 2 | 2 | 2 | 1 | 3 | **21** |

**Top cluster (rank ≥ 33):** inquiry→order conversion (38), webshop intake (37),
quote→order retype (36), endorsement handoff (35), and the four-surface "what needs
me" hunt (33). All five are **workflow-shape** problems, not UI polish — they are
where the "database-shaped, not workflow-shaped" through-line still bites hardest.

---

## 5. Quick wins (Part 45)

High-impact / low-effort, **not** already shipped in Phases 1–4. Each is a label,
default, link, column, visibility, empty-state, confirmation, or default-value
change — no new data model.

| # | Quick win | Where | Why it pays off |
|---|---|---|---|
| 1 | **Retire Home's embedded My Work block**; link the "My Work" heading to `/my-work` | `Home.tsx:175–288` | Kills the biggest duplicate render; one source for tasks/approvals |
| 2 | **Point Home/DataQuality "below minimum" at `v_session_health`** | `Home.tsx:97`, `DataQuality.tsx:51` | Removes the metric that contradicts My Work/Calendar |
| 3 | **Fix Duplicates nav gate** to `['super_admin','operations']` (match the RPC) | `roles.ts:34` | Stops showing sales a screen whose action RLS-blocks them |
| 4 | **Relabel** screen `<h1>` "Duplicate resolution" → "Duplicates" (match nav) and file title "Fulfillment" consistency | `Duplicates.tsx:65` | Terminology consistency, zero logic |
| 5 | **Inline "Approve / Reject" buttons** on My Work approvals rows (instead of `Decide ›` link) | `MyWork.tsx:255` | Enables mobile BO approval; removes a screen hop |
| 6 | **Move Fulfillment + Duplicates under an "Operations" (or "Orders") group** | `roles.ts:33–34` | IA matches who does the work |
| 7 | **Add a "Team" toggle** on My Work orders section for supervisors | `MyWork.tsx:267` | Lets a Sales Manager see team load without leaving for Worklist |
| 8 | **Make every Dashboard KPI a drill-through** using the existing `Link`-card pattern from DataQuality | Dashboard | Turns dead-end numbers into navigation; pattern already in repo |
| 9 | **Default Worklist `who` filter** already role-aware; add a saved-view chip row (URL presets: "My stalled", "Unassigned", "Overdue") | `Worklist.tsx` | Named entry points without server-persisted views |
| 10 | **Render friendly learning-format label** instead of raw `modality` | `MyWork.tsx:327` | Removes one of the three vocabularies at the cheapest surface |
| 11 | **Add an "Owner: Unassigned" warning chip** on sessions in My Work / SessionDetail | `MyWork.tsx:319`, SessionDetail | Surfaces the missing-assignee gap until real ownership lands |
| 12 | **"Seats/revenue still doubled" empty-state note** on Duplicates when a candidate is Dismissed (not merged) | `Duplicates.tsx:47` | Makes the reconciliation state explicit |
| 13 | **Reason required (not optional)** on refund/payment-delete confirm | Payment panel | Cheapest audit improvement before the finance model lands |
| 14 | **Cross-link Client → its inquiries** by matching email (read-only), pending the real `client_id` join | ClientDetail | Approximates Customer 360 with a query, no schema change |
| 15 | **Add a global date-range param** (`?from&to`) honored by Reports charts | Reports | Unlocks bounded reporting with URL state only |
| 16 | **Breadcrumb from route** (≤3 levels) as a tiny shared primitive | Shell | Orientation on records; pure presentation |
| 17 | **"Best on a larger screen" note** on SalesEntry/Reports at phone widths (don't ship broken tables) | globals + screens | Honors the mobile strategy without new layouts |
| 18 | **Prefill SalesEntry header from `quote_line`** read-only preview when `?quote` present (even before a full RPC) | `SalesEntry` | Removes most of the #1-ranked retype friction cheaply |
| 19 | **Show "Due / age" consistently** — My Work orders show `days_in_stage`; add the same to the session and SLA rows' most-urgent-first ordering already exists, expose the number | `MyWork.tsx` | Answers "is it progressing?" at a glance |
| 20 | **Empty-state copy that names the owner of the next step** on each My Work section (e.g. "Nothing for you — ops owns intake") | `MyWork.tsx` | Answers design-test Q4 even when a section is empty |

Items 1–4 are effectively **bug-grade** (redundant render, contradictory metric,
role/action mismatch, label drift) and should lead.

---

## Appendix — files inspected for this pass

`src/lib/roles.ts`, `src/screens/Home.tsx`, `src/screens/MyWork.tsx`,
`src/screens/Worklist.tsx`, `src/screens/DataQuality.tsx`,
`src/screens/Duplicates.tsx`, `src/lib/orderState.ts` (predicate names),
`src/lib/health.ts` (health render), plus baseline docs
`docs/qa/ux-review/{README,05-quality-automation-design-roadmap,PHASE-1-2-EXECUTION,PHASE-3-4-EXECUTION}.md`.
