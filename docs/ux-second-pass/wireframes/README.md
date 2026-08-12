# Text Wireframes — Second-Pass Future State

> Part 38 of the second-pass enterprise UX review. Future-state ASCII wireframes for
> the 14 primary screens, designed against the brief's anchors — not the current code.
> Ground truth for "current": `MyWork.tsx`, `Dashboard.tsx`, `SessionDetail.tsx` (the
> ~80% record reference), `OrderDetail.tsx` / `ClientDetail.tsx` (long-scroll outliers
> to bring onto the standard), `Calendar.tsx`, `Inquiries.tsx` (kanban, no detail page),
> `QuoteDetail.tsx`. Baseline critique: `docs/qa/ux-review/02` §8 (record standard).

## Conventions used in every wireframe

**The five questions** every operational surface must visibly answer:
**(Q1)** What requires my attention · **(Q2)** What do I do next · **(Q3)** Where do I do
it · **(Q4)** Who owns the next step · **(Q5)** Is the process progressing correctly.

**Record-page standard** (all record wireframes below reuse it verbatim — `RecordHeader`
+ `RecordTabs` + `RecordSection` + a persistent right rail):

```
‹ breadcrumb  Home › Module › Record
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ <Title> · <ID>        [Primary] [Secondary ▾] [⋯ overflow]                     │
│ <status pill> │ <health/exception pill> │ Owner: <name>  │  Due <date>         │
│ <key facts: date · value · counts>                                             │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ blocking reasons / missing-to-progress / "you are late" SLA banner          │
├── SUMMARY (3–5 KeyVals) ───────────────────────────────────────────────────────┤
├── TABS: Overview | <children> | Tasks | Documents | Activity | Audit | Related ─┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ TAB BODY                                          │ RIGHT RAIL                   │
│                                                   │ Owner now / Current team     │
│                                                   │ Next action → Next owner     │
│                                                   │ Due date · Escalation state  │
│                                                   │ Related records · Quick acts │
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

**Status vs Health** are separate everywhere: *status* is user/action-driven (a person
sets it), *health/exception* is computed and never hand-set. The order `primaryFlag` and
session `v_session_health` pattern is extended to **inquiry** and **quote** here.

**Ownership contract** shown on every transactional record's rail (stored, not derived):
Owner now · Current team · Assigned date · Due date · Next action · Next owner · Blocking
reason · Escalation state · Ownership history. Schedule and inquiry gain an assignee.

**Handoff = transaction**, never a dropdown edit: trigger → completeness check → send →
receiver **Accept** or **Return-for-correction (reason)** → ownership transfer + activity
event + SLA timer; the sender's queue clears only on Accept. Shown as `[Endorse ▸]` /
`[Accept]` / `[Return ▾]` action clusters, not a stage `<select>`.

---

## 1. My Work — the primary operating surface

Absorbs Home; retires the Home / Worklist / DataQuality / Duplicates overlap (all four
compute the same `isUnowned/isStalled/isOverdue` predicates). One surface for every action
role; sections are role-filtered, each with a live count and inline action.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  My Work — Good day, Alan                     Scope:[Mine▾][My team][Unassigned]    │
│  8 need action · 3 overdue · ₱2.4M at risk    View:[▸ My Open Work ★][+ Save view]⚙ │
│  Sort:[Oldest▾]  Filter:[Overdue][Returned to me][Due this week][Exceptions]        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ NEEDS ACTION (8)                                                    view all →    │
│  ⚠ Approve · Cancel "ISO 9001 LA" 12 Aug   owner:You  waiting 3d  [Approve][Return▾]│
│  ● Returned · Order 176152 sent back by Ops owner:You  reason:"no PO" [Fix & resend]│
│  ● Order 176201 Paid, not endorsed         owner:You  ₱180k         [Endorse ▸]     │
│  ● Task · Call ACME re: renewal            owner:You  overdue 2d    [Open][Done]    │
│ ▾ ORDERS AWAITING PROCESSING (14)          [All][Overdue 3][Stalled 5][Unowned 2]   │
│  176233 ACME Corp · New Comm  owner:R.Cruz  6d in stage  ₱95k       [Advance ▸]     │
│ ▾ SESSIONS TO PREP / AT RISK (4)                                                    │
│  ISO 45001 LA · 20 Aug · At Risk  owner:M.Ops  below min 4/8        [Open][Go/No-Go]│
│ ▾ CERTIFICATES PENDING (11)   ▾ PAYMENT ISSUES (6)   ▾ WAITING ON OTHERS (6)        │
│ ▾ ESCALATIONS · SLA breached (3)   owner→supervisor→BO ladder      [Notify owner]   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Q1** every section header carries a live count; NEEDS ACTION is the single ranked top
  band (approvals, returns, paid-unendorsed, overdue tasks) sorted most-severe-first.
- **Q2/Q3** each row ends in the exact next action inline (`Endorse ▸`, `Advance ▸`,
  `Approve`, `Done`) so the user acts without leaving the surface; `Open` deep-links to
  the record for judgment calls.
- **Q4** every row shows `owner:` and the escalation ladder is named in the Escalations band.
- **Q5** scope toggle (Mine/My team/Unassigned) + server-persisted saved views + the
  "Returned to me" filter make the process state legible; the counts are the health check.

---

## 2. Sales User dashboard

Replaces the one-size Dashboard for a selling rep — metrics → exceptions → actions, every
tile a drill-through link (pattern proven by today's Home attention-cards).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Sales · My numbers                                        Period:[This quarter▾]   │
├──────────────────┬──────────────────┬──────────────────┬────────────────────────────┤
│ My weighted      │ My booked YTD    │ My open orders   │ My overdue collections     │
│  pipeline ₱3.1M  │  ₱6.4M (72% goal)│  9 · 2 stalled   │  ₱240k · 3 orders          │
│ →/inquiries?     │ →/orders?owner=me│ →/my-work?       │ →/my-work?filter=          │
│   owner=me&open  │   &status=live   │   orders&mine    │   overdue-collections      │
├──────────────────┴──────────────────┴──────────────────┴────────────────────────────┤
│ EXCEPTIONS (act now)                                                                │
│  ● 2 inquiries no touch >7d      →/inquiries?owner=me&stale     [Log follow-up]      │
│  ● 1 quote expiring in 3d        →/quotations?owner=me&expiring [Resend][Extend]     │
│  ● Order 176201 paid-unendorsed  →/orders/176201               [Endorse ▸]          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ QUICK ACTIONS  [+ New inquiry] [+ New quote] [+ New order]                           │
│ MY PIPELINE BY STAGE (bar, click a bar → Inquiries filtered to that stage)           │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Q1** four self-scoped KPIs + an Exceptions band surface exactly what the rep owns.
- **Q2/Q3** exceptions carry the inline next action and every metric drills to the filtered
  list where the work is done; quick-action buttons start the create flows.
- **Q4** self-scoped by definition (owner = me); nothing here belongs to another rep.
- **Q5** booked-vs-goal % and the stage bar show whether the rep's pipeline is progressing.

---

## 3. Sales Manager dashboard (real team-scoped role)

The future `Sales Manager` role (replacing the `is_supervisor` boolean) — team/region scope,
reassignment is the manager-only judgment act automation never performs.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Sales Manager · Team North                       Scope:[My region▾] Period:[Qtr▾]   │
├──────────────────┬──────────────────┬──────────────────┬────────────────────────────┤
│ Team weighted    │ Team booked vs   │ Unassigned in    │ Reps over SLA              │
│  pipeline ₱18.2M │  goal 68%        │  region · 5      │  2 reps · 7 items          │
│ →/inquiries?     │ →/reports?       │ →/my-work?scope= │ →/my-work?scope=team&      │
│   team=north     │   tab=sales      │   unassigned     │   filter=sla               │
├──────────────────┴──────────────────┴──────────────────┴────────────────────────────┤
│ TEAM LEADERBOARD (click a rep → their My Work, team scope)                           │
│  Rep         Open  Stalled  Weighted   Overdue$   Action                             │
│  R.Cruz       12      3       ₱4.1M      ₱120k    [Reassign ▾][Notify]               │
│  J.Lopez       8      0       ₱3.7M       ₱0      —                                  │
│ ATTENTION                                                                            │
│  ⚠ 5 unassigned inquiries in region >2d      [Assign ▾]  (manager judgment)          │
│  ⚠ Order 176233 stalled 14d · owner R.Cruz   [Reassign ▾][Open]                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Q1** team-level KPIs + unassigned/over-SLA counts + an Attention band expose the team's
  backlog and the reps carrying risk.
- **Q2/Q3** `Reassign ▾` and `Assign ▾` are inline (the one write reserved to the manager);
  everything else drills to a team-scoped list.
- **Q4** every leaderboard row and attention item names the owning rep; reassignment changes
  ownership as a logged transfer.
- **Q5** team booked-vs-goal, stalled counts and per-rep overdue$ show whether the team is on
  track; `Reps over SLA` is the escalation signal.

---

## 4. Marketing / Order Coordinator dashboard (new role)

The future intake owner: owns **intake → validate → endorse**. This role does not exist today
(intake is gated `['super_admin','sales']`; ops are locked out). The board is the endorsement
funnel plus data hygiene folded in from DataQuality/Duplicates.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Order Coordinator · Intake desk                                Period:[Today▾]     │
├──────────────────┬──────────────────┬──────────────────┬────────────────────────────┤
│ New inquiries    │ Awaiting         │ Paid, not        │ Returned by Ops            │
│  to triage · 12  │  endorsement · 9 │  endorsed · 4    │  (fix & resend) · 3        │
│ →/inquiries?     │ →/my-work?       │ →/orders?flag=   │ →/my-work?filter=          │
│   unassigned     │   endorse-queue  │   paid-unendorsed│   returned                 │
├──────────────────┴──────────────────┴──────────────────┴────────────────────────────┤
│ ENDORSEMENT QUEUE (completeness-gated handoff)                                        │
│  Order      Client    Missing to endorse            Action                           │
│  176233     ACME      — complete —                  [Endorse to Ops ▸]               │
│  176240     Beta Inc  ✗ PO ref  ✗ participant list  [Open to complete]              │
│  176251     Gamma     ✗ SAP-format reference        [Open to complete]              │
│ DATA HYGIENE (folded from DataQuality + Duplicates)                                  │
│  ● 2 possible duplicate clients   [Review & merge ▾]   ● 3 orders missing channel   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Q1** the four funnel KPIs + a completeness column say precisely what is blocking endorsement.
- **Q2/Q3** `Endorse to Ops ▸` is enabled only when the completeness check passes; incomplete
  orders show the missing fields and route to complete them — the handoff-as-transaction gate.
- **Q4** each row's target is Ops; `Returned by Ops` names what came back and why.
- **Q5** the queue *is* the intake pipeline; the Returned count is the health signal that the
  handoff contract is being honoured.

---

## 5. Training Operations command center — "Operations Today"

The v_digest_* views exist but feed only the nightly job; this surfaces them live. Ops owns
sessions (schedule gains an assignee). Four lanes = Today / This week / At risk / Decisions.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Operations Today — Tue 12 Aug 2026            Owner:[Me▾]  [Week][Day] [Calendar →] │
├───────────────────┬───────────────────┬───────────────────┬─────────────────────────┤
│ TODAY (3)         │ THIS WEEK (9)     │ AT RISK (4)       │ DECISIONS (2)           │
│───────────────────│───────────────────│───────────────────│─────────────────────────│
│ ISO 9001 LA       │ 20 Aug ISO 45001  │ ISO 45001 · 4/8   │ Go/No-Go due today:     │
│  Running · 8 pax  │  Confirmed · Prep │  ▲ below min      │  ISO 22000 · 6/8        │
│  owner M.Ops      │  owner M.Ops      │  owner M.Ops      │  [Go][No-Go][Extend]    │
│  [Mark attendance]│  [Prep checklist] │  [Promote wait]   │                         │
│                   │  ✗ no trainer     │  [Notify sales]   │ Cancel request:         │
│ BOSH · certs due  │  [Assign trainer] │                   │  "Lean Six Sigma"       │
│  [Issue certs]    │ 22 Aug e-learning │ ISO 27001 · no    │  needs BO approval      │
│                   │  Ready            │  venue ≤21d        │  [Approve][Return▾]     │
│                   │                   │  [Assign venue]   │                         │
└───────────────────┴───────────────────┴───────────────────┴─────────────────────────┘
  Each card: session-health pill (Healthy/Needs Attention/At Risk/Blocked) + readiness ✗ list
```

