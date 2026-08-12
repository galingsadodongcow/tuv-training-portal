# Second pass — Training Operations (Parts 17, 18)

Scope: the operations half of the portal — the shipped session-health model and
how it is consumed, and the design of a real Operations command center. Grounded
in the current code: `src/lib/health.ts`, `v_session_health`
(`supabase/migrations/20260812000000_phase1_workflow_integrity.sql`), the
`v_digest_*` views (`supabase/schema.sql`), `SessionDetail.tsx`, `Calendar.tsx`,
`MyWork.tsx`, `Resources.tsx`. Baseline: `docs/qa/ux-review/03` §3/§8/§9 and
`docs/qa/ux-review/04` §4.

Classifications: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED /
DEFERRED / NO LONGER RELEVANT / NEEDS PRODUCT DECISION / NEEDS TECHNICAL VALIDATION.

---

## Part 17 — Training session health (the shipped model)

### 17.1 What actually shipped

`v_session_health` is a `security_invoker` view that emits one health level per
open session. `src/lib/health.ts` maps the four live levels (plus terminal
Completed/Cancelled) to a pill class and a sort weight, and exposes
`healthNeedsAction()`. It is consumed in three places, all reading the same view
via `useSessionHealth`:

- **`SessionDetail.tsx`** header badge — shown only while live (hidden once
  Completed/Cancelled to avoid duplicating status).
- **`Calendar.tsx`** — `HealthChip` on month-grid events and list rows; renders
  only for actionable levels so the calendar "stays quiet unless something needs
  eyes."
- **`MyWork.tsx`** §4 — "Sessions needing attention," joining the health map to
  open schedules, filtered by `healthNeedsAction`, sorted by weight then date.

This is a genuine Phase-1 win: the first-pass finding "session health not modeled"
is **IMPLEMENTED**, and it is read consistently in all three surfaces. The rest of
this part critiques the *calculation*, not whether it exists.

### 17.2 The calculation, decomposed

```
terminal:   status in (Completed, Cancelled)                 → carry status
Blocked:    (no trainer OR (no venue AND Face-to-face)) AND days_until <= 14
Blocked:    go_status='No-Go' AND days_until <= 0
At Risk:    go_status='No-Go' AND days_until <= 7
At Risk:    (no trainer OR (no venue AND F2F)) AND days_until <= 30
            OR (has_unpaid AND days_until <= 7)
            OR (roster_gap AND days_until <= 3)
Needs Attn: go_status='No-Go' OR (max_p>0 AND booked>=max_p)
Healthy:    else
```

where `roster_gap = names_captured < seats_sold` and `has_unpaid` = any
non-cancelled, non-waitlist booked line whose order is not Paid.

The proximity-weighting design is right and worth preserving: a missing trainer 60
days out is not a crisis, the same gap 10 days out is Blocked. Keep the 4 levels.

### 17.3 Factor-by-factor audit — what it accounts for and what it misses

| Factor | In the view? | Assessment |
|---|---|---|
| Trainer confirmed | Yes (`trainer_id is null`) | Presence only — no notion of *confirmed* vs merely assigned, no qualification check (`tcMap` in GoNoGo is not consulted) |
| Venue confirmed | Partial (`venue_id is null` **only when `modality='Face-to-face'`**) | **Live Online / hybrid sessions are never flagged for a missing meeting link** — the field doesn't exist (see 17.4) |
| Online meeting link | **No** | Missing field. A Live-Online session with no link is "Healthy" the day before it runs |
| Participant count vs min | Indirect | `go_status='No-Go'` (below-min) maps only to **Needs Attention** — never escalates by proximity. A No-Go session 2 days out is Needs Attention, not At Risk/Blocked, unless trainer/venue also missing. See 17.5 |
| Participant count vs max | Yes (`booked >= max_p` → Needs Attention) | Fine |
| Participant completeness (names) | Yes (`roster_gap AND days_until<=3` → At Risk) | Reasonable, but only bites inside 3 days |
| Payment | Yes (`has_unpaid AND days_until<=7` → At Risk) | Reasonable |
| Materials ready | **No** | Missing field `materials_ready`; materials are only generic attachments |
| Attendance prep (sheet/roster lock) | **No** | Not a factor |
| Certificate readiness (pass_mark/validity configured) | **No** | Not a factor — a session can complete with certs unconfigurable and health stays green |
| Days-until proximity | Yes | The model's strongest idea |
| Cancellation risk | Via `go_status='No-Go'` | Proxy only — no explicit "at risk of cancellation" from sustained under-fill trend |
| Special requirements | **No** | Missing field `special_requirements` |

