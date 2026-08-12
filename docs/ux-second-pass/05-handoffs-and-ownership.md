# Handoffs & Ownership — Second Pass

> Second-pass review, Parts 8, 9, 28, 29. Grounded in `src/lib/orderState.ts`, `src/hooks/data.ts` (`useMyTasks`, `useApprovals`, `useSlaBreaches`, `useAllNotifications`, `useFulfillmentQueue`, `useSessionHealth`), `src/screens/MyWork.tsx`, `src/screens/Approvals.tsx`, `src/screens/Worklist.tsx`, `src/components/NotificationCenter.tsx`, `src/lib/activity.ts`, and the migrations `20260812000000_phase1_workflow_integrity` (stage guard), `20260808030000_escalation_rules`, `20260808240000_waitlist_sla` (`sla_policy` / `v_sla_breach`). Baseline: first-pass `docs/qa/ux-review/01` §9 and `03` §4–§7.

**The one-line thesis:** ownership and handoffs are the least-designed part of a system whose derived-health layer (`orderState.ts`) already shows how to do them right. Since the first pass, the DB now *orders* stage transitions (`fn_orders_stage_guard`) — but a handoff is still a `<select>` write with **no completeness gate, no two-sided receipt, and no queue-clear on accept**. Ownership is stored for orders only; sessions and inquiries remain owner-less. Everything below extends the discipline that already works for orders to every transactional record.

---

## 1. Ownership framework (Part 8)

### 1.1 Today's answer, per record type

The five questions any operational record must answer are *who owns this / what's next / when's it due / what's blocking / who's next / what if nobody acts*. Today only **orders** answer all of them, and even they answer half by derivation (`orderState.ts`) rather than by stored fields.

| Record | Who owns it now | Next action | Due | Blocking | Next owner | If nobody acts |
|---|---|---|---|---|---|---|
| **Inquiry** | **Nobody** — no assignee column. `Inquiries.tsx` is a kanban with no owner field | Implicit in status; no `next_action`, no task | **None** — aging is manual, no computed flag | Not modeled | Not modeled | Sits in a column forever; no reminder (first-pass `03` §4 "inquiry not contacted (add)") |
| **Quote** | Implicit creator; no assignee | Implicit in `Draft→Sent` | `valid_until` exists; **Expired now auto-fires** via `fn_nightly_hygiene` | No health signal at all | — | Auto-expires (fixed); otherwise no follow-up nudge |
| **Order** | **Stored** — `order_assignment.sales_id` (claim/reassign in `Worklist.tsx`) | Derived — `NEXT[stage]` map + `orderBlockers()` | Derived — `collectionState()` at 23/30d, `isStalled()` at 14d | **Derived, best-in-class** — `orderBlockers()`: Paid-not-endorsed, No owner, No feedback, Stalled | **Implicit** — "Endorsed to Ops" means "ops" but no ops assignee is written | Nightly `fn_generate_worklist_tasks` makes a stalled-order task + `v_sla_breach` surfaces it |
| **Session** | **Nobody** — `schedule` has no assignee | Derived via `v_session_health` + `health.ts` | Proximity-weighted in health, not a stored due date | **Derived** — `v_session_health` (Blocked/At Risk) | Not modeled | Shows in My Work "Sessions needing attention"; no owner to route to |
| **Payment** | Finance/BO implicitly; sales blocked (`fn_guard_orders_sales_fields`, 42501) | Not modeled as a work item | `collectionState` (order-level, not payment-level) | Payment is mutable/deletable; no exception record | — | Overdue collection surfaces as order flag + summary task |
| **Participant** | Ops implicitly (roster owner = session) | Attendance/result entry; cert issue is system | None | Roster gap surfaces on session health (`names<seatsSold`) | — | Roster stays incomplete; no per-participant task |
| **Approval** | BO/super_admin (`canDecide` gate) | Approve/Reject in `Approvals.tsx` | **No due date** on the `approval` row | N/A | Back to requester (ops) — but **no return-for-correction** | After 3d, `fn_generate_worklist_tasks` notifies each decider (notification, **not** a task; no escalation) |
| **Task** | **Stored** — `task.assigned_to` | The task itself | **Stored** — `task.due_date` (surfaced + overdue-styled in `MyWork.tsx`) | `status='blocked'` exists as a value | `escalation_to` **recommended in `03` §5, not built** | System tasks auto-close when condition clears (good); manual tasks just linger |
| **Exception** | **No owner, no record type** — exceptions are *views* (`v_sla_breach`, `duplicate_candidate`, `import_exception`), not owned rows | Varies | Implicit in the breach | The exception *is* the block | — | Recomputed nightly; `import_exception` notifies super_admins once |

