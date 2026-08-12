# Second pass — Customer, Sales & Order experience (Parts 19, 22, 23)

Scope: the commercial half of the portal — the Sales User's day, the customer
record architecture, and the order lifecycle as one journey. Grounded in the
current code: `Inquiries.tsx`, `Quotations.tsx`, `QuoteDetail.tsx`,
`SalesEntry.tsx`, `Orders.tsx`, `OrderDetail.tsx`, `Worklist.tsx`, `MyWork.tsx`,
`Clients.tsx`, `ClientDetail.tsx`, `Organizations.tsx`, `OrganizationDetail.tsx`,
`src/lib/orderState.ts`, `src/lib/roles.ts`. Baseline: `docs/qa/ux-review/04`.

Classifications used: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED /
DEFERRED / NO LONGER RELEVANT / NEEDS PRODUCT DECISION / NEEDS TECHNICAL VALIDATION.

---

## Part 19 — Sales experience: the lean "My Book" cockpit

### 19.1 Walk the Sales User's day against the five-question test

Simulating a plain selling rep (not a supervisor) moving through the portal
today, screen by screen:

| Moment | Screen(s) today | What requires my attention? | What do I do next? | Where? | Who owns next step? | Progressing correctly? |
|---|---|---|---|---|---|---|
| A lead arrives | `Inquiries.tsx` kanban | Only visible if the rep opens the board and scans columns; no aging, no health | Advance a card with `›`, or `markLost` | Inquiries | `sales_id` (owner exists) but **no assignee on the record UI** | No signal — a lead can sit in `Received` forever silently |
| Qualify / follow up | none | — | There is **no next-action / task on an inquiry**; `task` table is not wired to `inquiry` | — | unclear | Not tracked at all |
| Send a quote | `Quotations.tsx` → `QuoteDetail.tsx` | Quote list has no aging/health column | Add lines, set validity, mark Sent | QuoteDetail | rep | `Expired` now auto-fires nightly (good); nothing else |
| Convert | QuoteDetail "Create order" | — | Deep-links `/sales-entry?client=…&quote=…` | SalesEntry | rep | **Lines are NOT carried** — see 23.3 |
| Book the order | `SalesEntry.tsx` | Inline dup-client warning (Phase 4 #21) | Fill customer + lines, submit | SalesEntry | self-assigns on save | 4-write saga; placeholder header |
| Track fulfillment | `Worklist.tsx` (Mine) + `MyWork.tsx` | Stalled/overdue/paid-unendorsed flags via `orderState` | Advance stage, claim | Worklist / My Work | rep, until endorsed | Reasonable — this is the strongest surface for a rep |
| Read the customer | `ClientDetail.tsx` | LTV / outstanding / overdue band | — | ClientDetail | owning rep | Good, but **inquiries and quotes are invisible here** (22.2) |

**The test fails hardest at the top of the funnel.** Questions 1 ("what
requires my attention?") and 5 ("is it progressing?") have no answer for
inquiries and quotes — there is no health signal, no aging, no next-action, no
task. The rep must *remember* to open the kanban and eyeball it. By the time work
reaches an order, the portal answers all five questions well (Worklist + My Work
+ orderState flags). **The commercial cockpit is inverted: strongest where the
work is already an order, weakest where the rep actually spends selling effort.**

### 19.2 Does Sales see too much Operations, or too little commercial context?

**Both, and it is the central Sales-UX defect.**

**Too much operations.** `OrderDetail.tsx` gates its editor with
`canEdit = ['operations','super_admin','sales','business_owner']` (line 122). A
sales rep opening their own order gets the full **Fulfillment** card — a
`fulfillment_stage` dropdown across all seven ops stages, the SAP field, the
payment field, `BlockerBar`, `ReceivablePanel` (AR), and per-line **"Move to
another session"** (`fn_transfer_line`). Phase 4 made payment and SAP *read-only*
for sales (`isSales`, lines 182–197) — a real improvement — but the screen is
still an operations fulfillment console with two fields greyed out. A rep sees
stage transitions they don't own, a session-transfer control that belongs to ops,
and an AR ledger, none foregrounded to their job.

**Too little commercial context.** Nowhere in the order or customer views does the
rep see: the quote this order came from (only `quote.converted_order_id` points
one way — OrderDetail never links back), the deal's commercial history, the
customer's open pipeline, or their own targets/quota. `Clients.tsx` shows an
attribution tab but it is a per-session "clients brought" count, not a pipeline or
quota view. There is no per-rep aging, win/loss (the `lost_reason` captured in
`Inquiries.markLost` is never reported), or coverage.

Classification: OrderDetail sales read-only fields **IMPLEMENTED**; a genuine
sales *view* of the order (commercial fields foregrounded, ops controls hidden)
**NOT IMPLEMENTED**.

### 19.3 Design: the "My Book" cockpit

`My Work` (`MyWork.tsx`) today is entity-generic — tasks, approvals, orders,
sessions, SLA. It has no commercial lane. Rather than build a *fourth* surface,
**give the Sales role a commercial-first arrangement of My Work** plus a
sales-scoped order view. Two deliverables:

**(a) My Book — the sales landing (a role-variant of My Work, not a new route).**

```
┌ My Book ─────────────────────────────────────────────────────────────┐
│ Today's follow-ups (3)          [inquiry.next_action_at <= today]     │
│   • Acme Corp — call back re ISO 27001    Due today   [Log] [Open]    │
│   • BDO — chase RFQ decision              2d overdue  [Log] [Open]    │
├───────────────────────────────────────────────────────────────────────┤
│ My pipeline            Open value ₱1.24M · weighted ₱480k             │
│   Received 4 · Responded 3 · RFQ Sent 5 · Awaiting 2   → Inquiries    │
├───────────────────────────────────────────────────────────────────────┤
│ My quotes             Sent 6 · expiring ≤7d 2 (⚠)     → Quotations    │
├───────────────────────────────────────────────────────────────────────┤
│ My orders needing attention (existing MyWork §3, self-scoped)         │
│ Unassigned to claim (Worklist "Claim queue")                          │
└───────────────────────────────────────────────────────────────────────┘
```

Every tile drills through: follow-ups → the inquiry record (new, see 22/23);
pipeline stages → `/inquiries?stage=…`; expiring quotes → `/quotations?status=Sent`
filtered by `valid_until`; orders → existing `/orders/:id`; claim queue →
`/worklist?who=unassigned`. This reuses `useInquiries`, `useQuotes`,
`useFulfillmentQueue` — no new data plumbing except the `next_action` fields.

**(b) A sales view of `OrderDetail`.** Same route, role-conditioned layout:

| Element | Ops/BO/super_admin | Sales |
|---|---|---|
| Fulfillment card (stage dropdown) | editable | **hidden**; show stage as a read-only status chip + "endorsed / awaiting ops" line |
| Payment / SAP | editable (ops/BO) | already read-only (keep) |
| `ReceivablePanel` (AR) | full | **collapsed summary** (paid / outstanding / overdue only) — the numbers a rep needs, not the invoice/payment editor |
| Per-line "Move to another session" | shown | **hidden** (ops-owned) |
| Commercial header | — | **add**: source quote link (reverse of `converted_order_id`), channel, deal value, owner |
| Comments / Activity | shown | shown (keep — this is the rep's handoff channel) |

Implementation: this is a `role === 'sales'` branch in `OrderDetail.tsx`, not a
DB change. It resolves the doc-04 "UI-gate vs RLS divergence" cleanly — the DB
already blocks sales from AR writes and payment/SAP; the UI should stop *offering*
the ops surface at all.

### 19.4 Sales cockpit recommendations

| # | Recommendation | Class | Benefit |
|---|---|---|---|
| S1 | Add `inquiry.next_action_at` + `inquiry.next_action_note`; feed "Today's follow-ups" and the task/SLA stream | NOT IMPLEMENTED (needs DB) | Answers Q1/Q2 at the top of funnel — the biggest gap |
| S2 | Sales-view of OrderDetail: hide fulfillment editor + line-transfer, collapse AR to a summary, foreground commercial header | NOT IMPLEMENTED (UI only) | Stops pushing reps into an ops console; least-privilege by design |
| S3 | Reverse-link order → source quote on OrderDetail | NOT IMPLEMENTED (UI only, FK exists) | Commercial traceability |
| S4 | My Book arrangement of My Work for the sales role (pipeline / quotes / follow-ups tiles) | NOT IMPLEMENTED | One operating surface for the rep |
| S5 | Win/loss reporting from the already-captured `lost_reason` | NOT IMPLEMENTED | Data captured today is thrown away |
| S6 | Real Sales Manager surface (per-rep pipeline, aging, coverage) — depends on the role decision | DEFERRED / NEEDS PRODUCT DECISION | `is_supervisor` grants region RLS with no matching UI |

---

## Part 22 — Customer architecture / Customer 360

### 22.1 Current state: four unlinked customer concepts

| Concept | Table / field | Role | Linkage |
|---|---|---|---|
| Client | `client` (`name`, `company`, scalar `email`/`phone`/`contact`, `owner_sales_id`, `org_id`) | The transactional customer; orders/quotes hang off it | dedupe by exact `email` |
| Organization | `organization` (`org_id`, flat) | Groups client contacts of one company | `client.org_id` — **one level, no `parent_org_id`** |
| Contact | `contact` (multiple per client) via `ContactsPanel` | Named people | separate from the scalar `client.contact`/`client.email` SalesEntry writes |
| Inquiry | `inquiry` (own `company`/`contact`/`email`/`phone`) | The lead | **NO `client_id` FK** — a lead never resolves to a customer |

`ClientDetail.tsx` is already a strong Customer-360 *shell*: a KPI band
(Bookings / Seats / LTV / Collected / Outstanding, overdue badge), identity card
with an Organization picker, Orders, Sessions booked, Contacts, Files, and a
merged Activity timeline. But it draws **only** from `useClientHistory` (orders +
their lines/sessions). It shows **no inquiries and no quotes** — the entire
pre-sale relationship is missing from the customer's own page.

### 22.2 Is a true Customer 360 needed? — Yes, but mostly as *wiring*, not a rebuild

The screen already exists and is good. The failure is that three of the four
customer concepts don't reach it:

1. **Inquiries never appear.** `inquiry` has no `client_id`, so `ClientDetail`
   cannot query "this customer's leads." A rep looking at Acme cannot see Acme's
   three open inquiries. This is the single highest-value fix.
2. **Quotes never appear.** `quote.client_id` exists — the join is trivial — yet
   `ClientDetail` renders no Quotes section.
3. **Organization is flat and financially blind.** No `parent_org_id`, no
   org-level rolled-up AR on the client page. `OrganizationDetail` lists member
   contacts and files only — no combined LTV/outstanding across the group.

**The workflow benefit that justifies each data-model change** (per the brief's
"only where the benefit is clear" rule):

| Change | Benefit (concrete) | Class |
|---|---|---|
| `inquiry.client_id` FK, resolved by the same email-dedup SalesEntry uses | A won inquiry becomes the customer's order without retyping; ClientDetail shows the full funnel; win/loss attaches to a customer | NOT IMPLEMENTED (DB) — **highest value** |
| Quotes section on ClientDetail (no schema change — `quote.client_id` exists) | Rep sees outstanding quotes when talking to the customer | NOT IMPLEMENTED (UI only) |
| `organization.parent_org_id` + org-level AR rollup | A single national account (BDO Manila / Cebu) rolls up spend and outstanding | DEFERRED / NEEDS PRODUCT DECISION — only if multi-entity accounts are real for PH/ID |
| Owner-reassignment control on ClientDetail (logged) | Today ownership only changes via raw `owner_sales_id`; no audited UI | NOT IMPLEMENTED |

### 22.3 The Customer 360 target layout

Bring `ClientDetail` onto the record-page standard (breadcrumb → header with
owner/health → attention area → summary → tabs → right rail). It is ~70% there;
the gaps are the tabs and the right rail.

```
Customers ›  Acme Corporation                          [Owner ▾] [Archive]
Header:  Acme Corporation · Manufacturing · PH
Badges:  Owner: R. Cruz · Overdue ₱120k · [org] Acme Group
─ Attention ─ 2 inquiries aging · 1 quote expiring in 4d · ₱120k overdue ─
Summary band:  Bookings 14 · Seats 96 · LTV ₱2.4M · Collected ₱2.28M · Out ₱120k
Tabs:  Overview | Inquiries(3) | Quotes(2) | Orders(14) | Training history |
       Participants | Payments | Contacts | Documents | Activity | Audit
Right rail:  Owner · Related companies (org tree) · Next action · Recent activity
```

- **Inquiries / Quotes tabs** are the new content (needs S1 wiring for inquiries;
  quotes are a free join).
- **Training history** = the existing "Sessions booked" section, renamed.
- **Payments** = surface `v_order_ar` rolled up to the customer, not just
  per-order (today AR lives only inside each `OrderDetail`).
- **Related companies** = the org tree once `parent_org_id` exists; today just the
  flat org link.

### 22.4 Consolidate Clients + Organizations into one Customers area

`roles.ts` NAV carries **both** `/clients` and `/organizations` as separate
top-level Customers items. Per the future-state IA anchor, merge into a single
**Customers** surface: a list with a Clients / Organizations toggle (mirroring the
existing Clients/Attribution toggle in `Clients.tsx`), both feeding the same
record standard. Keep `OrganizationDetail` as the org-level record; keep
`ClientDetail` as the person/account-level Customer 360. This is IA, not schema.

Classification: Customer 360 shell **IMPLEMENTED**; inquiry/quote/payment
consolidation and org rollup **NOT IMPLEMENTED / DEFERRED**.

---

## Part 23 — The order lifecycle as one journey

### 23.1 The lifecycle today, stage by stage

| Phase | Where | Mechanism | Gap |
|---|---|---|---|
| Creation | `SalesEntry.tsx` | 4-write saga: `client` insert → `orders` insert (placeholder `seats=1`, `amount_php=0`, `modality=good[0].modality`) → `order_line` insert (rollback deletes header on failure) → `order_assignment` upsert | No `fn_create_order` RPC — not transactional; a crash between writes half-creates an order |
| Validation | SalesEntry capture checks | Order # present, ≥1 line, session for scheduled lines, fee set; non-blocking SAP format warning; inline dup-client warning | No validated customer, no billing contact, no completeness gate before endorsement |
| Ownership | `order_assignment` | Self-assign on create; Worklist reassign (ops, `fn_transfer_line`/`p_asg_ops`) | Stored — good. Sessions and inquiries still have **no owner UI** |
| Payment visibility | `OrderDetail` / `ReceivablePanel` | AR trigger sets `payment_status`; sales read-only | Fine |
| Endorsement | `fulfillment_stage='Endorsed to Ops'` | A dropdown value change (Worklist "Next step" button / OrderDetail dropdown) | **Not an event** — no completeness gate, no ops accept/return, no queue clear |
| Ops acceptance | none | — | No receipt; ops just sees the stage flipped |
| Fulfillment | `Worklist.tsx` | Stage advance, bulk advance, SLA banner, `fn_orders_stage_guard` enforces legal transitions | Stage machine now DB-guarded (IMPLEMENTED); handoff still a dropdown |
| Training linkage | `order_line.schedule_id` → `SessionDetail` Orders tab | Line booked to a session; waitlist logic | Good |
| Participants / certs | `RosterPanel` on the session | Roster, attendance, certs | Covered in ops docs |
| Completion / closure | `fn_close_session`; order has no explicit "Closed" | Session closes; order lingers | No auto order→Closed (Phase 4 deferred) |
| Cancellation | `order_status='Cancelled'` / `fn_cancel_schedule` | Session cancel is approval-gated + dispositioned (well-designed); order cancel is a status | Order-level cancel has no disposition flow |
| Refund / credit | none | "refund" = hard payment DELETE with un-persisted reason | **Absent** (DEFERRED, DB/architecture) |
| Audit | `audit_log` | `changed_fields` = field **names** only | Not audit-grade (covered in doc 04/roadmap) |

### 23.2 Endorsement is still the weakest joint

`fn_orders_stage_guard` now enforces *legal* transitions (forward/cancel/reopen)
— a real Phase-1 win. But endorsement, the one handoff that crosses a team
boundary (sales → ops), is still just `fulfillment_stage='Endorsed to Ops'`. Per
the future-state "handoff = transaction" anchor, it should be:

```
trigger (sales clicks Endorse)
  → completeness check (customer valid, all lines have session or E-learning,
    fee set, payment state known)   ← gate, blocks if incomplete
  → creates an endorsement event + task/notification to a named ops owner
  → ops Accept (ownership transfers, SLA timer starts, sender queue clears)
     OR Return-for-correction (reason → back to sales queue)
```

None of this exists. The sender's Worklist never clears on "accept" because
there is no accept. NOT IMPLEMENTED — this is the highest-value order-flow build
after the create-order RPC.

### 23.3 Quote → order still retypes every line

`QuoteDetail` "Create order" deep-links `/sales-entry?client=…&quote=…`.
`SalesEntry` reads `?client` (preselects the customer) and, on success, marks the
quote `Accepted` + `converted_order_id`. But it **never reads `quote_line`** — the
rep retypes every course, modality, seat count, and price that the quote already
holds. This is error-prone (the order can silently diverge from the accepted
quote) and pure rework. Fix: on `?quote`, hydrate `lines[]` from `useQuoteLines`.
NOT IMPLEMENTED.

### 23.4 The core question: should Orders and Worklist stay separate?

Today there are **three** overlapping order surfaces, all computing the same
`orderState` predicates:

| Surface | Data hook | Purpose | Actions |
|---|---|---|---|
| `Orders.tsx` | `useOrdersPaged` (server-paged) | Browse/search **all** orders, expand lines, CSV | none (read + navigate) |
| `Worklist.tsx` | `useFulfillmentQueue` (full queue, client-filtered) | The **work** queue: mine/unassigned/all, named views, stage, bulk advance/assign, SLA | advance, assign, bulk |
| `MyWork.tsx` §3+§5 | `useFulfillmentQueue` + `useSlaBreaches` | Orders/SLA *needing attention*, self-scoped | navigate |

They differ in a way that is actually meaningful and worth preserving as *two*
concepts, not three:

- **Orders = the ledger / system of record.** Server-paged, searchable, every
  order regardless of state, exportable. This is the "look something up" surface.
  It should stay.
- **Worklist / My Work = the work queue.** Only actionable orders, with the
  advance/assign verbs. These two are the redundancy — Worklist and the order
  sections of My Work are the *same* filtered queue with the *same* predicates.

**Recommendation:** keep **Orders** (the ledger) as a distinct surface. **Retire
`Worklist` as a separate destination and fold its capability into My Work's order
lanes** — My Work already carries "orders needing attention" and "SLA breaches";
add Worklist's owner-scope toggle (mine/unassigned/all), named views, and bulk
advance/assign there. That collapses three surfaces to two along the right seam:
*browse the ledger* vs *work the queue*. This matches the future-state anchor
("My Work becomes the primary operating surface… retire the overlap, don't add a
4th surface") — note that Worklist + My Work today is exactly the additive
overlap the ledger warns about.

Caveat / NEEDS PRODUCT DECISION: ops currently *live* in Worklist as their main
console. Folding it into My Work is correct only if My Work's order lanes gain
Worklist's full verb set (bulk, reassign-any, claim queue). If that is too big a
lift for one pass, the interim is to **make Worklist and My Work share one
component** for the order table so the predicates and actions cannot drift, and
label them as one concept in NAV.

### 23.5 Order-experience recommendations

| # | Recommendation | Class | Benefit |
|---|---|---|---|
| O1 | `fn_create_order` RPC: one transactional write, real header seats/amount, no placeholder | NOT IMPLEMENTED (DB) | Removes the half-created-order failure mode of the 4-write saga |
| O2 | Hydrate SalesEntry lines from `quote_line` on `?quote` | NOT IMPLEMENTED (UI) | Ends retyping; order can't silently diverge from the accepted quote |
| O3 | Endorsement as a transaction: completeness gate → event → ops Accept/Return → queue clear | NOT IMPLEMENTED | Turns the one cross-team handoff into a real receipt |
| O4 | Merge Worklist into My Work order lanes (shared component); keep Orders as the ledger | NEEDS PRODUCT DECISION | Collapses 3 order surfaces to 2 along the browse/work seam |
| O5 | Order-level cancellation with disposition (mirror the session cancel flow) | NOT IMPLEMENTED | Cancels are currently an unaudited status flip |
| O6 | Refund / void / credit model (immutable payments + refund object) | DEFERRED (DB) | "Refund" is a hard DELETE today — money leaves with no audit |
| O7 | Auto order→Closed when its sessions complete + paid | DEFERRED (Phase 4 automation) | Orders linger with no terminal state |

### 23.6 What is already right (do not re-open)

- `fn_orders_stage_guard` (legal transitions), `fn_merge_orders` (real dedup),
  optimistic-concurrency save on OrderDetail (`updated_at` token), self-assign +
  ops reassign stored ownership, sales blocked from payment/SAP at the DB, waitlist
  on capacity — all IMPLEMENTED and sound. The order *machine* is in good shape;
  the order *journey* (create RPC, quote carry-over, endorsement handoff,
  refund/close) is where the remaining value sits.