- **Q1** the four lanes rank sessions by proximity and computed `v_session_health`; the At Risk
  and Decisions lanes are the pure-attention columns.
- **Q2/Q3** every card ends in the concrete ops act (`Assign trainer`, `Promote wait`,
  `Issue certs`, `Mark attendance`) done in place; Decisions holds the human judgment calls.
- **Q4** every card names the session owner (new schedule assignee); cancel/Go-No-Go route to BO.
- **Q5** health pills + readiness ✗ checklists per card show whether each run is progressing to
  deliverable; the lane counts are the daily health summary.

---

## 6. Management dashboard (read-only, exception-oriented)

The future read-only Management role (never super_admin). Exception-first: healthy KPIs stay
quiet; every tile drills through — no dead ends (today only "Sessions at risk" drills).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Management overview (read-only)              Period:[YTD▾]  Compare:[vs last yr▾]   │
├──────────────────┬──────────────────┬──────────────────┬────────────────────────────┤
│ Booked vs        │ Delivered        │ Weighted         │ Cancellation rate          │
│  forecast 72% ▼  │  revenue ₱6.4M   │  pipeline ₱21M   │  8% ▲ (target ≤5%)         │
│ →/reports?tab=   │ →/reports?tab=   │ →/reports?tab=   │ →/reports?tab=quality&      │
│   revenue        │   delivery       │   pipeline       │   view=cancellations       │
├──────────────────┴──────────────────┴──────────────────┴────────────────────────────┤
│ EXCEPTIONS DEMANDING ATTENTION (drill to the responsible list)                       │
│  ▼ Forecast attainment below plan in Region North   →/reports?region=north           │
│  ▲ AR > 60d aging ₱1.9M                             →/finance?aging=60               │
│  ▲ 4 sessions at risk this month                    →/operations-today?lane=at-risk   │
│  ● NPS dipped to 41 (−9)                            →/quality?tab=nps                 │
│ FORECAST ATTAINMENT GAUGE ▐▐▐▐▐▐▐░░░ 72%     REVENUE BY MONTH (click bar → Reports)  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Q1** KPIs carry ▲/▼ vs-target arrows and an Exceptions band lists only the metrics off-plan.
- **Q2/Q3** read-only role → "next action" is *investigate*: every tile and exception drills to
  the responsible operational list or report; no inline writes.
