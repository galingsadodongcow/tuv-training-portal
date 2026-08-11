# Forms, Status, Session Health, Notifications, Tasks, Approvals, SLA, Calendar & Workflow State Machines

> Part 3 of 5 — grounded in `SalesEntry.tsx`, `SessionForm.tsx`, `CourseForm.tsx`, `Inquiries.tsx`, `QuoteDetail.tsx`, `RosterPanel.tsx`, `GoNoGoPanel.tsx`, `CloseSession.tsx`, `CancelSession.tsx`, and the migrations behind `fn_enforce_pax`, `fn_cancel_schedule`, `fn_close_session`, `fn_rollup_schedule`, `fn_waitlist_autopromote`, `v_sla_breach`, `fn_generate_worklist_tasks`, `fn_queue_reminders`, `fn_detect_duplicates`.

**What the DB already computes** (several recommendations are "surface what the schema already derives," not "build new"): `schedule.go_status` is auto-derived (`fn_rollup_schedule`: `booked >= min → 'Go'`); `orders.country` is inherited from the course (`fn_country_inherit`); `payment_status`/`sap_order_no` are finance-controlled with sales blocked by `fn_guard_orders_sales_fields` (`42501`); waitlisting, capacity ceiling, double-booking, SLA breach, stalled-order tasks, session/payment reminders, and duplicate detection all already exist server-side. Much of the gap is the front end not reading these back.

## 1. Form review

### 1.1 SalesEntry
One screen builds **four non-transactional writes** (client → orders → order_line[] → order_assignment). A compensating `delete` on orders runs if the line insert fails, but **no compensation** if assignment or the quote-accept update fails (swallowed as warnings). This is a saga pretending to be a transaction — **should be a single `fn_create_order(...)` RPC** (atomic client+order+lines+assignment, returning the summary the success screen renders).

**Derived-not-asked fixes:** header `seats=1` (placeholder; real value = Σ line seats, computed then discarded), `amount_php=0` (real = `total`, discarded), `modality = first line's modality` (meaningless on mixed-modality orders) — all should be computed in the RPC/dropped. Country/currency never captured; `orders.country` is trigger-inherited — show it read-only, never ask. Catalog price auto-fills (good) — make "(catalog ₱X)" a one-click reset.

**Re-typed data:** new-client name/company/email/phone frequently already exist on a client owned by another rep (the `23505` path proves it). The **order number** (`60806000000xxx`) is hand-keyed — the most error-prone field, no format validation, no dup check before insert (PK collision surfaces as a raw error).

**Validation gaps:** order-number free text; waitlist is silent-by-default (a full session quietly downgrades the line — make it an explicit "Save to waitlist" checkbox); over-cap non-waitlist lines fail at submit with a raw `fn_capacity_guard` exception.

**Structure:** step the flow (Customer → Header → Lines → Review); **autofill lines from `quote_line` on `?quote=`**; add an unsaved-change guard (none exists).

### 1.2 SessionForm — TWO CRITICAL BUGS
**(a) It defeats the shipped per-session-pax migration.** `20260809030000_pax_option_b_per_session` made `fn_enforce_pax` stop overwriting min/max so ops can set per-session caps. But SessionForm makes the min/max inputs `readOnly disabled` and submits `min_participants: MIN_PAX`(=8) and `max_participants: maxPax`(course-derived) — never the form values. The DB *allows* per-session caps; the only UI that writes sessions *forbids* them. **Fix:** make min/max editable, default from the course, pass the form values.

**(b) It lets a user hand-set `Completed`,** bypassing `fn_close_session` (which locks the roster and records actuals). Restrict the picker to `Tentative`/`Confirmed`; drive `Running`/`Completed`/`Cancelled` from actions/dates.

**Keep:** the live double-booking check (`checkConflicts`, submit disabled while conflicts exist) is excellent — the model for other conflict surfaces. **Gaps:** no online-meeting-link field (health model needs it), no materials/prep fields, no unsaved guard.

### 1.3 CourseForm
Well-built (pass_mark gated on has_assessment; category datalist; upsert-then-delete fee; strip-and-retry). Issues: `cert_validity_months` not gated by `is_certification`; helper text still describes Option-A pax; no duplicate-title detection (two "IRCA Lead Auditor" courses can coexist and the name-substring cap logic silently changes).

### 1.4 Inquiries create
**Enum drift risk:** UI includes `Closed Lost` + `lost_reason` but the migration `inquiry_status_t` lists only through `Closed Won` — **verify on live**. Re-typed company/contact/email/phone even for existing clients (offer a lookup autofill); no dedup; stage moves have no confirm/reason except `markLost`; `Closed Won` dead-ends (won lead never linked to the order it became); no unsaved guard.