**The two glaring holes** (both flagged first-pass, still open):

1. **Sessions and inquiries have no owner.** `order_assignment` exists; there is no `schedule_assignment` and no `inquiry.assigned_to`. My Work can show a session "needs attention" but cannot say *whose* attention, so the item is un-routable and un-escalatable. This is the single highest-leverage ownership gap.
2. **Ownership on orders is half-derived, half-stored, and one-sided.** The owner is stored, but *next action / due / blocker / next owner* are recomputed in `orderState.ts` on every render, and the "next owner" after endorsement is never written (ops inherits implicitly). A supervisor cannot query "orders where the next owner is late" because "next owner" is not a column.

### 1.2 Proposed: one stored ownership contract

Extend the `order_assignment` idea to a single contract every transactional record carries — **stored, not derived** — so the same header strip, My Work row, and right rail read it identically for orders, sessions, inquiries, quotes.

| Field | Type | Source | Notes |
|---|---|---|---|
| `current_owner` | user/sales FK | set on claim / handoff accept | For sessions/inquiries this is the net-new field |
| `current_team` | enum (sales/ops/finance/bo) | set with owner | drives team queues without per-user routing |
| `assigned_at` | timestamptz | set on ownership change | starts the "in my queue" clock |
| `due_date` | date | derived from `sla_policy` at handoff, then stored | computed once *at* the transition, not re-derived every render |
| `expected_next_action` | text/enum | the workflow step | what "next" means, in words |
| `expected_next_owner` | team/role | the workflow's next hop | so "waiting on ops" is queryable |
| `blocking_reason` | text/enum, nullable | `orderBlockers()`/`v_session_health` promoted to stored | null = not blocked |
| `escalation_state` | enum (none/warned/overdue/escalated) | SLA engine writes it | drives the ladder in §4 |
| `ownership_history` | append-only rows | every transfer/accept/return | feeds the activity timeline (`activity.ts` already merges such events) |

**Where each surfaces** (three places, same data):

- **Record header strip** (the "universal handoff header" from `01` §9): `Owner now · Next action · Next owner · Due · Blocker`. Fixed at the top of every OrderDetail / SessionDetail / InquiryDetail / QuoteDetail.
- **My Work** — rows already render owner + flag + days-in-stage; swap the derived `primaryFlag`/`days_in_stage` for the stored `blocking_reason`/`due_date` so the personal queue and the record agree exactly.
- **Right rail** (record-page standard, future-state anchor): Owner · Assigned date · Due · Next action · Next owner · Escalation state · a link to ownership history.