- **Q4** each exception routes to the team/region/owner accountable for it.
- **Q5** the whole board is the progress check — attainment gauge + vs-last-year comparison +
  aging make trajectory legible at a glance.

---

## 7. Inquiry detail (new record page)

Inquiries have no detail page today (kanban only); leads can't hold activity/notes/files or
convert in one click. New record on the standard, with a computed inquiry **health** signal
(aging) added alongside process status, plus a stored **owner** and **next action**.

```
‹ Home › Sales › Inquiries › INQ-2041
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ ACME Corp — ISO 9001 LA · INQ-2041      [Convert to order ▸][Create quote][⋯]  │
│ Status: Awaiting Feedback │ Health: ● Aging 9d │ Owner: R.Cruz │ Due 14 Aug     │
│ 12 pax · est ₱480k · 60% · Source: Website · Received 3 Aug                     │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ No touch in 9 days · past expected-close in 2d — log a follow-up or mark lost │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Stage: Awaiting Fb] [Weighted ₱288k] [Course: ISO 9001 LA] [Expected 14 Aug]  │
├── TABS: Overview | Activity | Documents | Related ─────────────────────────────┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ OVERVIEW                                          │ RIGHT RAIL                   │
│  Contact: Jane Dela Cruz · jane@acme.ph · 0917…  │ Owner: R.Cruz (Sales North)  │
│  Interest: ISO 9001 Lead Auditor · Public · 12pax│ Next action: Send RFQ        │
│  Notes / touch log (inline add)                   │ Next owner: R.Cruz           │
│  Linked customer: ACME Corp →  [Link/Create]      │ Due: 14 Aug · Escal: none    │
│                                                   │ Related: Customer · Quotes   │
│ CONVERT-TO-ORDER  prefills client+course+pax →    │ Quick: [Log follow-up][Lost▾]│
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** the aging **health** pill + Attention banner ("no touch 9 days, past expected-close")
  are computed, distinct from the user-set stage.
- **Q2/Q3** `Convert to order ▸` (prefills client/course/pax) and `Create quote` are header
  primaries; `Log follow-up` / `Lost ▾` in the rail; done on the record.
- **Q4** rail carries the full ownership contract; `Link/Create` resolves the lead to a
  Customer 360 record (inquiry gains `client_id`).
- **Q5** stage + weighted value + expected-close show pipeline progress; the aging health flags
  when it has stalled.

---

## 8. Customer 360 (unified Client + Organization + Inquiry + history)

Merges Clients + Organizations into one record; adds inquiries (leads now resolve to customers
via `client_id`) which `ClientDetail` never shows today. Brought from long-scroll onto tabs.

```
‹ Home › Customers › ACME Corp
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ ACME Corp        [+ New inquiry][+ New order][Set organization ▾][Archive ⋯]   │
│ Owner: R.Cruz │ ● Overdue ₱240k │ Org: ACME Group │ Since 2023 · Mfg           │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ ₱240k overdue across 3 orders · 1 inquiry aging 9d                           │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Bookings 14] [LTV ₱6.4M] [Collected ₱6.1M] [Outstanding ₱240k] [Open leads 2] │
├── TABS: Overview | Inquiries | Orders | Sessions | Contacts | Documents | Activity ┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ INQUIRIES (2 open)                                │ RIGHT RAIL                   │
│  INQ-2041 ISO 9001 · Awaiting Fb · aging 9d  →   │ Owner: R.Cruz                │
│ ORDERS (14)   Order  Stage  Pay  Health  Amount   │ Org: ACME Group → (roll-up:  │
│  176201  SAP  Paid   ●      ₱180k             →   │   3 clients · AR ₱1.2M)      │
│ SESSIONS BOOKED (9)  course · dates · status  →   │ Next action: Chase AR 60d    │
│ CONTACTS  Jane (primary) · Mark (finance)         │ Related: Quotes · Payments   │
│                                                   │ Quick:[Log contact][New quote]│
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** header `● Overdue ₱240k` + Attention band + `Open leads` summary tile surface the
  money and lead risk without scrolling.
