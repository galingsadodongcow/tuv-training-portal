# My Work & Role Dashboards — Second Pass

> Covers Parts 10, 11, 31. Grounded in the *current* code: `src/screens/MyWork.tsx` (the shipped `/my-work`), `src/screens/Home.tsx`, `src/screens/Worklist.tsx`, `src/screens/DataQuality.tsx`, `src/screens/Dashboard.tsx`, `src/lib/orderState.ts` predicates, `src/lib/health.ts` + `v_session_health`. Baseline: `docs/qa/ux-review/02-ia-navigation-my-work-screens.md`.
>
> **The design test** (every operational surface must answer): 1. What needs my attention? 2. What do I do next? 3. Where? 4. Who owns the next step? 5. Is it progressing correctly?

---

## Part 10 — My Work, deep evaluation

`/my-work` **EXISTS** (`MyWork.tsx`, all roles). This is not a proposal for a new screen — it is an evaluation of a shipped one, and a recommendation to make it *the* operating surface.

### 10.1 What it renders today

Five sections, each via a shared `Section` frame that resolves loading/error/empty consistently:

| # | Section | Source hook(s) | Scope | Inline action | Answers |
|---|---|---|---|---|---|
| 1 | Tasks assigned to me | `useMyTasks(userId)` | self | **Mark done** | Q1, Q2 |
| 2 | Approvals to decide | `useApprovals` filtered `Pending`, gated `canDecide` (BO/super_admin) | all | link → `/approvals` | Q1, Q4 |
| 3 | Orders needing attention | `useFulfillmentQueue` + `orderNeedsAttention` (`isStalled∥isUnowned∥isOverdue∥isPaidUnendorsed∥isNoFeedback`), `primaryFlag`-sorted | **self-scoped** unless supervisor/non-seller (`selfScoped = !!myCode && !is_supervisor`) | link → order | Q1, Q3, Q5 |
| 4 | Sessions needing attention | `useSessionHealth` (`v_session_health`) ∩ `useOpenSchedules`, `healthNeedsAction`, weight-sorted | all | link → session | Q1, Q5 |
| 5 | Exceptions / SLA breaches | `useSlaBreaches` (`v_sla_breach`) | all | link → order | Q1, Q5 |

This is already a strong answer to Q1/Q5. It is **weak on Q2 (what do I do next — one action vs a link) and Q4 (who owns the next step)**, and it does not scope to team.

### 10.2 Should it become the main operating surface? — Yes.

`MyWork` is strictly richer than `Home` (§13.1 of `06-information-architecture.md`): it has real session health, SLA breaches, self-scoping, and `primaryFlag` sorting that Home only approximates with count cards. Home's unique content is (a) the role KPI band `cardsByRole` and (b) a notifications stream that **already lives in the header bell** (`NotificationCenter.tsx`). **Recommendation:** absorb Home's KPI band into My Work as an "attention band," drop the duplicate notifications stream, **retire `/home`**, and land users on `/my-work`.

### 10.3 Belongs / doesn't belong / duplicated

| Verdict | Item | Why |
|---|---|---|
| **Belongs** | Tasks, Orders-needing-attention, Sessions-needing-attention, SLA breaches | Core "waiting on me" streams; the reason to open the screen. |
| **Belongs, gated** | Approvals to decide | Correct to gate `canDecide`; correct to show waiting-age. |
| **Duplicated elsewhere** | Tasks + Approvals sections | **Byte-for-byte duplicated in `Home.tsx`** (same hooks, same JSX). Retiring Home removes the dup. |
| **Duplicated (predicates)** | Orders/SLA exceptions | Same `isUnowned/isStalled/isOverdue` predicates power `DataQuality.tsx` (6 tiles) and `Worklist` `ORDER_VIEWS`. Fold DataQuality in as an **Exceptions** section. |
| **Doesn't belong here** | Org-wide notifications stream | The header bell owns "something happened"; My Work owns "act on this." |
| **Should be inline, not drill-through** | Order rows (Advance/Claim), Approvals (Approve/Reject), Sessions (Assign trainer/Go decision) | Today rows 3-5 are **read-only links**. Worklist already proves inline advance/claim/bulk works — bring that engine here. |

### 10.4 Inline action vs drill-through

