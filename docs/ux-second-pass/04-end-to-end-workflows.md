# End-to-End Workflows — Business Processes, Current vs Ideal, Exceptions

> Part 4 of 5 — second-pass review. Covers mega-prompt Parts 6 (end-to-end
> processes), 7 (current vs ideal per workflow), and 34 (exception workflows).
> Grounded in the current code: `Inquiries.tsx`, `Quotations.tsx`,
> `QuoteDetail.tsx`, `SalesEntry.tsx`, `Orders.tsx`, `OrderDetail.tsx`,
> `Worklist.tsx`, `SessionDetail.tsx`, `RosterPanel.tsx`, `GoNoGoPanel.tsx`,
> `ReceivablePanel.tsx`, `CancelSession.tsx`, `CloseSession.tsx`, and
> `src/lib/orderState.ts`. Baseline: `docs/qa/ux-review/03-forms-status-workflow-frameworks.md`.
> Classifications follow the brief's ledger (IMPLEMENTED / PARTIALLY / NOT / DEFERRED / NEEDS PRODUCT DECISION).

The five-question design test applies to every stage below: **(1) What needs my
attention? (2) What do I do next? (3) Where? (4) Who owns the next step? (5) Is
the process progressing correctly?** Most gaps below are one of two failures:
the record cannot answer *who owns the next step* (no assignee on inquiries or
sessions; handoffs are silent dropdown edits), or it cannot answer *is this
progressing* (health exists for order + session but not inquiry or quote, and
exceptions like refund are undesigned).

---

## 1. End-to-end business processes (Part 6)

Each chain is traced trigger → completion. "Works post-remediation?" classifies
whether the *happy path* is functional after Phases 1–4, not whether it is ideal.

### 1.1 NEW INQUIRY

Chain: a lead arrives (website, referral, event) → someone logs it → it is
worked down the pipeline → it converts to a quote/order or is lost.

| Stage | Screen(s) | Owner | Works post-remediation? |
|---|---|---|---|
| Lead arrives | — (no capture channel; typed by hand) | Sales / super_admin | Manual. No intake automation; `fn_queue_reminders` never touches uncontacted inquiries. |
| Log inquiry | `Inquiries.tsx` create form → `inquiry.status='Received'` | Sales (own) / admin (assigns) | Works. But re-types company/contact/email even when the client exists; no `client_id` link. |
| Advance pipeline | `Inquiries.tsx` kanban `‹`/`›` buttons call `move()` → bare `update({status})` | Lead's sales rep | Works but crude: no confirm, no reason (except `markLost`), no owner reassignment, no aging health. |
| Mark lost | `markLost()` danger-confirm + `lost_reason` | Sales rep | Works. `Closed Lost` + `lost_reason` write — **NEEDS TECHNICAL VALIDATION** vs live `inquiry_status_t` (brief flags possible enum drift). |
| Convert (Closed Won) | **None** — advancing to `Closed Won` dead-ends | — | **Broken.** Won lead is never linked to the order it becomes; no "Create order from lead". Rep re-opens SalesEntry and retypes everything. |

**Verdict:** capture + pipeline movement work; the two ends (auto-detect a
stale lead, convert a won lead) do not. Inquiry has **no detail page, no
assignee beyond `sales_id`, no next-action, and no health signal** — it fails
design-test questions 1, 4, and 5. `Inquiries.tsx` is a whole-pipeline board
with no per-lead workspace.

### 1.2 SALES — quote → order

Chain: rep drafts a quote → adds lines → sends → customer accepts → rep converts
to an order.

| Stage | Screen(s) | Owner | Works post-remediation? |
|---|---|---|---|
| Create quote | `Quotations.tsx` → `insert(quote)` → route to detail | Sales / admin | Works. |
| Add lines | `QuoteDetail.tsx` add-line; `feeFor()` auto-fills unit price; `DiscountHint` suggests | Sales | Works well — auto-price + advisory discount is the model to copy. |
| Send / status | `changeStatus()`; `Declined`/`Expired` danger-confirm | Sales | Works. But `Expired` is **user-selected**, should auto-fire nightly (brief §status). Hygiene now auto-expires Sent quotes past `valid_until` — so the *manual* Expired path is redundant/risky (a rep can pre-empt or contradict it). |
| Accept → convert | Header "Create order" → `router.push('/sales-entry?client=…&quote=<id>')` | Sales | **Half-works.** SalesEntry accepts `?quote=` and, on success, sets `quote.converted_order_id` + `status='Accepted'` — but it **does NOT read `quote_line`**. Every line is retyped. The link is one-directional and post-hoc. |
| Order created | SalesEntry success screen | Sales | Works (see 1.3). |