- **Q2/Q3** header primaries (`New inquiry/order`, `Set organization`) and rail quick actions
  act on the customer directly; tabs organize the full history.
- **Q4** rail names the account owner; the Org roll-up shows the parent org's clients/AR (the
  Organizations screen folds in here).
- **Q5** LTV / Collected / Outstanding / Open-leads summary band is the relationship health;
  each tab row drills to the live record.

---

## 9. Quotation detail

Cleanest current record already (`QuoteDetail.tsx`); this normalizes it to the full standard —
adds Activity/Documents tabs, the rail, and a computed quote **health** (expiring/expired now
auto-fires via hygiene) distinct from status, plus a real convert path that reads `quote_line`.

```
‹ Home › Sales › Quotations › Q-2026-118
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ Q-2026-118 — ACME Corp     [Send ▸][Create order ▸][Print][Duplicate ⋯]        │
│ Status: Sent │ Health: ● Expiring 3d │ Owner: R.Cruz │ Valid to 15 Aug          │
│ 2 lines · ₱480k after 5% · Country: PH                                          │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ Valid-until in 3 days, no response — resend or extend before it auto-expires  │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Status: Sent] [Subtotal ₱505k] [Discount 5%] [Total ₱480k] [Valid 15 Aug]     │
├── TABS: Overview (Lines) | Activity | Documents | Related ─────────────────────┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ LINES         Course       Type   Seats  Total    │ RIGHT RAIL                   │
│  ISO 9001 LA  F2F           12    ₱420k        →   │ Owner: R.Cruz                │
│  Refresher    Online         6     ₱85k        →   │ Next action: Chase response  │
│  + Add line (discount hint inline)                │ Next owner: R.Cruz           │
│  ── Subtotal ₱505k · after 5% ₱480k ──            │ Due: 15 Aug · Escal: none    │
│ CREATE ORDER → carries every quote_line, client,  │ Related: Customer · INQ-2041 │
│   discount into the order (no retype)             │ Quick:[Resend][Extend][Decline▾]│
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** the expiring **health** pill + Attention banner are computed from `valid_until`,
  separate from the user-set `Sent/Accepted/Declined` status.
- **Q2/Q3** `Send ▸` (real email, not just `window.print()`), `Create order ▸`, and rail
  `Resend/Extend/Decline` act in place; convert reads `quote_line` — no line retyping.
- **Q4** rail carries owner + next owner; convert threads the quote to the resulting order.
- **Q5** status + valid-until + line total track the quote's progress; auto-expiry closes stale
  quotes so the pipeline stays honest.

---

## 10. Order detail (record standard — the mega-prompt's worked example)

Today a long single-column scroll (`OrderDetail.tsx`); brought onto the tabbed standard. Stage
transitions become the handoff transaction, not a `<select>`; AR is promoted out of the buried
`ReceivablePanel` into a header chip + its own tab.

```
‹ Home › Orders › ORD-176201
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ ACME Corp · ORD-176201    [Endorse to Ops ▸][Record payment ▾][Cancel ⋯]       │
│ Stage: For Order Creation │ Health: ● Paid, not endorsed │ Owner: R.Cruz        │
│ 12 Aug · ₱180k · Paid · Channel: Inside Sales · SAP: —                          │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ Blocking endorsement: SAP reference missing · participant list incomplete     │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Stage] [Value ₱180k / Collected ₱180k / Outstanding ₱0] [Seats 12] [12 Aug]   │
├── TABS: Overview | Lines (2) | Receivable | Tasks | Documents | Activity | Audit ┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ LINES        Course      Session       Seats      │ RIGHT RAIL                   │
│  1 ISO 9001  20 Aug F2F  →session       8         │ Owner: R.Cruz (Sales North)  │
│  2 Refresher e-learning  —              4         │ Current team: Sales          │
│  [Move line to another session ▾]                 │ Next action: Endorse to Ops  │
│                                                   │ Next owner: Training Ops     │
│ ENDORSEMENT (transaction, not a dropdown)         │ Due: 13 Aug · Escal: none    │
│  Completeness ✗ SAP ref  ✓ payment  ✗ roster      │ Related: Customer·Quote·Inv  │
│  [Endorse to Ops ▸] (disabled until ✓)            │ Ownership history ▸          │
│                                                   │ Quick:[Add task][Comment]    │
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** header separates **stage** (user-driven) from **health** `primaryFlag`
  ("Paid, not endorsed"); the Attention band lists the exact blockers to progress.