Current My Work is **almost entirely drill-through** (only "Mark done" acts in place). The five-questions test fails Q2 for four of five sections — you can see the problem but must leave to fix it. Bring `Worklist`'s proven inline verbs into My Work:

- **Orders:** `→ Next stage` and `Claim` inline (reuse `Worklist.advance` / `selfAssign`).
- **Approvals:** `Approve` / `Reject` inline for `canDecide` (the Approvals screen already has the mutation).
- **Sessions:** `Assign trainer` / `Go-decision` inline where the health signal is staffing/pax.
- **SLA:** the `Notify owners` button (`fn_notify_sla_breaches`) already exists on `Worklist` — surface it in the Exceptions section for ops/super_admin.

Keep drill-through as the *secondary* click; the row's primary affordance should be the next action.

### 10.5 Missing sections (vs first-pass ideal §3)

`MyWork` has tasks / approvals / orders / sessions / SLA. It is **missing** these named streams — each maps to data already present:

| Missing section | Definition | Data available? |
|---|---|---|
| **Returned to me** | Records bounced back for correction | ❌ needs handoff Return-for-correction (ledger: handoff-as-transaction not built) |
| **Due today / this week** | Tasks with `due_date` in window | ✅ `useMyTasks` has `due_date` (only "overdue" styled today) |
| **Waiting on others** | I endorsed/handed off; awaiting the receiver | ⚠️ partial — needs owner/next-owner fields (ledger: sessions/inquiries have no owner) |
| **Certs pending** | Completed sessions, certificates unissued | ✅ derivable from schedule status + certificate rows |
| **Escalations** | SLA breach past owner→supervisor→BO ladder | ⚠️ `v_sla_breach` exists; the *ladder* doesn't (ledger: no escalation ladder) |

### 10.6 Saved views & scope — the biggest gaps