**Verdict:** the quote itself is the best-built artifact in the sales chain.
The **conversion is the weak seam**: prefill is missing (`SalesEntry.tsx` lines
44–58 handle `?schedule` and `?client` but never `?quote`'s lines), so the
"turn an accepted quote into an order" promise on `Quotations.tsx` line 49 is
only cosmetically true. Quote has no health signal (design-test Q5).

### 1.3 ORDER INTAKE (incl. webshop + duplicate)

Chain: order originates (rep-keyed, webshop reference, or in-house request) →
customer resolved or created → header + lines written → self-assigned → enters
fulfillment at stage `New`.

| Stage | Screen(s) | Owner | Works post-remediation? |
|---|---|---|---|
| Start order | `SalesEntry.tsx` (gated `['super_admin','sales']` — **ops locked out**) | Sales | Works for sales; **operations cannot open intake at all** (brief DEFERRED item; NEEDS PRODUCT DECISION on who owns intake). |
| Resolve customer | New vs existing toggle; `usePossibleDuplicateClients(email)` inline warning; `23505` friendly catch | Sales | PARTIALLY. At-source dup hint works, but cross-rep duplicates hidden by RLS still slip to the `23505` path. No dedup on company/phone. |
| Webshop / reference | `head.order_id` free-text (`60806000000xxx`); non-blocking format check `^[A-Za-z0-9-]{3,30}$` | Sales | Works but fragile: the **hand-keyed order number is the PK** — a collision surfaces as a raw error; no true webshop ingestion, "Webshop" is just a channel value (admin-only). |
| Write order | 4 sequential writes: `client` → `orders` → `order_line[]` → `order_assignment` | Sales | **Works but non-transactional.** Placeholder header `seats:1`, `amount_php:0`, `modality:good[0].modality` (lines 169–172). Compensating `delete` on line-insert failure only; assignment/quote-accept failures swallowed as warnings. Should be `fn_create_order` RPC. |
| Waitlist branch | `isWaitlisted(l)` → `line_status:'Waitlist'`; success screen explains | Sales | Works. Explicit inline warning + success note is good. |
| Enter fulfillment | `fulfillment_stage:'New'`; `router.push('/worklist')` | Sales → (ops) | Works. |
| Duplicate order | `Duplicates.tsx` → `fn_merge_orders(keep,dup,reason)` | Ops / super_admin | IMPLEMENTED. Real merge cancels dup + lines so seats/revenue stop double-counting. |

**Verdict:** intake completes and is safer than first-pass (dup hint, format
check, waitlist clarity, real merge). The two structural problems remain: it is
a **saga pretending to be a transaction**, and it **writes meaningless header
fields** that every downstream reader (`Orders.tsx` shows `total_seats`/
`total_amount` from a view, side-stepping the placeholders — proof the stored
values are dead). Webshop is not a real ingest path.

### 1.4 PAYMENT

Chain: invoice raised → customer pays → payment recorded → `payment_status`
recomputed by AR trigger → collection state clears.

| Stage | Screen(s) | Owner | Works post-remediation? |
|---|---|---|---|
| Raise invoice | `ReceivablePanel.tsx` `addInvoice()` | Ops / BO / super_admin | Works. |
| Record payment | `recordPayment()`; overpayment soft-confirm; `payment_status` set by DB trigger | Ops / BO / super_admin | Works. Sales blocked from `payment_status`/`sap_order_no` (`fn_guard_orders_sales_fields`, `42501`) — read-only in `OrderDetail.tsx` (lines 182–197). |
| Recompute status | AR trigger → `Unpaid/Partial/Paid`; `collectionState()` derives Overdue/Due-soon from `order_date` | System | Works, but collection clock keys off **`order_date`, not invoice due date** (`orderState.ts` line 56–64) — a coarse proxy. `ReceivablePanel` shows a truer `overdueDays` from `due_date` but the order-level flag ignores it. |
| Close-out unpaid | `fn_close_session` moves unpaid orders to collection follow-up | Ops (via close) | Works. |
| Under / overpayment | overpay = soft-confirm; underpay = stays `Partial` | Ops | PARTIALLY — recorded but not *managed* (no exception task, no finance flag). |
| Refund / void | `removePayment()` = **hard DELETE** with un-persisted reason | Ops / BO | **Broken by design.** No refund/void/credit-note model; the reason captured in the confirm is dropped. Payments are mutable/deletable. DEFERRED (DB/architecture). |

**Verdict:** the *collection* path works and is correctly permission-gated. The
*correction* path (refund, void, credit) does not exist — it is a destructive
delete. Payment exceptions (over/under) are detected weakly and never routed to
anyone (design-test Q1/Q4 fail for finance).

### 1.5 TRAINING OPERATIONS — session create → deliver → certs → close

Chain: ops schedules a session → bookings fill it → Go/No-Go decision →
delivery → attendance → certificates → close (locks roster, records actuals).

| Stage | Screen(s) | Owner | Works post-remediation? |
|---|---|---|---|
| Create session | `SessionForm.tsx`; live double-booking check; min/max editable (Phase 1 fix) | Ops | Works. Status picker restricted to Tentative/Confirmed (fixed). **Missing fields**: online-meeting-link, materials_ready, special_requirements (health inputs). |
| Fill / book | Bookings arrive via order lines; `SessionDetail` Orders tab; `fn_rollup_schedule` sets `go_status` | Sales books, Ops watches | Works. `v_session_health` computes Healthy/Needs Attention/At Risk/Blocked (IMPLEMENTED). |
| Go / No-Go | `GoNoGoPanel.tsx`: system advises (`recTone` ladder), ops decides; No-Go → `approval` row | Ops decides; BO approves No-Go | Works, well-designed. "System advises, operations decides" is the model. |
| Confirm Go | `confirmGo()` → `schedule.status='Confirmed'`; below-min requires `armGo` override | Ops | Works. |
| Deliver / Running | Status buttons on `SessionDetail` (`Tentative/Confirmed/Running/Completed`) | Ops | PARTIALLY. `Running`/`Completed` are still hand-settable via the status toolbar (line 266) despite the brief saying they should be date/action-driven; `Completed` has a confirm but bypasses `fn_close_session` unless ops uses the Close button. |
| Attendance | `RosterPanel.tsx` `mark()` → `Registered/Attended/No Show` | Ops / sales / super_admin | Works. But **every attendee is typed by hand** — CSV *export* exists, no *import*. Participant removal is a **hard delete**. |
| Assessment | `setScore()` / `setResult()` (ops only) | Ops | Works. |
| Certificates | `issueOne()` / `issueAll()` → `fn_issue_certificate(s)`; gated on `Attended` | Ops | Works. Cert fields system-set (correct). |
| Close | `CloseSession.tsx` → `fn_close_session(p_force)`; readiness check; force path for unmarked attendance | Ops | Works well. Records actuals, marks orders Completed, locks roster, moves unpaid to collection. |
| Cancel | `CancelSession.tsx` → `fn_cancel_schedule`; requires BO `Approved` row + every booking dispositioned | Ops (BO approves) | Works, best-designed exception in the app (see §3). |

**Verdict:** the operations chain is the **most complete and most disciplined**
end-to-end flow. Its gaps are inputs (roster CSV import, three missing session
fields) and one leak (hand-set `Running`/`Completed` bypassing close). Sessions
still have **no assignee** (design-test Q4) — the whole ops queue is ownerless.

---

## 2. Current vs Ideal per major workflow (Part 7)

Counts are for a representative single order/line unless noted. "Ideal" is
anchored to the brief's future-state: `fn_create_order` RPC, quote-line prefill,
endorsement completeness gate + accept/return handoff, coordinator ownership of
intake, session owner/assignee.

### 2.1 NEW INQUIRY

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Trigger | Lead arrives; rep remembers to log it | Lead arrives via form/import → inquiry auto-created, auto-assigned by round-robin/territory |
| Role | Sales (own) or super_admin (assigns) | Marketing/Order Coordinator owns intake→validate; sales gets qualified leads |
| Screens | 1 (`Inquiries.tsx` board) | 2 (board + **inquiry detail page** with next-action) |
| Clicks to advance | 1 per stage (`›`), no confirm/reason | 1, but with a status-vs-health split so aging is shown not clicked |
| Fields entered | 10 (company, contact, email, phone, course, offering, pax, value, prob, close) — retyped even for known clients | ~4; company/contact/email prefill from client lookup (`client_id` link) |
| Decisions | Advance / lost | Advance / lost / **convert-to-order** |
| Handoffs | None modeled | Coordinator → sales on qualification, tracked |
| Waiting | Invisible (no aging) | Computed inquiry health flag; SLA warn at 2d, overdue 3d → task |
| Manual work | Full re-key on convert | "Create order from lead" carries company/course/pax |
| Problems | No detail page, no owner-of-next-step, no health, Closed Won dead-ends | — |

Counts: convert-to-order today = **retype 10+ fields across ~4 cards**; ideal =
**1 button + confirm** carrying the lead's data. Classification: **NOT
IMPLEMENTED** (detail page, convert, health, aging).

### 2.2 SALES — quote → order

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Trigger | Rep decides to quote | Same, or one-click from qualified inquiry |
| Role | Sales | Sales |
| Screens | 3 (`Quotations` list → `QuoteDetail` → `SalesEntry`) | 3, but conversion carries state |
| Clicks | Create quote → open → add each line → set status → Create order → **retype every line** | Create → add lines → Send → Accept → **Convert (lines prefilled)** |
| Fields entered on convert | All order lines re-entered (course, modality, session, seats, fee) × N lines | 0 line fields — `quote_line` prefills SalesEntry; rep only picks sessions |
| Decisions | Status changes hand-set incl. Expired | Draft→Sent human; Accepted/Expired computed |
| Handoffs | Quote → order via URL param only | Quote → order transactional; quote auto-locks, `converted_order_id` set atomically |
| Automation | Auto price (good), discount hint (good), auto-expire nightly (good) | Same + prefill |
| Confirmation | Success screen | Success screen |
| Problems | `?quote` lines NOT read; conversion retypes; quote has no health | — |

Counts: N-line quote conversion today = **N × ~5 fields re-entered**; ideal =
**N session picks, 0 retyped fields**. Classification: **PARTIALLY IMPLEMENTED**
(link exists, prefill does not).

### 2.3 ORDER INTAKE

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Trigger | Rep opens New sales order; webshop = channel value only | Rep, coordinator, OR webshop ingest → draft order auto-created |
| Role | Sales only (**ops locked out**) | Marketing/Order Coordinator owns intake→validate→endorse |
| Screens | 1 (`SalesEntry`, 3 stacked cards) | 1 stepped (Customer → Header → Lines → Review) |
| Clicks / writes | **4 DB writes** in a saga (client, orders, lines, assignment) | **1 RPC** (`fn_create_order`) atomic |
| Fields entered | Order # (hand-keyed PK), date, channel, + per line: course, modality, session, seats, fee | Same minus placeholders; country/currency read-only (trigger-inherited), header seats/amount/modality computed in RPC |
| Decisions | New vs existing client; waitlist (auto) | Same; waitlist explicit checkbox |
| Handoffs | Self-assign (non-fatal upsert) | Self-assign atomic within RPC |
| Manual checks | Dup email hint (RLS-limited); format warn | Global cross-rep client search before insert |
| Problems | Non-transactional; placeholder header fields; PK is free text; ops excluded | — |

Counts: today = **4 writes, 3 fields that are computed-then-discarded, 1 PK
collision risk**; ideal = **1 RPC, 0 placeholder writes**. Classification:
**NOT IMPLEMENTED** (`fn_create_order`); dup hint + format check **IMPLEMENTED**.

### 2.4 PAYMENT

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Trigger | Ops/BO records a payment | Same; payment-exception auto-flagged |
| Role | Ops / BO / super_admin (sales blocked) | Finance/coordinator; sales blocked (keep) |
| Screens | 1 (`ReceivablePanel` inside `OrderDetail`) | 1, plus a Finance/Payments surface |
| Clicks | Record payment → amount/date/method/ref → save | Same |
| Fields entered | 4 per payment | 4 |
| Decisions | Over-balance soft-confirm | Over/under both route to disposition |
| Automation | AR trigger recomputes status | Same + collection clock on **invoice due date**, not order_date |
| Refund/void | **Hard DELETE**, reason dropped | Void/credit-note record; reason persisted; approval if over threshold |
| Problems | No refund/credit model; under/overpayment unmanaged; collection clock is coarse | — |

Classification: collection **IMPLEMENTED**; refund/credit **DEFERRED**;
payment-exception routing **NOT IMPLEMENTED**.

### 2.5 TRAINING OPERATIONS

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Trigger | Ops schedules session | Same, or demand-driven from inquiry/quote volume |
| Role | Ops (no assignee on the session) | Training Operations owner **stored on the schedule** |
| Screens | `SessionForm` → `SessionDetail` (tabbed, ~80% of record standard) | Same |
| Clicks to close | Mark attendance per attendee → Issue certs → Close | Bulk attendance from import → Issue all → Close |
| Fields entered | Every roster name typed; 3 health fields missing | CSV/paste import; online-link + materials + special-reqs fields added |
| Decisions | Go/No-Go (advise→decide, good); force-close | Same |
| Automation | `go_status`, `v_session_health`, waitlist auto-promote, close-out actuals | Same + prep-deadline tasks, trainer-unconfirmed reminder, auto Tentative→Confirmed |
| Handoffs | None (session ownerless) | Coordinator → ops on endorsement accept |
| Problems | No session owner; hand-set Running/Completed; no roster import; hard participant delete | — |

Counts: roster of P participants today = **P × manual name entry + P attendance
clicks**; ideal = **1 import + bulk mark**. Classification: health/go/close
**IMPLEMENTED**; roster import, session owner, missing fields **NOT
IMPLEMENTED**.

### 2.6 The handoff seam (cross-cutting, all workflows)

The brief's central future-state: **handoff = transaction, not a dropdown.**

| Dimension | CURRENT | IDEAL |
|---|---|---|
| Endorse to ops | `Worklist.tsx` `advance()` or `OrderDetail` stage `<select>` → bare `update({fulfillment_stage})` (DB-ordered by `fn_orders_stage_guard`) | Trigger → **completeness check** (SAP-ready? lines valid? paid?) → send |
| Receipt | None — ops sees it appear in their queue | Ops **Accept** or **Return-for-correction (reason)** |
| Ownership transfer | Implicit; sender's queue never clears | Explicit transfer + activity event + SLA timer starts; sender's queue clears **only on Accept** |
| Return path | None | Return-for-correction bounces it back with a reason + task |

Classification: legal-transition ordering **IMPLEMENTED** (`fn_orders_stage_guard`);
completeness gate, accept/return, queue-clear-on-accept **NOT IMPLEMENTED**.
This is the single highest-leverage gap — it recurs in inquiry→sales,
sales→ops, and ops→finance.

---

## 3. Exception workflows (Part 34)

Happy paths above assume nothing goes wrong. Real ops is mostly exceptions.
Each below: **trigger · owner · intended steps · current gap.** The two that are
already disciplined are marked; the rest are undesigned or half-built.

### 3.1 Session cancellation — ✅ HAS DISCIPLINE

- **Trigger:** low enrolment / client withdrawal / force majeure.
- **Owner:** Ops proposes (`GoNoGoPanel` Propose No-Go → `approval`), BO approves, Ops executes (`CancelSession`).
- **Intended steps:** propose → BO approval row → **every live booking gets a disposition** (Transfer/Refund/Credit/No Action) → `fn_cancel_schedule` runs only when `pending===0 && hasApproval` (`CancelSession.tsx` line 173).
- **Current gap:** the disposition *choices* Refund/Credit are recorded into `order_disposition` but **have no downstream effect** — no refund is issued, no credit note created (§3.3). The gate is excellent; the actions behind two of its four options are stubs.

### 3.2 Reschedule / date change

- **Trigger:** trainer/venue conflict, client request, low fill near start.
- **Owner:** Ops.
- **Intended steps:** pick new date → re-run conflict check (`fn_find_conflicts`) → move bookings → "moved from" note on both sessions → notify attendees.
- **Current gap:** **no reschedule action exists.** Ops must Transfer each line individually (`TransferOrder` / `fn_transfer_line`) or clone + cancel. No "moved from" provenance, no attendee notification, no atomic session-level move. `SessionForm` edit allows date change but does **not** re-validate against bookings already placed.

### 3.3 Refund / credit

- **Trigger:** cancellation disposition = Refund/Credit; overpayment; goodwill.
- **Owner:** Finance/BO (with approval over threshold, per brief §approval).
- **Intended steps:** create refund/credit-note record (immutable) → link to order + payment → adjust balance → approval if beyond policy → notify customer.
- **Current gap:** **undesigned.** "Refund" = `removePayment()` hard DELETE, reason dropped (`ReceivablePanel.tsx` line 72). No credit-note entity. `order_disposition.action='Refund'` is a label with no processor. DEFERRED (DB/architecture).

### 3.4 Under / overpayment

- **Trigger:** payment ≠ balance.
- **Owner:** Finance/ops.
- **Intended steps:** overpay → offer refund/credit disposition; underpay → keep `Partial`, raise a collection task, flag if aged.
- **Current gap:** overpay = soft-confirm then recorded as-is; underpay = silently `Partial`. **No exception task, no finance flag** (brief: payment-exception flagging DEFERRED). Detection exists (`balance`, `overdueDays`); routing does not.

### 3.5 Duplicate customer / order / participant

- **Trigger:** same email/company/order#.
- **Owner:** Sales (customer/order), Ops (participant).
- **Intended steps:** detect before insert → warn → merge with reconciliation.
- **Current gap / status:** **customer** — `usePossibleDuplicateClients` inline hint (IMPLEMENTED) but RLS hides cross-rep dups until `23505`. **Order** — `fn_merge_orders` real reconciliation via `Duplicates.tsx` (IMPLEMENTED). **Participant** — `fn_participant_dedup_guard` blocks same-email dup on a schedule at INSERT (IMPLEMENTED); transfers unaffected. Reasonably covered; the weak point is cross-rep client visibility.

### 3.6 Missing info / incomplete records

- **Trigger:** roster names < seats sold; no trainer/venue near start; no SAP number.
- **Owner:** Ops (roster/prep), Sales/coordinator (order data).
- **Intended steps:** surface the gap → task the owner → block or warn at the relevant gate.
- **Current gap:** partly handled. Roster gap shown ("N missing", `RosterPanel` line 142); `CloseSession` shows unmarked attendance and offers **force-close with warning** (good). Prep gaps feed `v_session_health` / `GoNoGoPanel` blockers. But there is **no task generated** to the owner and **no in-context "you are late" banner** — detection without assignment (design-test Q4).

### 3.7 Trainer replacement

- **Trigger:** assigned trainer unavailable.
- **Owner:** Ops.
- **Intended steps:** reassign trainer → conflict guard (`fn_conflict_guard`) → co-trainer via `session_trainer` if needed → notify.
- **Current gap:** reassignment is a field edit on `SessionForm` (guarded by the live conflict check — good). But there is **no trainer-unconfirmed reminder** and no notify-on-replacement. Health flags `noTrainer`; nothing tasks anyone to fix it.

### 3.8 Venue change

- **Trigger:** venue double-booked / unavailable.
- **Owner:** Ops.
- **Intended steps:** reassign venue → conflict guard → notify attendees if location changed.
- **Current gap:** same as trainer — field edit with conflict guard, no notification, no online-meeting-link field for the hybrid/online case (brief: field missing).

### 3.9 Ownership change (order / lead / session)

- **Trigger:** rep leaves, territory rebalance, escalation.
- **Owner:** Supervisor / ops / super_admin.
- **Intended steps:** reassign → confirm + reason → activity event → new SLA owner.
- **Current gap:** **orders only.** `Worklist.tsx` `reassign()`/`bulkAssign()` are danger-confirmed with an optional reason (IMPLEMENTED, good). **Inquiries and sessions have no assignee to change** — you cannot hand off a lead or a session because neither stores an owner beyond `inquiry.sales_id`. NOT IMPLEMENTED for inquiry/session.

### 3.10 No response / late response

- **Trigger:** customer silent after quote/endorsement; order stalls in a stage.
- **Owner:** Owning rep, then supervisor.
- **Intended steps:** No Feedback stage / Awaiting Feedback → SLA warn → overdue → escalate.
- **Current gap:** partly built. `No Feedback` stage exists; `isStalled` (>14d) and `v_sla_breach` surface it in Worklist + My Work; "Notify owners" button fires `fn_notify_sla_breaches`. But **no escalation ladder** (owner→supervisor→BO) and **no auto-task on breach** — the notify is manual and flat. Inquiry aging is entirely manual (no clock).

### 3.11 Approval rejection / return-for-correction

- **Trigger:** BO rejects a No-Go, review, or (future) refund/discount approval.
- **Owner:** BO decides; requester acts.
- **Intended steps:** reject → **require reason** → notify requester → optionally return-for-correction (fixable) vs hard reject.
- **Current gap:** cancellation approval gate is DB-enforced and excellent, but the approval framework has **no rejection-reason requirement, no return-for-correction state, no approver notification/deadline/escalation** (brief §6). A rejected proposal just sits. NOT IMPLEMENTED.

### 3.12 Return-for-correction (handoff bounce) — UNDESIGNED

- **Trigger:** ops receives an endorsed order that is incomplete (no SAP-ready data, wrong lines).
- **Owner:** Ops returns; sender fixes.
- **Intended steps:** Return with reason → order bounces to sender's queue → task + activity event → re-endorse.
- **Current gap:** **does not exist.** Stage transitions are ordered but one-way; there is no receipt and no bounce (§2.6). Ops' only recourse is to edit the order themselves or comment. This is the marquee undesigned exception.

### 3.13 Automation failure

- **Trigger:** nightly job fails (hygiene, reminders, SLA notify, auto-expire).
- **Owner:** Ops / super_admin.
- **Intended steps:** job self-reports failure → alert admin → retry/backfill.
- **Current gap:** **no visibility.** `fn_nightly_hygiene` now calls reminders + auto-expires quotes, but if it silently fails nothing surfaces — no job-run log on any screen, no admin alert. NOT IMPLEMENTED / NEEDS PRODUCT DECISION (observability).

### 3.14 Capacity / waitlist — ✅ HAS DISCIPLINE

- **Trigger:** booking exceeds `max_participants`.
- **Owner:** System, then Ops.
- **Intended steps:** `fn_capacity_guard` blocks over-cap non-waitlist lines; waitlisted lines saved as `Waitlist`; `fn_waitlist_autopromote` fills freed seats and notifies; ops can manually Promote/Waitlist on `SessionDetail` Orders tab.
- **Current gap:** minor — SalesEntry over-cap **non-waitlist** line still fails at submit with a raw `fn_capacity_guard` exception (brief §1.1) rather than a clean pre-submit message. The waitlist auto-promote loop itself is well-designed.

### 3.15 Participant transfer / substitute / soft-cancel — UNDESIGNED

- **Trigger:** attendee swap (Company sends Jane instead of John), single-seat cancel.
- **Owner:** Ops.
- **Intended steps:** substitute one participant → preserve seat/payment → soft-cancel with audit.
- **Current gap:** **no single-participant transfer or substitute.** `RosterPanel` remove is a **hard delete** of the participant + all their attendance/cert history (line 69–81). Line-level `fn_transfer_line` moves a whole booking, not one seat. NOT IMPLEMENTED.

---

## 4. Exception coverage summary

| Exception | Status | Owner clear? | Notes |
|---|---|---|---|
| Session cancellation | ✅ Disciplined | Yes | Best-built; Refund/Credit options are stubs |
| Capacity / waitlist | ✅ Disciplined | System→Ops | Raw error on over-cap non-waitlist submit |
| Duplicate (order) | ✅ Implemented | Ops | `fn_merge_orders` |
| Duplicate (participant) | ✅ Implemented | System | INSERT guard |
| Duplicate (customer) | ⚠️ Partial | Sales | Cross-rep hidden by RLS |
| Ownership change (order) | ✅ Implemented | Supervisor | Confirm + reason |
| No response / stall | ⚠️ Partial | Owner | Detected; no escalation ladder / auto-task |
| Missing info | ⚠️ Partial | Ops | Surfaced; not tasked |
| Trainer / venue change | ⚠️ Partial | Ops | Conflict-guarded edit; no notify/reminder |
| Under / overpayment | ⚠️ Partial | Finance | Detected; not routed |
| Reschedule / date change | ❌ Undesigned | Ops | Only per-line transfer; no provenance |
| Refund / credit | ❌ Undesigned | Finance | Hard delete; no credit note |
| Approval rejection | ❌ Undesigned | BO | No reason/return/escalation |
| Return-for-correction | ❌ Undesigned | Ops→sender | Handoff is one-way |
| Ownership change (inquiry/session) | ❌ Undesigned | — | No assignee to change |
| Participant substitute / soft-cancel | ❌ Undesigned | Ops | Hard delete only |
| Automation failure | ❌ Undesigned | Admin | No job observability |

**The pattern:** every exception the DB already models as a *gated transaction*
(cancel, merge, waitlist, capacity) is disciplined. Every exception still
expressed as a *field edit or a delete* (refund, reschedule, participant swap,
reject, handoff-return) is undesigned. Closing the gap is the same move each
time — promote it from a mutable field to a **gated action with an owner, a
reason, an activity event, and a receipt** — which is exactly the handoff-as-
transaction contract from §2.6 applied to exceptions.
