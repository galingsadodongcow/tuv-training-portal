# Automation & SLA

> Second-pass review — **Part 30** (automation), cross-referencing **Part 29** (SLA/escalation). Grounded in `supabase/migrations/20260812000000_phase1_workflow_integrity.sql` (`fn_nightly_hygiene`, `fn_orders_stage_guard`, `fn_participant_dedup_guard`, `v_session_health`, `fn_merge_orders`), `20260808030000_escalation_rules.sql` (`fn_generate_worklist_tasks`), `20260808190000_communications.sql` (`fn_queue_reminders`, `fn_queue_email`, `comms_log`), `20260808240000_waitlist_sla.sql` (`fn_waitlist_autopromote`, `sla_policy`, `v_sla_breach`, `fn_notify_sla_breaches`), `20260808050000_sap_reference_only.sql` (`fn_stage_stamp`), `20260805000000_security_hardening.sql` (`fn_detect_duplicates`, `fn_country_inherit`, `v_digest_*`), and `supabase/schedule.sql` (the two cron jobs). Baseline: `docs/qa/ux-review/05` §3, `03` §7.

The governing principle from the brief: **automate detection and paperwork, never judgment.** Cancel, no-go, refund, merge, approval outcome, and reassign-away-from-a-rep stay human. Everything below either computes a signal, generates a to-do, or moves paperwork after a human decides.

---

## 1. Current automation inventory — wired vs dead

The nightly path is real and now does more than the first pass found. But one link (sending) is still broken, and all of Phase 4 remains un-built.

### What runs on a schedule

`supabase/schedule.sql` crons exactly **two** edge functions via `pg_cron` + `pg_net`:

| Cron | Schedule | Calls |
|---|---|---|
| `nightly-hygiene` | `0 17 * * *` (daily) | `fn_nightly_hygiene()` |
| `weekly-digest` | `0 23 * * 0` (Sun) | `fn_weekly_digest()` (reads `v_digest_*`) |

**`send-comms` is NOT cronned.** This is the load-bearing gap: reminders queue but never send.

### `fn_nightly_hygiene` — what it actually does (per `20260812000000`)