**Keep computed vs. stored separate.** `orderState.ts` stays the authority for *detection* (what's wrong right now). The contract *stores* the answer at the moment of a transition so it is queryable and stable — detection writes `blocking_reason`/`due_date`; it does not replace them on every read. This mirrors the first-pass "status vs. health" rule (`03` §2): process facts are stored and user/action-driven; health is computed — but the *ownership snapshot* at a handoff is a stored fact.

**Classification:** stored ownership contract — **NOT IMPLEMENTED** (orders have a stored owner only; the other eight fields are derived or absent). Session/inquiry assignee — **NOT IMPLEMENTED / NEEDS PRODUCT DECISION** (who owns a session — the coordinator, or a named ops person?).

---

## 2. Handoff design (Part 9) — handoffs as business transactions

### 2.1 Current handoffs, dissected

A handoff is a transaction with a sender, a receiver, a payload, a receipt, and a timer. Today none of them are — they are dropdown writes. `fn_orders_stage_guard` (migration `20260812000000`) now *rejects illegal stage jumps* (enforces forward-only + cancel/reopen), which is real progress over the first pass's "no state machine." But ordering the transitions is not the same as gating or acknowledging them.

| Handoff | Trigger | Sending → receiving role | Required info | Completeness check | Validation | Acceptance | Rejection / return | Ownership transfer | SLA | Notification | Escalation | Visibility after | Activity event |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Coordinator → Sales** (intake claim) | Order needs owner | nobody → sales | none | none | none | claim writes `owner_code` | none | `order_assignment` upsert | `New` 3d (`sla_policy`) | none on claim | nightly only | order leaves `who=unassigned` queue | none written |
| **Sales → Operations** (endorsement) | rep sets `Endorsed to Ops` | sales → ops (**implicit, no ops assignee**) | **none validated** | **NONE** | stage-order guard only | **NONE** | **NONE** | none — ops inherits implicitly | `Endorsed to Ops` 5d | none | nightly `v_sla_breach` | order still shows in sales' team queue | none |
| **Coordinator → Operations** (session/roster) | order fulfilled → session runs | coordinator → ops | none | none | none | none | none | none (session unowned) | session-prep SLA **not built** | none | none | session in ops' My Work by health only | none |
| **Sales → Sales Manager** | supervisor loads team queue | sales → supervisor (view only) | n/a | n/a | n/a | n/a | n/a | `is_supervisor` widens RLS to region | none | none | none | supervisor sees team rows | none |
| **Operations → Business Owner** (approval) | `GoNoGoPanel`/`CancelSession` inserts `approval` | ops → BO | `object_type`, note | none | none | decision writes `decided_by` | Reject with optional note (`Approvals.tsx`) | approval frozen until decided | **no due date** | after 3d, notify decider (`fn_generate_worklist_tasks` step 3) | none | approval in BO queue | `approvalEvents()` in timeline |
| **Operations → Management** | reporting | ops → mgmt (read-only) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | dashboards | n/a |
| **Operational → Auditor** | audit review | ops → auditor | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `AuditLog` (super_admin only today) | audit rows exist |
| **Administrator → employee** | user provisioning | admin → user | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Admin | n/a |

Reading down the "Completeness check / Acceptance / Rejection / Activity event" columns tells the whole story: **the operational handoffs (rows 2–4, the ones that move real work between people) have blanks in every transaction column.** The two that work — approval (row 5) and the RLS-widened manager view (row 4) — do so because approval is the one flow the DB *hard-gates* (`fn_cancel_schedule` refuses without an `Approved` row) and the manager view is just a query scope, not a handoff.

### 2.2 The gap in one sentence

**Stage transitions are now DB-ordered (`fn_orders_stage_guard`), but there is still NO completeness gate before a handoff and NO two-sided receipt after one.** The sender changes a dropdown; the DB checks only that the *order* of stages is legal; the receiver is never asked to accept; and the sender's queue never clears because nothing records that the receiver took the work. `awaitingEndorsement` counts indefinitely (first-pass `01` §5.8).

### 2.3 Recommended ideal handoff pattern

Model every operational handoff as: **trigger → completeness check → send → Accept | Return-for-correction → ownership transfer + activity event + SLA timer.**

```
[Sender]  sets "Endorse to Ops"
   │
   ▼
COMPLETENESS GATE  ── reuse orderBlockers() as a pre-flight ──────────┐
   │  all required fields present?                                    │  fail → inline
   │  (client contact, course, seats, SAP-ready data, no open flag)   │  "cannot endorse:
   ▼  pass                                                            │   3 items missing"
SEND: write handoff row {from, to_team, payload_snapshot, sent_at}    └── (blocks submit,
   │                                                                       like SessionForm's
   │  → notification to receiving team's queue                            conflict-disable)
   │  → SLA timer starts at sent_at (due = sent_at + sla_policy.max_days)
   ▼
[Receiver: Ops]  sees it in "Incoming handoffs" in My Work
   │
   ├─► ACCEPT   → ownership transfers (current_owner=ops, assigned_at=now)
   │              → sender's queue CLEARS (this is the missing piece)
   │              → activity event "Order accepted by Ops"
   │              → SLA clock resets to the next stage
   │
   └─► RETURN FOR CORRECTION (reason required)
                  → ownership returns to sender
                  → sender gets a task, not just a notification
                  → activity event "Returned by Ops: <reason>"
```

Four concrete implementation notes, all reusing machinery that already exists:

1. **Completeness gate = `orderBlockers()` as a pre-flight.** The predicate that already powers the health badge becomes the endorsement guard: if `orderBlockers(o).length`, disable the "Endorse" action and list what's missing — exactly the pattern `SessionForm.tsx` uses to disable submit while double-booking conflicts exist (first-pass called that "the model for other conflict surfaces").
2. **Two-sided receipt.** Add a lightweight `handoff` row (or a `status` on the transition) with `accepted_at` / `returned_at`. Accept clears the sender's queue; nothing else does today.
3. **Timer starts at the handoff, not nightly.** `sla_policy.max_days` already holds the per-stage targets (`New` 3 / `In Communication` 5 / `For Order Creation` 3 / `Endorsed to Ops` 5 / `No Feedback` 7). Compute `due_date = sent_at + max_days` and store it on the contract, so "late" is knowable in-context, not only after the nightly `v_sla_breach` recompute.
4. **Activity event on every hop.** `activity.ts` already merges notes/approvals/tasks/notifications/audit into one timeline but has **no handoff event kind** — add one so the record shows "Endorsed by A → Accepted by B" as first-class history.

**Classification:** completeness gate — **NOT IMPLEMENTED**. Two-sided receipt — **NOT IMPLEMENTED**. Queue-clears-on-accept — **NOT IMPLEMENTED**. Stage-order enforcement — **IMPLEMENTED** (`fn_orders_stage_guard`, but it is ordering, not a handoff transaction).

---

## 3. Six work-signal systems kept separate (Part 28)

These are six *different* things that today partly overlap. Definitions and the honest current-state:

| System | Definition | Modeled today? | Current implementation |
|---|---|---|---|
| **Task** | Someone must *do work* | Yes — `task` table, `assigned_to`, `due_date`, `status`, `dedup_key` | `useMyTasks` → My Work "Tasks assigned to me"; generated by `fn_generate_worklist_tasks`; auto-closes when condition clears |
| **Notification** | *FYI* about something that happened | Yes — `notification` table, `kind` (`system`/`sla`/`approval`) | `useAllNotifications` → `NotificationCenter.tsx` bell; deep-links via `entity_type`+`entity_id`; mark one/all read |
| **Approval** | A *decision* is required | Yes — `approval` table | `Approvals.tsx` + My Work "Approvals to decide" (BO/super_admin gated) |
| **Exception** | A *rule was broken* | Partly — as **views**, not owned rows | `v_sla_breach`, `duplicate_candidate`, `import_exception`; My Work "Exceptions / SLA breaches" reads `v_sla_breach` only |
| **Mention** | A user was *referenced* by another user | **NOT MODELED** | No `@`-mention, no comment threads; notes (`activity.ts` `note`) are un-addressed |
| **System alert** | An automated *breach fired* | Partly | SLA breach → `notification` kind `sla` (via `fn_notify_sla_breaches`); overlaps "Exception" |

**Does the current implementation respect the distinctions? Mostly no.**

- **Task vs. System-alert vs. Exception are conflated.** An SLA breach today can appear as a `notification` (kind `sla`), as a row in `v_sla_breach` (My Work "Exceptions"), *and* — for stalled orders — as a `task`. The same underlying fact wears three costumes with no single "this is an exception, owned by X, do Y" object. First-pass `03` §4 called for exactly this typing; it is still not enforced.
- **Approval-aging emits a notification, not a task.** `fn_generate_worklist_tasks` step 3 *notifies* deciders after 3 days but does not create a task with a due date or escalate — so an aging approval is an FYI, not work (contradicting its own "someone must act → task" rule from `03` §4).
- **Exceptions are viewless-but-ownerless.** They are computed views, so they cannot be assigned, snoozed, or acknowledged. "Fix the duplicate" is nobody's task.
- **Mentions do not exist.** There is no way to pull a specific colleague into a record.

**How each should appear** (one signal, right channel — the routing table from `03` §4, applied to the surfaces that now exist):

| System | My Work | Dashboard | Notification center | Record page | Email |
|---|---|---|---|---|---|
| **Task** | Primary — "Tasks assigned to me", by priority then due | Count tile → drill to My Work tasks | On assignment + on due/overdue | Record's Tasks tab | On assignment + day-of-due digest |
| **Notification** | Not a queue item (it's FYI) | — | Primary home, grouped by day, icon-by-kind | Activity timeline | Batched into digest, never one-per |
| **Approval** | "Approvals to decide" (deciders only) | "Awaiting approval (N, oldest Xd)" → drill to `/approvals` | On new + on aging | Record header ("Pending BO approval") | On new + escalation |
| **Exception** | "Exceptions" section — **owned rows, accept/snooze/resolve**, not just a read-only breach list | "Exceptions open (N)" → drill to My Work exceptions | On new exception + on escalation | Header banner "Blocked: <reason>" (§4) | On escalation only |
| **Mention** | "Mentions" mini-section (net-new) | — | Direct, high-priority, actor shown | Inline in the comment/note thread | Immediate, one-per |
| **System alert** | Folds into Exceptions when it needs action | "Breaches & aging" panel → drill to breaching records | On fire + on escalation step | "You are late" banner (§4) | On escalation, de-duped 3d |

**The key redesign:** promote **Exception** from a set of views to an **owned, actionable row** with the ownership contract from §1 — so an exception has an owner, a due date, an escalation state, and an accept/resolve action, instead of being an anonymous line in `v_sla_breach`. And add **Mention** as the one genuinely missing primitive.

**Classification:** Task/Notification/Approval systems — **IMPLEMENTED** (but leaky boundaries). Exception-as-owned-row — **NOT IMPLEMENTED** (views only). Mention — **NOT IMPLEMENTED**. System-alert vs. exception disambiguation — **PARTIALLY IMPLEMENTED**.

---

## 4. SLA & escalation (Part 29)

`sla_policy` + `v_sla_breach` + `fn_notify_sla_breaches` exist and are surfaced in My Work ("Exceptions / SLA breaches", showing `days_over` / `days_in_stage` / `max_days`) and in `Worklist.tsx` (the amber "N orders past the stage SLA" banner with a "Notify owners" button for ops/super_admin). But the policy **only covers order fulfillment stages** (5 rows: `New`/`In Communication`/`For Order Creation`/`Endorsed to Ops`/`No Feedback`), there is **no escalation ladder** (owner → supervisor → BO), and there is **no in-context "you are late" banner** on the record itself — the breach is only visible in the aggregate My Work list.

### 4.1 Proposed SLA matrix (extends the 5 order-stage rows to the whole workflow)

| Process | Owner | Target | Warn at | Overdue at | Escalation recipient | Notification behavior | Task behavior | Dashboard representation |
|---|---|---|---|---|---|---|---|---|
| **Inquiry response** | Lead's sales | 3d from Received | 2d | 3d | Sales Manager | Warn: center only. Overdue: alert + escalate | Create "Respond to inquiry" task on overdue | "Inquiries unanswered >3d" → drill to inquiry list filtered aging |
| **Sales follow-up** (New→advance) | Order owner | 3d | 2d | 3d | Sales Manager | Overdue: alert + task | Stalled-order task (**exists**, `fn_generate_worklist_tasks`) | "Stalled orders" tile → drill to Worklist `view=stalled` |
| **Order validation** (For Order Creation) | Order owner / Coordinator | 3d | 2d | 3d | Ops lead | Overdue: alert + escalate | Task to owner | "Awaiting validation (N)" → drill to Worklist `stage=For Order Creation` |
| **Payment review** | Finance / owner | 30d from order | 15d (Due soon) | 30d (Overdue) | Finance lead | Warn: `collectionState`='Due soon'. Overdue: alert | Overdue-collections summary task (**exists**, one-per-owner) | "Overdue collections (₱)" → drill to Worklist `view=overdue` |
| **Operations acceptance** (Endorsed to Ops) | Ops | 5d | 4d | 5d | Ops manager | Overdue: alert + escalate | Task to ops owner (needs ops assignee — §1) | "Awaiting ops acceptance (N, oldest Xd)" → drill to endorsed-queue |
| **Session prep** | Session owner (needs assignee — §1) | trainer+venue by 14d before start | 21d out | 14d out | Ops manager | Warn: session health "At Risk". Overdue: "Blocked" | "Confirm trainer/venue" task on warn | "Sessions needing prep" → drill to My Work sessions / Calendar |
| **Approval** | BO | 3d | 2d | 3d | Super admin | After 3d notify decider (**exists, notification only**) | **Add** overdue-approval task | "Approvals aging (N, oldest Xd)" → drill to `/approvals` |
| **Certificate** | Ops | 7d from close | 5d | 7d | Ops manager | Overdue: alert + escalate | "Issue certificate" task on overdue | "Certificates overdue (N)" → drill to session/roster |

Every dashboard metric above states its drill-through target, per the brief. Only the shaded-as-**exists** behaviors are built today; the rest of the table is the gap.

### 4.2 The escalation ladder (not built)

Store `escalation_state` (from §1's contract) and advance it on each SLA tick instead of re-notifying the same owner nightly:

```
none ──warn──► warned ──overdue──► overdue(owner) ──+Nd──► escalated(supervisor) ──+Nd──► escalated(BO)
```

- **warn** — informational only: center + the record's health signal. No task.
- **overdue** — system alert to owner + **auto-create a task for the owner** (today the nightly job makes stalled-order tasks but does not tie them to the ladder or reset on escalation).
- **escalated** — the missing rung: create a task for the **owner's supervisor** using the existing `task`/`useMyTasks` machinery (first-pass `01` §9 point 4), so escalation is in-app and same-day, not a nightly recompute. De-dupe on the existing 3-day window (`fn_notify_sla_breaches` already de-dupes 3d).

### 4.3 The in-context "late" banner (not built)

Today "late" lives only in the My Work aggregate. The record page (OrderDetail / SessionDetail / InquiryDetail) should carry a header banner driven by the stored `due_date` + `escalation_state`:

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ 3 days over the Endorsed-to-Ops target (due Aug 7).        │
│   Owner: A. Cruz · Escalated to: Ops manager · [Accept] [Return] │
└──────────────────────────────────────────────────────────────┘
```

This closes the loop between detection (`v_sla_breach`, already computed) and the place the person actually works (the record), reusing the amber `risk-amber` / `notice-warn` styling already present in `Worklist.tsx` and `MyWork.tsx`.

**Classification:** `sla_policy` / `v_sla_breach` + My Work/Worklist surfacing — **IMPLEMENTED**. Non-order SLA rows (inquiry/payment-review/session-prep/approval/certificate) — **NOT IMPLEMENTED**. Escalation ladder — **NOT IMPLEMENTED**. Auto-task-on-breach — **PARTIALLY IMPLEMENTED** (stalled + collections only; not tied to a ladder). In-context "late" banner — **NOT IMPLEMENTED**.

---

## 5. Priority summary

| # | Change | Blocks what | Effort |
|---|---|---|---|
| 1 | Give `schedule` and `inquiry` an assignee (session/inquiry ownership) | All of §1–§4 for non-order records — nothing is routable/escalatable without it | DB + UI |
| 2 | Completeness gate on endorsement (`orderBlockers()` pre-flight) | Bad handoffs reaching ops; the #3-worst journey (`01`) | Medium, reuses existing predicate |
| 3 | Two-sided receipt (Accept / Return-for-correction) + queue-clears-on-accept + activity event | `awaitingEndorsement` counting forever; sender never knows work landed | Medium |
| 4 | Store the ownership contract (`due_date`, `blocking_reason`, `next_owner`, `escalation_state`) at each transition | Queryability, in-context "late" banner, escalation ladder | DB |
| 5 | Escalation ladder + owner→supervisor→BO auto-tasks | Same-day escalation instead of nightly recompute | Medium, reuses `task` machinery |
| 6 | Promote Exception from views to owned, actionable rows; add Mention primitive | Signal-system boundaries (§3); nobody owns a duplicate/breach | Medium |
| 7 | Extend `sla_policy` beyond order stages (inquiry/payment/session-prep/approval/cert) | Whole-workflow SLA coverage | Low (data rows) + wiring |