- **Q2/Q3** `Endorse to Ops ▸` is a completeness-gated handoff done on the record; on Ops the
  same order shows `[Accept]` / `[Return ▾]`; the sender's My Work clears only on Accept.
- **Q4** rail's full ownership contract names owner, current team, next owner (Training Ops),
  and links Ownership history.
- **Q5** stage + AR summary (value/collected/outstanding) + the completeness checklist show
  whether the order is progressing legally through the state machine.

---

## 11. Training session detail (health header + readiness checklist + ops action rail)

`SessionDetail.tsx` is the ~80% reference; this completes it — a persistent right rail with the
ops action stack, a readiness checklist in the Attention area, and the missing session-health
inputs (online-meeting link, materials_ready, special_requirements). Schedule gains an owner.

```
‹ Home › Operations › Sessions › ISO 45001 LA · 20 Aug
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ ISO 45001 Lead Auditor · SES-0912   [Go/No-Go ▾][Close ⋯][Cancel ⋯][Edit]      │
│ Status: Confirmed │ Health: ▲ At Risk │ Owner: M.Ops │ Starts in 8d             │
│ 20–24 Aug · F2F · Certification · Fee ₱42k · Margin 38%                          │
├── ATTENTION · READINESS CHECKLIST ────────────────────────────────────────────┤
│ ✓ Trainer assigned   ✗ Below min (4/8)   ✗ No venue ≤21d   ✓ Materials ready    │
│ ✗ No online-meeting link   → 3 items block "Go"                                 │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Fill 4/8 ▐▐░░] [Trainer: J.Reyes] [Venue: —] [Go: pending] [Margin 38%]       │
├── TABS: Overview | Orders (3) | Participants | Notes | Files | Feedback | History┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ OVERVIEW  Pax by channel · P&L · Forecast (BO)    │ RIGHT RAIL — OPS ACTIONS     │
│  Booked 4 · Waitlist 2 → promote to fill          │ Owner: M.Ops (Training Ops)  │
│  Special requirements: wheelchair access          │ Next action: Assign venue    │
│                                                   │ Due: Go/No-Go by 13 Aug      │
│                                                   │ [Assign trainer][Assign venue]│
│                                                   │ [Promote waitlist][Set Go/No-Go]│
│                                                   │ [Confirm][Close][Cancel▾]     │
│                                                   │ Related: Orders · Certs       │
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** the computed `v_session_health` pill + a readiness checklist naming each ✗ blocker
  (below min / no venue / no link) sit above the fold, separate from the `Confirmed` status.
- **Q2/Q3** the right rail is a persistent ops action stack (assign trainer/venue, promote
  waitlist, Go/No-Go, close/cancel) — every act done on the session.
- **Q4** header + rail name the session owner (new schedule assignee); cancel routes to BO approval.
- **Q5** fill bar + readiness checklist + Go status + margin show whether the run is on track to
  deliver; "3 items block Go" is the explicit progress gate.

---

## 12. Payment / AR detail (refund / void / credit + confirmation lifecycle)

New record. Today "refund" is a hard payment DELETE with an un-persisted reason and payments are
mutable/deletable; this models a real payment lifecycle (Recorded → Confirmed → Refunded/Voided)
and a credit note — none of which are destructive deletes. Refund/void stay human judgment.

```
‹ Home › Finance › Order ORD-176201 › PAY-4471
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ Payment PAY-4471 · ₱180,000     [Confirm ▸][Refund ▾][Void ▾][Credit note ⋯]   │
│ State: Recorded (unconfirmed) │ Health: ● Awaiting confirmation │ By: R.Cruz     │
│ Method: Bank transfer · Ref BT-99213 · 11 Aug · Order ORD-176201 → ACME Corp     │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ Recorded but not confirmed 1d — finance must confirm against the bank feed     │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Amount ₱180k] [Applied to ORD-176201] [Balance after ₱0] [Method BT] [11 Aug] │
├── TABS: Overview | Lifecycle | Documents | Activity | Audit ───────────────────┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ LIFECYCLE (append-only, never deleted)            │ RIGHT RAIL                   │
│  ● Recorded    11 Aug  R.Cruz  ₱180k              │ Owner: Finance (BO)          │
│  ○ Confirmed   —       —       (pending)          │ Next action: Confirm payment │
│  ○ Refund/Void —       —       reason required     │ Next owner: BO               │
│  CREDIT NOTES  none                                │ Escalation: none             │
│  Refund → creates offsetting entry + reason (kept) │ Related: Order · Customer    │
│  Void → reverses an erroneous record (reason kept) │ Quick:[Confirm][Refund▾]     │
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** the `Awaiting confirmation` health + Attention banner flag unconfirmed money; state is
  distinct from method/amount.