| Step | Action | Status |
|---|---|---|
| 1 | Close sessions past end date (`Tentative`/`Confirmed` → `Completed`) | WIRED |
| 2 | Move started sessions `Confirmed` → `Running` | WIRED |
| 3 | Flag stale orders → `No Feedback` (New/In-Comm > 30d, not cancelled) | WIRED |
| 4 | Auto-expire lapsed quotes (`Sent`, past `valid_until`, unconverted → `Expired`) | WIRED (new since first pass) |
| 5 | `perform fn_queue_reminders()` (guarded so a failure can't abort hygiene) | WIRED (new since first pass) |
| 6 | `return query … fn_generate_worklist_tasks()` | WIRED |

### `fn_generate_worklist_tasks` — the task/notification generator

Idempotent (`dedup_key`), auto-closing when the condition clears. Generates: **stalled-order** task (per owner, stage > 14d), **overdue-collections** summary (one per owner, unpaid > 30d, count refreshed in place), **aging-approval** notice (BO/super_admin, pending > 3d), **import-exception** notice (super_admin). Auto-resolves stalled/collection tasks whose condition cleared. `EXECUTE` revoked from `authenticated`; `service_role` only. WIRED.

### Reminders — queue-only, **not sending**

`fn_queue_reminders` writes into `comms_log`: **session reminders** (participants of sessions `start_date = today+3`, deduped 7d) and **payment reminders** (`v_order_ar.balance > 0` past `due_date`, deduped 7d). `fn_nightly_hygiene` now calls it — so rows *queue*. But nothing drains the queue: `send-comms` is not scheduled. **Reminders are queued and never delivered.** Fix is one line in `schedule.sql`:

```sql
select cron.schedule('send-comms', '30 17 * * *', $$   -- 30 min after hygiene
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/send-comms', …);
$$);
```

Do this first — it turns two already-built automations (participant + payment reminders) live for the cost of a cron entry.

### Other server-side automation already live

| Mechanism | What it does | Status |
|---|---|---|
| `fn_orders_stage_guard` (`trg_orders_stage_guard`) | Enforces legal `fulfillment_stage` transitions in the DB; system/super_admin bypass | WIRED |
| `fn_participant_dedup_guard` | BEFORE INSERT blocks same-email dup on a schedule (INSERT-only; transfers unaffected) | WIRED |
| `fn_waitlist_autopromote` (`trg_waitlist_autopromote`) | On a seat-freeing line change, promotes oldest fitting `Waitlist` lines → `New`, notifies owner | WIRED |
| `v_session_health` | Computed Healthy/Needs Attention/At Risk/Blocked, proximity-weighted; surfaced on SessionDetail, Calendar, My Work | WIRED (session-health calc — **done**, note only) |
| `go_status` rollup | `booked ≥ min → Go` recomputed by the schedule fill trigger (`fn_rollup_schedule`) | WIRED |
| `fn_country_inherit` | Order `country` inherited from course | WIRED |
| `fn_stage_stamp` | Stamps `stage_changed_at` on stage change (powers stall detection); no longer auto-advances on SAP number | WIRED |
| `fn_detect_duplicates` | Populates `duplicate_candidate` (shared email or company+session); reconciled by `fn_merge_orders` (human-invoked) | WIRED (detection auto; merge stays human) |
| `fn_notify_sla_breaches` | Notifies order owner of `v_sla_breach` rows, deduped 3d | DEFINED but **not called by any cron** — dead unless invoked |

**Precision note:** `fn_notify_sla_breaches` exists and is grantable but is not in `fn_nightly_hygiene` and not cronned — SLA breaches surface in My Work (`useSlaBreaches` reads `v_sla_breach` live) but no *notification* fires. Add `perform fn_notify_sla_breaches();` to `fn_nightly_hygiene` alongside the reminder call.

---

## 2. Remaining high-value automation

For each: **Trigger · Rule · System action · Human action · Exception · Override · Audit event · Notification · Benefit · Risk**, then a status tag. Per the brief, everything Phase-4 was DEFERRED because the MCP live-schema validator was down — so validated idempotent migrations + a live dry-run are the gate before any of these ship (see §3).

### A. Inquiry assignment — NOT IMPLEMENTED (Phase 4 deferred)
- **Trigger:** inquiry inserted (or endorsed lead lands) with no owner.
- **Rule:** round-robin within region, skip reps over an open-inquiry cap, respect `is_supervisor` load.
- **System action:** set `inquiry.assigned_to`, stamp `assigned_at`, open a "respond to inquiry" task with the response SLA due date.
- **Human action:** rep responds; a supervisor may reassign.
- **Exception:** no eligible rep in region → route to supervisor queue, unassigned.
- **Override:** manual reassign in the inquiry list (human, always wins).
- **Audit:** `inquiry_assigned` (round-robin vs manual, source-flagged).
- **Notification:** assignee task + bell.
- **Benefit:** faster first response, no leads sitting unowned.
- **Risk:** skewed load if caps mis-set → cap per-rep open count. **Prereq:** inquiries have no `assigned_to` today (brief: sessions/inquiries have no owner) — needs the ownership-contract column first.

### B. Order validation at endorsement — NOT IMPLEMENTED (Phase 4 deferred)
- **Trigger:** order moves to `Endorsed to Ops`.
- **Rule:** completeness score (validated customer, reference format `^[A-Za-z0-9-]{3,30}$`, billing contact, ≥1 priced line, session on scheduled lines) + dup check + fee sanity.
- **System action:** **block** on hard fails, warn on soft; write the failing checklist to the record.
- **Human action:** Coordinator fixes and re-endorses.
- **Exception:** legitimate incomplete (e.g. webshop backfill) → super_admin override with reason.
- **Override:** super_admin bypass, persisted.
- **Audit:** `endorsement_blocked` / `endorsement_override`.
- **Notification:** sender task on block.
- **Benefit:** ops stop receiving broken orders (the handoff-as-transaction gate the brief wants).
- **Risk:** over-strict gate stalls legitimate orders → keep the hard/soft split narrow.

### C. Ownership transfer on endorsement — NOT IMPLEMENTED (Phase 4 deferred)
- **Trigger:** endorsement accepted by ops.
- **Rule:** set a **fulfillment owner** (ops) while **keeping the sales owner** for AR — model both roles explicitly.
- **System action:** write `fulfillment_owner`, transfer the fulfillment SLA clock, clear the sender's endorsement queue **only on Accept**.
- **Human action:** ops Accept or Return-for-correction (reason).
- **Exception:** returned → ownership stays with sender + a correction task.
- **Override:** super_admin manual owner set.
- **Audit:** `ownership_transferred` with from/to + accept/return.
- **Notification:** both owners.
- **Benefit:** the handoff becomes a transaction, not a dropdown edit.
- **Risk:** dual-owner confusion → label clearly (Sales owner vs Ops owner) on the record.

### D. Task creation — PARTIALLY IMPLEMENTED
- **Live today:** stalled-order and overdue-collections tasks (`fn_generate_worklist_tasks`), idempotent + auto-closing.
- **Extend (NOT IMPLEMENTED):** **prep-deadline** (T-14/T-7/T-3 readiness → session owner), **roster-gap** (`names_captured < seats_sold` near start → session owner), **cert-overdue** (session Completed + certs unissued past N days → ops), **duplicate-candidate** (open row → ops), **approval-pending** (already a notice; add a task).
- **Rule/System/Human/Exception/Override/Audit/Notification:** follow the existing generator contract — dedup_key idempotency, auto-close on clear, `assigned_to` = record owner, task appears in My Work.
- **Benefit:** every known exception becomes a tracked to-do with an owner.
- **Risk:** task spam → keep dedup + auto-close, cap priority escalation.

### E. Payment-exception detection — NOT IMPLEMENTED (Phase 4 deferred)
- Specified fully in `11-payments-exceptions.md` §3.2 (overpayment, underpayment, missing/bad reference, payment-on-cancelled-order, pending-too-long). Detection only; disposition (refund/credit/write-off) is human.

### F. Session-health computation — **IMPLEMENTED (note only)**
- `v_session_health` computes Healthy/Needs Attention/At Risk/Blocked, proximity-weighted, surfaced on SessionDetail/Calendar/My Work. **Done.** Remaining: health *inputs* are incomplete (no online-link, `materials_ready`, `special_requirements` fields yet) — health cannot see readiness gaps it has no column for. Health never auto-cancels (correct — that's judgment).

### G. Participant & payment reminders — IMPLEMENTED (queued) / NOT DELIVERED
- `fn_queue_reminders` is wired into nightly hygiene and queues both reminder types into `comms_log`. **But `send-comms` is not scheduled** (§1) — so nothing is delivered. One cron line makes this fully live. Until then, treat reminders as *queued, not sent*.

### H. Overdue-follow-up escalation ladder — PARTIALLY IMPLEMENTED
- **Live:** `fn_notify_sla_breaches` notifies the owner (deduped 3d) — but it is **not cronned**, so even the first rung doesn't fire automatically.
- **Extend (NOT IMPLEMENTED):** owner → (breach + N days) supervisor → (+M days) BO ladder; each rung a task + notification; an `escalation_state` on the record so the record shows how far it has climbed.
- **Exception/Override:** owner resolves at any rung → auto-close; super_admin can halt.
- **Audit:** `escalated` with from/to rung.
- **Benefit:** breaches can't rot silently on one owner.
- **Risk:** escalating to BO too fast → tune day thresholds per stage in `sla_policy`.

### I. Approval escalation — NOT IMPLEMENTED (Phase 4 deferred)
- **Trigger:** approval `Pending` past N days (a notice already fires; no escalation).
- **Rule:** notify decider → escalate to super_admin + overdue task; require a note on Rejected; add a Return-for-correction state.
- **System/Human/Audit/Notification:** per `03` §6/§7. Judgment (the approve/reject outcome) stays human.
- **Benefit:** approvals don't stall the pipeline.
- **Risk:** low — this is paperwork routing around a human decision.

### J. Auto timestamps — PARTIALLY IMPLEMENTED
- **Live:** `fn_stage_stamp` stamps `stage_changed_at`.
- **Extend (NOT IMPLEMENTED):** `first_contacted_at`, `endorsed_at`, `accepted_at`, `confirmed_at` as trigger-stamped columns — feed SLA clocks and the ownership contract (Assigned date / Due date the brief wants stored, not derived).
- **Benefit:** every SLA clock reads a real stamp, not a heuristic. **Risk:** none material (append-only stamps).

### K. Auto status transitions — PARTIALLY IMPLEMENTED
- **Live:** session `Confirmed → Running → Completed` (time-based, `fn_nightly_hygiene`), order `No Feedback` timeout, quote `Expired`.
- **Extend (NOT IMPLEMENTED):** **Tentative → Confirmed** when fill ≥ min **and** staffed (never auto-cancel the inverse — that's judgment); **order → Closed** when paid + session completed + certs issued.
- **Exception/Override:** a human can always set status manually; the guard (`fn_orders_stage_guard`) permits super_admin.
- **Benefit:** removes rote status-clicking. **Risk:** an auto-Confirm on a session that later loses its trainer → keep health (`v_session_health`) as the safety signal; status auto-advance must re-check staffing each run.

> **Judgment stays human — never automate:** session Cancelled, No-Go decision, refund/void, duplicate *merge*, approval outcome, reassignment *away from* a rep. The automations above only detect the condition and prepare the paperwork; a person still decides.

---

## 3. How Phase 4 automation should be validated & shipped

All Phase-4 items (A, B, C, E, I, plus the extensions to D/H/J/K) were deferred **because the MCP live-schema validator was unavailable** — not because they're unsound. They touch triggers and status columns where a wrong enum cast or a missing column silently breaks the nightly job (the repo has already been bitten by `text → enum` cast bugs — see CLAUDE.md "Enum gotcha"). The shipping gate is therefore:

1. **Write idempotent migrations** — `create or replace`, `… if not exists`, `drop policy/trigger if exists` then create. One migration per automation, named `YYYYMMDDHHMMSS_*`.
2. **Validate on a throwaway Postgres** in a rolled-back transaction (as `20260812000000`'s header attests it did) — catches enum/cast/`42804`/`42703` before they reach the DB.
3. **Live dry-run against the production schema** via the MCP validator: confirm every referenced column/enum exists on the *live* DB (the repo↔live drift in CLAUDE.md means "it's in the migration" is not proof it's live), and run each generator/trigger against real rows with the write rolled back.
4. **Apply via `.github/workflows/apply-supabase.yml`** (the `SUPABASE_DB_URL` secret) — never hand-paste bundles; the manual path is what caused the drift and hid the earlier RLS holes.
5. **Re-simulate RLS** as `anon` and two different sales reps, and **re-run the Supabase advisor**, before calling any item done — the new tables (`refund`, `credit_note`) and any new `assigned_to`/owner columns need matching policies, and a policy on an RLS-off table is inert.
6. **Cron last:** only after the function is validated live, add its `pg_cron` entry (and finally schedule `send-comms`) so a broken function never fires unattended.

---

## Classification summary

| Automation | Status |
|---|---|
| Nightly hygiene: session close/run, stale-order flag, quote expire | IMPLEMENTED |
| `fn_generate_worklist_tasks` (stalled, collections) + auto-close | IMPLEMENTED |
| Stage guard, participant dedup, waitlist auto-promote, go_status, country inherit, stage stamp, dup detection | IMPLEMENTED |
| Session-health computation (`v_session_health`) | IMPLEMENTED (inputs still incomplete) |
| Participant + payment reminders | IMPLEMENTED (queued) but **not delivered** — `send-comms` uncronned |
| `fn_notify_sla_breaches` | DEFINED but not cronned (dead) |
| Task extensions (prep-deadline, roster-gap, cert-overdue) | NOT IMPLEMENTED |
| Auto timestamps beyond `stage_changed_at`; auto status (Tentative→Confirmed, order→Closed) | PARTIALLY IMPLEMENTED |
| Escalation ladder (owner→supervisor→BO), approval escalation | NOT IMPLEMENTED |
| Inquiry assignment, order-validation gate, ownership-transfer-on-endorsement, payment-exception detection | NOT IMPLEMENTED (Phase 4 deferred — validator down) |