### 17.4 The three missing input fields (as flagged in the brief)

`schedule` has no `online_meeting_link`, `materials_ready`, or
`special_requirements`. Consequences:

1. **Online-link blind spot is the sharpest.** The venue clause is guarded by
   `modality = 'Face-to-face'`, so for Live-Online (the most common modality in
   `SalesEntry`'s default `'Live Online Training'`) there is **no location-readiness
   check at all**. An online session with no meeting link never leaves Healthy.
2. **Materials never gate readiness** despite being a checklist item everywhere in
   the ops narrative.
3. **Special requirements** (accessibility, equipment) are invisible to health.

Classification: NOT IMPLEMENTED (needs three `schedule` columns + view update).

### 17.5 Recommended calculation changes (keep the 4 levels)

```
terminal:   status in (Completed, Cancelled)                          → carry status

Blocked:    (no trainer
             OR (no venue AND F2F)
             OR (no meeting_link AND online/hybrid))   AND days_until <= 14
            OR (go_status='No-Go' AND days_until <= 0)
            OR (below_min AND days_until <= 3)              ← NEW: imminent under-fill

At Risk:    (go_status='No-Go' AND days_until <= 7)
            OR ((no trainer OR no venue OR no meeting_link) AND days_until <= 30)
            OR (has_unpaid AND days_until <= 7)
            OR (roster_gap AND days_until <= 3)
            OR (materials NOT ready AND days_until <= 7)    ← NEW
            OR (below_min AND days_until <= 7)              ← NEW: under-fill escalates

Needs Attn: go_status='No-Go'
            OR (booked >= max_p)
            OR materials NOT ready
            OR roster_gap
            OR has_unpaid
            OR cert_config_incomplete                       ← NEW
Healthy:    else
```

Key changes, each justified:

| Change | Why |
|---|---|
| Extend the location clause to `online/hybrid` + a `meeting_link` field | Closes the online-link blind spot — the single biggest hole |
| Let **below-min escalate by proximity** (Needs Attn → At Risk ≤7d → Blocked ≤3d) | Today an under-filled session near its date is only "Needs Attention"; that under-states real cancellation risk |
| Add `materials_ready` to At Risk (≤7d) and Needs Attention | Makes the checklist item a health input, not just an attachment |
| Add `cert_config_incomplete` to Needs Attention | A session shouldn't complete with certs unconfigurable and green health |
| Trainer *qualification* (via `tcMap`), not just presence, feeds "no trainer" | Aligns with GoNoGo's own qualification check |

NEEDS TECHNICAL VALIDATION: confirm every surface reads `v_session_health`
(SessionDetail/Calendar/MyWork do; verify no screen re-derives health locally —
`Calendar.tsx`'s `riskClass()` computes an *independent* red/amber under-fill
signal in parallel with the health chip, which can disagree with the view. Fold
`riskClass` into the health model so the calendar shows one signal, not two.)

---

## Part 18 — Training Operations command center

### 18.1 The gap: the model exists, the screen does not

The `v_digest_*` views **already model an ops command center** but feed only
`fn_ops_digest` / the nightly job — no operator can open them:

| View | Contents | Window |
|---|---|---|
| `v_digest_at_risk` | Tentative/Confirmed sessions below min | start ≤ 21d |
| `v_digest_unstaffed` | Sessions with no trainer | ≤ 21d out |
| `v_digest_roster_gaps` | seats_sold > names_captured | ≤ 14d |
| `v_digest_elearning_waiting` | Paid E-learning lines not yet Granted | all |
| `v_digest_stalled_orders` | Orders > 14d in stage | all |

Ops today has **no single cockpit**. They hop across `Calendar` (month/list only),
`SessionDetail` (the true operational record — RosterPanel / GoNoGoPanel /
CloseSession / CancelSession / TransferOrder / FeedbackPanel / P&L / notes),
`Worklist`, `Resources` (unstaffed banner + trainer load), Elearning, and
Communications. `MyWork` §4 shows at-risk sessions but only as a flat list, with
no time-boxing, no lanes, no direct action. Per doc-04 §4, the closest thing to a
cockpit is a handful of Home cards.

### 18.2 Design: the "Operations Today" screen

A single operations workspace with time-boxed lanes on the left and a
calendar/list on the right, built by rendering the digest views (plus
`v_session_health`) into an operator surface.

```
┌ Operations Today ──────────────────────────  [Today][Week][Month][List] ┐
│  LANES (left rail)                    │  CALENDAR / LIST (right)         │
│  ─────────────────                    │  ┌─────────────────────────────┐│
│  ▸ Today (3)          health chips    │  │ Day / Week / Month grid     ││
│  ▸ Tomorrow (2)                       │  │ session chips carry health  ││
│  ▸ This week (11)                     │  │ + fill fraction + conflict  ││
│  ▸ Upcoming (30d) (24)                │  │ marker (fn_find_conflicts)  ││
│  ───── Exceptions ─────               │  │ click → session drawer      ││
│  ⛔ Blocked (2)      v_session_health │  └─────────────────────────────┘│
│  ⚠ At risk (7)       ∪ digest views   │                                 │
│  ○ Unstaffed ≤21d (4) v_digest_unstaf │  SESSION DRAWER (on click)      │
│  ○ Roster gaps (5)   v_digest_roster  │   prep checklist · trainer ·    │
│  ○ Payment issues (3) has_unpaid      │   venue/link · roster · actions │
│  ○ E-learning waiting (6) v_digest_el │                                 │
│  ○ Stalled orders (9) v_digest_stall  │                                 │
│  ───── Decisions ─────                │                                 │
│  Cancellations pending approval (1)   │                                 │
│  Reschedules to fan out (0)           │                                 │
│  Certificates to issue (12)           │                                 │
└───────────────────────────────────────────────────────────────────────┘
```

Every lane count drills through to its filtered list, and every row drills to the
session record or opens the drawer. Drill-through targets:

| Lane / metric | Source | Drill-through |
|---|---|---|
| Today / Tomorrow / This week / Upcoming | `schedule` by `start_date` + `v_session_health` | filtered session list / drawer |
| Blocked · At risk | `v_session_health` (health in Blocked/At Risk) | `/session/:id` |
| Unstaffed ≤21d | `v_digest_unstaffed` | `/session/:id` → assign trainer |
| Roster gaps | `v_digest_roster_gaps` | `/session/:id?tab=participants` |
| Payment issues | `has_unpaid` sessions | `/session/:id?tab=orders` → `/orders/:id` |
| E-learning waiting | `v_digest_elearning_waiting` | `/elearning` filtered |
| Stalled orders | `v_digest_stalled_orders` | `/orders/:id` |
| Cancellations pending | approval rows (object=schedule cancel) | `/approvals` |
| Certificates to issue | closed sessions with unissued certs | `/session/:id?tab=participants` |

### 18.3 Views, saved views, and direct actions

- **Calendar day/week/month + list.** `Calendar.tsx` today has **month grid and
  list only** — no week or day view, and clicking a chip *navigates away* to
  `/session/:id` rather than opening a drawer. Add Week and Day (`cal` param
  already exists: `grid | list` → extend to `day | week | month | list`) and a
  **session drawer** so an operator can triage without losing the calendar.
  NOT IMPLEMENTED.
- **Saved operational views.** Filters are ephemeral URL params everywhere
  (`Calendar`, `Worklist`, `Orders`). Ops needs server-persisted named views ("My
  unstaffed this week", "Roster gaps ≤7d"). DEFERRED (saved-views is a
  cross-cutting gap in the ledger).
- **Direct actions from the cockpit** (no round-trip to the record where safe):
  assign trainer, promote from waitlist (`setLineStatus`), grant E-learning
  access, issue certificate, start reschedule, open the cancel-with-dispositions
  flow. Detection and paperwork automate; **judgment stays human** — cancel,
  no-go, and reschedule fan-out remain explicit confirmed actions
  (`CancelSession` already gates cancellation behind BO approval — keep that).
- **Conflict markers on the calendar.** `fn_find_conflicts` / `fn_conflict_guard`
  already do live trainer/venue double-booking detection on write; surface the
  same data as a chip badge so a conflict is visible without opening the form.
  NOT IMPLEMENTED.

### 18.4 The persisted preparation checklist

Doc-03 §9 lists the readiness items; today they are scattered across
`GoNoGoPanel` (`health[]` prose), `v_session_close_check`, `v_cancel_readiness`,
and RosterPanel's "N missing" — **no single per-session checklist, and nothing is
persisted** (readiness is recomputed each render, so an operator can't record
"materials confirmed with the trainer").

Propose a `schedule_prep` checklist (one row per session), each item deriving its
default state from data but overridable + persisted with who/when:

| Item | Auto-derived from | Persistable override |
|---|---|---|
| Trainer assigned & qualified | `trainer_id` + `tcMap` | — (data-driven) |
| Venue confirmed | `venue_id` (F2F) | ✓ (confirmed with venue) |
| Online meeting link set | `online_meeting_link` (new field) | ✓ |
| Materials ready | `materials_ready` (new field) | ✓ |
| Participants confirmed | `names >= seats_sold` | — |
| Payment satisfied | `has_unpaid = false` | — |
| Roster complete / locked | `roster_locked` | ✓ |
| Attendance sheet prepared | export exists | ✓ |
| Certificates configured | pass_mark + validity | — |
| Special requirements handled | `special_requirements` (new field) | ✓ |

Readiness = all applicable items green — the same facts `v_session_health`
consumes, rendered as an operator-actionable, persisted checklist on the session
drawer and the SessionDetail Overview. This unifies the health signal (Part 17)
and the command center (Part 18): the checklist *is* the health inputs, made
visible and closeable. NOT IMPLEMENTED (needs the three fields + a prep table).

### 18.5 Ops intake ownership (open decision, restated)

`roles.ts` gates `/inquiries` and `/sales-entry` to `['super_admin','sales']` —
**operations cannot open intake at all**. The future-state role model puts a
Marketing/Order Coordinator in charge of intake→validate→endorse. Until that role
lands, decide whether ops can see/act on intake; today the ops cockpit is
fulfillment-only by construction. NEEDS PRODUCT DECISION (role model + permission
change) — DEFERRED here since it depends on the role decision in doc 04.

### 18.6 Operations recommendations

| # | Recommendation | Class | Benefit |
|---|---|---|---|
| T1 | Add `schedule.online_meeting_link`, `materials_ready`, `special_requirements`; wire into `v_session_health` | NOT IMPLEMENTED (DB) | Closes the online-link blind spot and makes materials/requirements real health inputs |
| T2 | Let below-min escalate by proximity in `v_session_health` (Needs Attn→At Risk→Blocked) | NOT IMPLEMENTED (DB, view) | Under-fill near the date is real cancellation risk, currently under-stated |
| T3 | "Operations Today" screen rendering the `v_digest_*` views + health into lanes | NOT IMPLEMENTED | The command-center model exists in SQL but no operator can open it |
| T4 | Calendar week/day views + session drawer + conflict markers | NOT IMPLEMENTED | Triage without leaving the calendar; conflicts already computed |
| T5 | Persisted per-session prep checklist (`schedule_prep`) | NOT IMPLEMENTED | Records readiness decisions instead of recomputing prose each render |
| T6 | Fold `Calendar.riskClass` into the health model (one under-fill signal) | NEEDS TECHNICAL VALIDATION | Calendar shows two possibly-disagreeing risk signals today |
| T7 | Saved operational views (server-persisted) | DEFERRED | Ephemeral URL params can't hold "my unstaffed this week" |
| T8 | Direct actions on the cockpit (assign trainer, promote, grant access, issue cert), judgment actions stay confirmed | NOT IMPLEMENTED | Detection + paperwork automate; cancel/no-go/reschedule remain human |

### 18.7 What is already right (do not re-open)

`v_session_health` shipped and is read consistently; `HealthChip` keeps the
calendar quiet unless action is needed; the digest views correctly model the
lanes; `SessionDetail` is the record-page standard (tabs, header health badge,
gated ops actions); cancellation is DB-gated behind BO approval + dispositions;
conflict detection exists on write. The operations *engine* is largely built — the
missing piece is an operator-facing *surface* that renders it (T3/T4) plus the
three health input fields (T1) and the escalation tuning (T2).