- **Q2/Q3** `Confirm ▸` / `Refund ▾` / `Void ▾` / `Credit note` act on the record and each
  writes an **append-only** lifecycle entry with a persisted reason — no hard deletes.
- **Q4** rail routes confirmation and refund/void to Finance/BO (the roles allowed to touch
  payment status; sales are DB-blocked).
- **Q5** the Lifecycle tab is the audit-grade progress trail (Recorded → Confirmed → Refunded);
  balance-after shows the order's collection state.

---

## 13. Participant detail (transfer / substitute / soft-cancel + history)

New record. Today the roster has no per-attendee actions: removal is a hard delete, no single
transfer/substitute/soft-cancel, no CSV import. This gives each attendee a record with a
non-destructive lifecycle and a movement history.

```
‹ Home › Operations › Sessions › ISO 45001 LA › Participant · Jane Dela Cruz
┌── HEADER ─────────────────────────────────────────────────────────────────────┐
│ Jane Dela Cruz · PAX-8841     [Substitute ▾][Transfer ▾][Soft-cancel ⋯]        │
│ Status: Enrolled │ Health: ● Attendance incomplete │ Seat via ORD-176201        │
│ jane@acme.ph · ACME Corp · ISO 45001 LA · 20–24 Aug                              │
├── ATTENTION ──────────────────────────────────────────────────────────────────┤
│ ⚠ Day 2 attendance unmarked · certificate cannot issue until attendance complete │
├── SUMMARY ─────────────────────────────────────────────────────────────────────┤
│ [Status Enrolled] [Attendance 1/5 days] [Cert: not issued] [Order ORD-176201]  │
├── TABS: Overview | Attendance | Certificate | History | Documents ─────────────┤
├─────────────────────────────────────────────────┬──────────────────────────────┤
│ ATTENDANCE       Day   Present   Marked by         │ RIGHT RAIL                   │
│  Day 1 ✓  Day 2 —  Day 3 —  Day 4 —  Day 5 —      │ Seat owner order: 176201 →   │
│  [Mark present ▾]                                  │ Next action: Mark Day 2      │
│ MOVEMENT HISTORY (append-only)                     │ Next owner: Training Ops     │
│  Enrolled 10 Aug (from CSV import batch #12)       │ [Substitute][Transfer]       │
│  — no transfers —                                  │ [Soft-cancel▾ (reason)]      │
│  Substitute → swap person, keep the seat + order    │ Related: Session · Order     │
│  Transfer → move to another session (keeps history) │ History: 1 event ▸           │
└───────────────────────────────────────────────────┴──────────────────────────────┘
```