- **No team scope.** `selfScoped` is binary: a plain rep sees only their own orders; a supervisor sees everyone's. There's no **Mine · My team · Unassigned · Everyone** toggle. A Sales Manager can't see "my team's stalled orders" as a scope — the concept isn't in the UI.
- **No saved views.** Filters are absent entirely on My Work (unlike Worklist's URL params). No persisted "My Open Work," "Due Today," "Team Escalations."
- **Not role-specific.** Every role sees the same five sections in the same order. An ops user leads with Sessions; a rep leads with Orders; a BO leads with Approvals — the section *order and emphasis* should follow the role.

### 10.7 Ideal My Work structure

```
┌───────────────────────────────────────────────────────────────────────────┐
│  My Work — Good day, Alan            [Mine ▾ Team · Unassigned · All]  ⚙  │
│  8 need action · 3 overdue · ₱2.4M at risk         Saved: ▸My Open Work ★  │
│  ── attention band (ex-Home cardsByRole, role-shaped, drill-through) ──    │
│  [Unassigned 4→][My stalled 2→][Sessions below min 3→][Pending appr 1→]    │
├───────────────────────────────────────────────────────────────────────────┤
│  ▸ NEEDS ACTION / DUE TODAY (8)                                            │
│  │ ⚠ Approve cancel "ISO 9001 LA" · 12 Aug   waiting 3d [Approve][Reject] │
│  │ ● Endorse order 176152 to Ops             overdue 2d [Advance→][Open]  │
│  ▸ ORDERS NEEDING ATTENTION (14)   [Stalled 5][Overdue 3][Paid-unend. 2]  │
│  │ 176201 Acme · Paid, not endorsed  You · 18d  ₱180k   [Advance→]        │
│  ▸ SESSIONS NEEDING ATTENTION (4)  ▸ CERTS PENDING (11)                    │
│  ▸ WAITING ON OTHERS (6)           ▸ EXCEPTIONS / SLA (3) [Notify owners]  │
│  ▸ RETURNED TO ME (2)              ▸ ESCALATIONS (1)                       │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Header:** greeting + a **scope toggle** (Mine · My team · Unassigned · Everyone — gated by `is_supervisor`/role) + **saved-views** picker (server-persisted).
- **Attention band:** Home's `cardsByRole` KPI cards, role-shaped, each drill-through (keep the "empty until role resolves" guard from `Home.tsx:137`).
- **Sections:** role-ordered; each collapsible with a live count and inline primary action; keep the shared `Section` loading/error/empty frame.
- **Summary line:** "N need action · M overdue · ₱X at risk" so Q1 is answered before scrolling.

Classification: My Work **PARTIALLY IMPLEMENTED** (5 solid read sections). Inline actions, scope toggle, saved views, role-ordering, and the Returned/Due-today/Waiting/Certs/Escalations streams are **NOT IMPLEMENTED**.

---

## Part 11 — Role-specific dashboards

**Current state:** `Dashboard.tsx` renders the **same 6 KPIs + 2 charts for every role** — it never reads `profile.role`. Only **Sessions at risk** is a `<Link>`; the other five KPIs (Booked revenue, Forecast, Delivered revenue, Pending payments, Cancellation rate) and both charts are **dead ends** (`Dashboard.tsx:135-144`). This fails the design test's Q2/Q3 for everyone.

**Rule for every metric below:** it names its drill-through target. A KPI that can't drill doesn't belong on a dashboard.

### 11.1 System Administrator

Above the fold: system health & governance, not revenue.

| KPI | Drill-through target |
|---|---|
| Users pending role / no `sales_id` | → `/admin` filtered to unassigned |
| Duplicate candidates | → `/duplicates` (merge chooser) |
| Records needing attention (all exceptions) | → My Work › Exceptions (org-wide) |
| Failed communications | → `/communications` log filtered failed |
| Orders without an owner | → `/worklist?who=unassigned` |
| RLS/advisor warnings (if surfaced) | → admin governance view |

Remove: revenue/forecast (not the admin's job).

### 11.2 Marketing / Order Coordinator (intake → validate → endorse)

Above the fold: the intake pipeline's throughput and blockers.

| KPI | Drill-through target |
|---|---|
| Awaiting endorsement | → `/worklist?who=all&stage=Endorsed to Ops` |
| Paid, not endorsed | → `/worklist?view=` paid-unendorsed |
| Stalled > 14d | → `/worklist?view=stalled` |
| No feedback | → `/worklist?view=` no-feedback |
| Inquiries aging (unconverted) | → `/inquiries` sorted by age *(needs inquiry health — ledger)* |

Actions: bulk Advance, Notify. Remove: cancellation rate, delivered revenue.

### 11.3 Training Operations (owns sessions)

Above the fold: what's running and what's under-staffed/under-filled.

| KPI | Drill-through target |
|---|---|
| Sessions below minimum | → `/calendar?month=all&sort=fill&dir=asc` |
| Unstaffed sessions ≤ 21d | → `/calendar?month=all` (unstaffed filter) |
| Sessions running this week | → Calendar week view *(week view — ledger, NOT IMPLEMENTED)* |
| Certificates to issue | → sessions Completed, certs unissued |
| At-risk / blocked (`v_session_health`) | → those sessions |

Actions: assign trainer, Go/No-Go, close session. Remove: revenue KPIs, channel mix.

### 11.4 Business Owner (exec + approver)

Above the fold: what needs *my decision*, then the money.

| KPI | Drill-through target |
|---|---|
| Pending approvals | → `/approvals` |
| Booked vs forecast (attainment %) | → Analytics › Reports (revenue) |
| Delivered revenue | → Reports (delivered) |
| AR / overdue collections | → Finance › Receivables |
| Sessions below minimum (no-go risk) | → `/calendar?...sort=fill` |
| Cancellation rate | → orders filtered Cancelled |

The BO is today both exec and operator (ledger); this dashboard serves the *operator* half. The *exec* half is Part 31.

### 11.5 Sales User

Above the fold: my pipeline and my slipping work — self-scoped.

| KPI | Drill-through target |
|---|---|
| My open orders | → `/worklist?who=mine` |
| My stalled orders | → `/worklist?who=mine&view=stalled` |
| My overdue collections | → `/worklist?who=mine&view=overdue` |
| My weighted pipeline | → `/inquiries` mine *(pipeline value)* |
| Sessions needing pax (sell seats) | → `/calendar?...sort=fill&dir=asc` |

Actions: claim, advance, new order, move inquiry. Remove: forecast, delivered revenue, cancellation rate (org-level).

### 11.6 Sales Manager (real team role — NEEDS PRODUCT DECISION)

Today only `is_supervisor` widens scope; no distinct dashboard. Above the fold: team performance and where to intervene.

| KPI | Drill-through target |
|---|---|
| Team pipeline (weighted) | → `/inquiries` team scope |
| Team booked vs target | → Reports team |
| Unassigned in my region | → `/worklist?who=unassigned` (region) |
| Reps over SLA | → `/worklist` + `v_sla_breach` team |
| Team stalled orders | → `/worklist?view=stalled` team |

Actions: reassign (bulk), notify, open team Worklist.

### 11.7 Read-only Management & Auditor

- **Management** → see Part 31 (executive view).
- **Auditor/Compliance** (read-only, NEEDS PRODUCT DECISION — today auditor == super_admin):

| KPI | Drill-through target |
|---|---|
| Changes today | → `/audit` filtered today |
| Deletes this week | → `/audit` filtered deletes |
| Role changes | → `/audit` filtered role-change |
| High-risk writes (payment/pricing) | → `/audit` filtered |

Caveat: `audit_log.changed_fields` is **field-names only, no before/after values** (ledger) — not audit-grade until values are captured. **NEEDS TECHNICAL VALIDATION.**

### 11.8 Implementation note

The drill-through pattern is **already proven** — Home's `cardsByRole` cards and `DataQuality`'s tiles are `<Link>`s carrying exact filter queries. Making Dashboard role-specific is: read `profile.role`, pick a KPI set (mirroring `Home.tsx`'s `cardsByRole` shape), wrap each in a `<Link href>`. Low-risk, high-value. Ship as **Analytics › Overview** (§13.3 of the IA doc).

---

## Part 31 — Management executive view

A distinct dashboard for **Read-only Management** — the person who **intervenes by exception**, never operates. Read-only (never super_admin). One screen, above-the-fold decision surface; every tile drills to the records behind it.

### 31.1 Above the fold

```
┌─ Management — 2026 ─────────────────────── [YTD ▾ QTD · MTD] ──────────────┐
│ Booked ₱42.1M  78% of forecast ▲   │ Pipeline (weighted) ₱11.3M           │
│ Delivered ₱31.4M · 1,204 pax       │ Conversion 34% inq→order             │
│ AR outstanding ₱6.8M · ₱1.2M >60d  │ Session health 8 at risk · 2 blocked │
│ Capacity 62% fill avg              │ Exceptions 5 need exec attention ⚠   │
└───────────────────────────────────────────────────────────────────────────┘
```

### 31.2 KPIs — each with drill-through

| KPI | What it says | Drill-through target |
|---|---|---|
| **Booked vs forecast** (attainment %) | Are we on plan | → Reports › Revenue (by month/channel) |
| **Pipeline (weighted)** | Future coverage | → `/inquiries` weighted pipeline |
| **Conversion** (inquiry→order) | Funnel efficiency | → Reports › Funnel |
| **Delivered revenue + pax** | Realized value | → Reports › Delivery |
| **AR outstanding / aged > 60d** | Cash at risk | → Finance › Receivables aged |
| **Session health** (at risk / blocked) | Delivery risk | → those sessions (`v_session_health`) |
| **Capacity / avg fill %** | Utilization | → `/calendar?sort=fill&dir=asc` |
| **Exceptions needing exec attention** | Where to intervene | → My Work › Exceptions (mgmt scope) |

### 31.3 Intervention-by-exception

Management doesn't work the queue — it reads the **top-right exception tile** and drills only when a number is off-plan. The design test collapses to: **Q1 (what's off-plan?)** → drill → hand back to the owner (Q4). So each exec KPI must expose **not just the number but the owner and the next owner** at the drill target, so management can escalate rather than fix. This requires the **stored ownership contract** (owner/next-owner/escalation-state — ledger, **NOT IMPLEMENTED**); until then the drill lands on the record and management chases ownership manually.

- **Remove from a management view:** anything actionable-by-self (claim/advance/mark-done) — management shouldn't see verbs it won't use.
- **Read-only enforcement:** RLS must make this role read-only (**NEEDS PRODUCT DECISION + DB** — the role doesn't exist yet; management ≈ business_owner today, which can *write* payments and pricing).
- **Date-range control:** YTD/QTD/MTD toggle is required and **missing** — `Dashboard.tsx` hardcodes the active year with no range control (ledger: Reports also lacks a global date range).