### 1.5 QuoteDetail add-line
Autofills unit_price (good); `DiscountHint` suggests-not-forces (excellent restraint). Default-modality inconsistency (`Face-to-face` vs SalesEntry's `Live Online Training` — pick one house default). **`Expired` is user-selected but should be system-computed** (nightly auto-expire past `valid_until`, show a derived "Expired" badge). No audit of who changed the discount.

### 1.6 RosterPanel add-participant
Keeps `line_id` selected for bulk entry (smart); company/order/payment derived (good). **Biggest gap: no import** — injection-safe CSV *export* but no CSV/paste *import*; ops re-key every attendee by hand. The "X of Y names captured" indicator seeds the participant-info health factor.

### Minimize manual data entry

| Re-typed today | Already lives in | Fix |
|---|---|---|
| New client name/company/email/phone | `client` (often another rep's) | Global client search + cross-rep "email exists" hint *before* insert |
| Order lines on quote conversion | `quote_line` | Pre-fill SalesEntry lines on `?quote=` |
| Won inquiry → order | `inquiry` | "Create order from lead" carrying company/course/pax |
| Session fee | `course_fee` | Already auto (`feeFor`) — reuse in quote+roster |
| Country/currency | `course.country` (trigger) | Show read-only, never ask |
| Header seats/amount/modality | Σ lines | Compute in RPC; drop placeholders |
| Roster names | Client's delegate list | CSV/paste import |
| Go/No-Go status | `booked` vs `min` | Already `go_status` — read, don't recompute in 3 places |

## 2. Status framework — process status vs health/exception state

**Core problem:** process status and health are conflated/scattered. A `Confirmed` session can simultaneously be below-minimum, trainer-less, and unpaid — three health facts living in GoNoGo strings, `v_cancel_readiness`, `v_sla_breach`, and `go_status`, none a first-class field. **Fix everywhere: one process-status column (user/action-driven) + one computed health/exception signal (never hand-set).**

**Order** — `fulfillment_stage` (New→In Communication→For Order Creation→Endorsed to Ops→SAP Created→No Feedback→Cancelled; user-driven with per-stage SLA clocks) + `payment_status` (Unpaid/Partial/Paid; **AR-trigger only, sales blocked 42501**) + `collection_status` (Pending/Collected; ops, set by close). Missing: an order-level *health* flag (Blocked when SLA-breached/duplicate-flagged) — today only in `v_sla_breach`/`duplicate_candidate`.

**Session** — `schedule.status` (Tentative↔Confirmed user; **Running/Completed action/date-driven only — see the SessionForm bug**; Cancelled via `fn_cancel_schedule`) + `go_status` (Go/No-Go, **system**, `fn_rollup_schedule`) + health (should be computed, §3).

**Inquiry** — `Received→Responded→RFQ/P Sent→Awaiting Feedback→Closed Won/Lost` (user; verify `Closed Lost` on live; aging should be a computed flag, not a manual status).

**Quote** — `Draft→Sent→Accepted(auto on conversion)/Declined/Expired` (**Expired should auto-fire nightly**).

**Participant** — `Registered→Attended/No Show`, `Transferred` (system, on cancel); `result` Pending→Pass/Fail; cert fields (**system**, `fn_issue_certificate`, never hand-set).

**Approval** — Pending→Approved/Rejected (BO).

**Compute (never hand-set):** `go_status`, `payment_status`, `collection_status`, cert fields, `Transferred`, quote `Expired`, session `Running`/`Completed`, all health/SLA flags. **User-select:** `fulfillment_stage`, session Tentative↔Confirmed, inquiry pipeline, quote Draft→Sent/Declined, attendance Attended/No Show, result.

## 3. Session-health framework (computed)

GoNoGo already assembles the signals as prose (`health[]`, `blockers[]`) and `go_status` exists — but there's no single computed health level, so calendar/My Work/header each re-derive or omit it. Define `session_health ∈ {Healthy, Needs Attention, At Risk, Blocked}`:

**Factors (all already in the data except two new fields):** trainer unconfirmed (`trainer_id null`), venue/online-link unconfirmed (`venue_id null`; **online link field missing**), below min (`go_status='No-Go'`), at max (`booked>=max`), materials incomplete (**add `materials_ready`**), participant info missing (`names<seatsSold`), payment issues (unpaid booked lines), date approaching (`daysUntilStart`), cert config incomplete.

**Rules (first match wins):**
```
if status in (Completed,Cancelled):                                        terminal
if (noTrainer OR noVenue) AND daysUntilStart <= 14:                        → Blocked
if go_status='No-Go' AND daysToDecision <= 0:                              → Blocked
if go_status='No-Go' AND daysToDecision <= 7:                             → At Risk
if noTrainer OR noVenue OR (unpaidPax>0 AND daysUntilStart<=7)
   OR (names<seatsSold AND daysUntilStart<=3):                            → At Risk
if go_status='No-Go' OR atCapacity OR materials_incomplete
   OR names<seatsSold OR unpaidPax>0 OR cert_config_incomplete:          → Needs Attention
else:                                                                     → Healthy
```
A direct generalization of GoNoGo's `recTone` ladder, promoted to a derived field. **Surfaces:** calendar chip (color+dot+fill fraction), My Work "Sessions needing attention," session header badge (with the GoNoGo `health[]` sentences on hover).

## 4. Notification framework

Three disconnected mechanisms today (`notification` rows kinds `system`/`sla`; `task` rows; `comms_log` emails), no notification center, no typing beyond `kind`. Classes and routing:

| Class | Definition | Route |
|---|---|---|
| Informational | FYI (waitlist promoted) | Center only |
| Task | Someone must do work (stalled order) | `task` → My Work |
| Approval | A decision required | Approval queue + notify approver |
| Warning | Threshold nearing | Center + session health |
| Exception | Rule broken (duplicate, capacity) | Exception list + task |
| Mention | User referenced (not modeled) | Direct notification |
| System alert | Automated fire (SLA breach) | Center + owner |

**Center:** grouped by day, icon-by-class, direct record link (`entity_type`+`entity_id` already stored), relative time, actor; unread via `read_at`; filters (class/entity/unread/mine); de-dup (already partially done — SLA 3d, reminders 7d); keep history.

**Decision rules:** person must ACT → task; DECISION needed → approval; RULE broken → exception (+task if owner fixes); threshold NEARING → warning; BREACH → system alert + escalate; pure FYI → informational; 2nd identical <window → silent.

**Reminders (map to jobs):** inquiry not contacted (add), payment unresolved (**exists**), prep incomplete (from §3), trainer unconfirmed (new), participant details missing (new), approval overdue (new), cert overdue (new), session reminder to attendees (**exists**).

## 5. Task framework

`fn_generate_worklist_tasks` + `task` table exist. Record: title, detail, entity_type+entity_id (record link), assigned_to, status (open/in_progress/blocked/closed), priority, source, reason, `dedup_key` (idempotency) — **add** due_date, related customer/order/training, escalation_to. Records that should generate tasks: stalled order (exists), overdue-collections summary (exists, one-per-owner), approval pending too long (add), session at-risk near start (add), roster incomplete (add), duplicate candidate (add), cert overdue (add). The generator **auto-closes** system tasks when the condition clears — keep that. Feeds My Work: `assigned_to=me AND status in (open,in_progress,blocked)` by priority then due.

## 6. Approval framework

Today only session cancellation (hard-gated — `fn_cancel_schedule` refuses without an `Approved` row) and session-review/forecast route to approval, decided by BO. The cancellation gate is well-designed (DB-enforced). **Gaps:** no approver notification, deadline, escalation, delegation, rejection-reason requirement, or return-for-correction.

**Add approval for:** refund disposition, discount beyond threshold (`discount_pct>15`), price override below catalog, credit note — only *crossing a threshold* triggers approval (within-policy discounts write straight through). **Framework:** notify BO on insert; `Pending>N days` → escalate to super_admin + overdue task; delegation to an alternate approver; require a note on Rejected; add a "return for correction" state.

## 7. SLA & escalation framework

An SLA engine already exists (`sla_policy`, `v_sla_breach`, `fn_notify_sla_breaches`, dedup 3d). Extend to non-order stages:

| Process | Expected | Owner | Warn | Overdue | Escalate to |
|---|---|---|---|---|---|
| New-inquiry follow-up | 3d from Received | Lead's sales | 2d | 3d | Supervisor |
| Order New→advance | 3d | Owner | 2d | 3d | Supervisor |
| In Communication | 5d | Owner | 4d | 5d | Supervisor |
| For Order Creation | 3d | Owner | 2d | 3d | Ops lead |
| Endorsed to Ops | 5d | Ops | 4d | 5d | Ops manager |
| No Feedback | 7d then close/reopen | Owner | 5d | 7d | Supervisor |
| Payment review | 30d from order | Finance/owner | 15d | 30d | Finance lead |
| Session prep | trainer+venue by 14d before start | Ops | 21d out | 14d out | Ops manager |
| Approval | 3d | BO | 2d | 3d | Super admin |
| Certificate | 7d from close | Ops | 5d | 7d | Ops manager |

**Dashboard:** a single "Breaches & aging" panel fed by `v_sla_breach` + the new clocks. **Behavior:** warn=informational; overdue=system alert + task + escalation, de-duped on the 3-day window.

## 8. Calendar & scheduling review

**Views:** day/week/month/list (list essential for ops triage — sort by health/start/fill). **Conflicts:** the hard part is built (`fn_find_conflicts` does live trainer+venue double-booking; `fn_conflict_guard` enforces on write) — surface the same data *on the calendar* (conflict marker without opening the form). **Capacity:** render `booked/min` (Go threshold) + `booked/max` (capacity) + waitlist count. **Lifecycle:** Tentative (dashed), Confirmed (solid), Cancelled (struck-through), rescheduled ("moved from" note); online/classroom/hybrid by icon.

**Visual indicators:** Healthy (green solid), At risk (orange+⚠), Blocked (red+⛔), Full (blue+"FULL"+waitlist), Low registration (amber outline+"N below min"), Trainer conflict (red badge), Cancelled (grey struck), Tentative (dashed). Click chip → session detail; empty day → "New session" pre-dated; "Book" deep-links SalesEntry `?schedule=`.

## 9. Workflow state machines

**Order:** New →(sales)→ In Communication → For Order Creation → Endorsed to Ops →(ops)→ SAP Created; No Feedback (reopen→New); Cancelled from any. `payment_status` AR-only (sales blocked); `collection_status` set by close if unpaid.

**Session:** Tentative →(GoNoGo Confirm Go)→ Confirmed →(start date)→ Running →(`fn_close_session`)→ Completed; Cancelled via `fn_cancel_schedule` (requires Approved + every booking dispositioned). `go_status` auto. **Fix:** Completed must go through close (not hand-set); Running/Completed date/action-driven.

**Inquiry:** Received→Responded→RFQ/P Sent→Awaiting Feedback→Closed Won; markLost→Closed Lost(+reason); reopen→Received. Closed Won should offer order creation and link it.

**Quote:** Draft→Sent→Accepted(auto on conversion)/Declined/Expired(should auto-fire nightly). Locked when `converted_order_id`.

**Participant:** Registered→Attended→(assess)→cert issued; No Show; Transferred (auto on cancel). Roster locked at close.

**Design for exceptions:** cancellation (approval + dispositions gated), reschedule (conflict re-check + "moved from" note), refund/transfer/credit (per-booking `order_disposition`; Transfer via `fn_transfer_line`), incorrect payment (sales blocked; finance adjusts), incomplete records (roster gap surfaced; forced close with warning), duplicates (`fn_detect_duplicates`), trainer replacement (reassign + conflict guard; co-trainers via `session_trainer`), returned approval (add "return for correction"), no response (No Feedback + Awaiting Feedback SLA), capacity (`fn_capacity_guard` blocks; Waitlist; `fn_waitlist_autopromote` fills + notifies).

**Training preparation checklist (derives readiness):** trainer assigned (`trainer_id`+qualified via `tcMap`), venue confirmed, online link (**add field**), materials ready (**add field**), participants confirmed (`names>=seatsSold`), payment satisfied, roster complete, attendance sheet (CSV), certificates configured (pass_mark/validity), special requirements (**add field**). Readiness = all applicable items green — the same facts GoNoGo renders as `health[]` and RosterPanel renders as "N missing," consolidated into one computed `session_health` + checklist.

### Action-first, code-grounded findings
1. **SessionForm forces course-derived pax and disables the inputs** — silently defeats the shipped per-session-cap migration. Make min/max editable.
2. **SessionForm lets a user hand-set `Completed`** — bypasses `fn_close_session`. Restrict to Tentative/Confirmed.
3. **SalesEntry writes placeholder header fields** (`seats=1`, `amount_php=0`, first-line modality) and is non-transactional — move to `fn_create_order` RPC.
4. **Quote `Expired` and inquiry aging are manual** where they should be computed nightly.
5. **`Closed Lost`/`lost_reason` may be repo↔DB drift** — verify on live.
6. **RosterPanel has export but no import** — the biggest manual-typing cost.
7. Most of §3/§4/§7 is *surfacing signals that already exist* in one health field, one notification center, one SLA dashboard — not net-new logic.