- **Q1** the attendance **health** + Attention banner ("Day 2 unmarked, cert blocked") show what
  is incomplete, separate from `Enrolled` status.
- **Q2/Q3** `Substitute` (swap person, keep seat), `Transfer` (move sessions), `Soft-cancel`
  (reason kept, not a delete), and `Mark present` all act on the record.
- **Q4** rail links the seat's owning order and names Training Ops as next owner.
- **Q5** attendance days + cert state + append-only movement history show whether the participant
  is progressing to a certificate; nothing is destroyed.

---

## 14. Calendar (week view + session drawer)

Adds the missing week view and an in-place session drawer (edit without leaving the calendar) to
`Calendar.tsx`'s existing month/list. Health chips already read `v_session_health`; the drawer
carries the readiness checklist and ops actions so the grid stays the context.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Training calendar   [Month][Week][List] ‹ Aug 18–24 › [Today]   Filters:[…]        │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬───────────────────────────────────┤
│ Mon18│ Tue19│ Wed20│ Thu21│ Fri22│ Sat23│ Sun24│  ▌ SESSION DRAWER (Wed 20)  ✕     │
│      │      │ ISO  │ ISO  │ ISO  │      │      │  ISO 45001 LA · SES-0912          │
│      │ BOSH │ 45001│ 45001│ 45001│      │      │  Status Confirmed │ ▲ At Risk     │
│      │ ●Heal│ ▲Risk│ cont.│ cont.│      │      │  Owner M.Ops · starts in 8d       │
│      │      │ 4/8  │      │      │      │      │  Readiness: ✗ below min ✗ no venue│
│      │ e-lrn│ ●    │      │ 22000│      │      │  Fill 4/8 ▐▐░░  Fee ₱42k          │
│      │ Ready│      │      │ ●Deci│      │      │  [Assign trainer][Assign venue]   │
│      │      │      │      │ sion │      │      │  [Promote waitlist][Go/No-Go ▾]   │
│      │      │      │      │      │      │      │  [Open full record →]             │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴───────────────────────────────────┘
  Chips per event: status abbr + health pill (only when health needs action — grid stays quiet)
```

- **Q1** week grid places each run on its days; a health chip appears **only** when
  `v_session_health` needs action, so an at-risk/blocked session stands out against a quiet grid.
- **Q2/Q3** clicking an event opens the drawer with the readiness checklist and ops action stack —
  assign/promote/Go-No-Go done in place, calendar still visible; `Open full record →` for depth.
- **Q4** the drawer names the session owner (schedule assignee).
- **Q5** the drawer's readiness ✗ list + fill bar + Go status show whether that run is on track
  without leaving the schedule view.

---

## Cross-wireframe consistency checklist

| Screen | Type | Record standard | Five-Q inline actions | Status⊥Health |
|---|---|---|---|---|
| My Work | Operational | — | ✓ (per-row next action) | ✓ (exceptions ⊥ tasks) |
| Sales / Sales Mgr / Coordinator / Ops Today / Management | Dashboards | — | ✓ (every tile drills) | ✓ (KPI ⊥ exception band) |
| Inquiry / Quote / Order / Customer 360 / Session / Payment / Participant | Records | ✓ full header+rail | ✓ (header + rail acts) | ✓ (health pill ⊥ status pill) |
| Calendar | Operational | drawer = mini-record | ✓ (drawer acts) | ✓ (health chip ⊥ status abbr) |

Every record wireframe reuses the identical header/rail block; every operational surface answers
all five questions with an inline action, not just a status readout.
