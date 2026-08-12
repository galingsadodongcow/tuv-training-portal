# 08 — Screen Redesigns (Parts 15, 25, 26, 27, 37, 40)

> Second-pass. Grounded in the current `OrderDetail.tsx`, `ClientDetail.tsx`, `SessionDetail.tsx`, `Orders.tsx`, `Worklist.tsx`, `Clients.tsx`, `SalesEntry.tsx`, `src/components/record.tsx`, `ui.tsx`, `src/app/globals.css`. Baseline: `docs/qa/ux-review/02` (record standard §8, tables §9) and `03` (forms §1). Classifications per the shared ledger.

---

## Part 15 — The standard record page

### 15.1 What SessionDetail already proves (the reference, ~80%)

`SessionDetail.tsx` is the only record screen on the enterprise pattern. It has: `RecordHeader` (back-link → title → subtitle → badge row) with **status + go + computed health + flags** in the badge row (`StatusPill`, `GoPill`, `healthMeta(h)` from `v_session_health`), an **action slot** in the header (`Edit session`), `RecordTabs` (Overview / Orders / Participants / Notes / Files / Feedback / History), and per-tab bodies. Health is correctly *suppressed once terminal* (`h !== 'Completed' && h !== 'Cancelled'`).

**What it is still missing to be 100% (the target for all records):**

| Element | SessionDetail today | Gap |
|---|---|---|
| Breadcrumb | Single back-link `‹ Calendar` | No trail (Calendar › Course › Session); no parent context. `RecordHeader.back` is one link, not a path. |
| Owner / due / next action in header | none (sessions have **no assignee** — ledger) | Header shows status+health but not *who owns the next step* or *by when* — fails design-test Q4/Q5. |
| Attention area | `GoNoGoPanel` + waitlist hint live **inside** Overview tab | Blockers should sit *above the tabs* (like `BlockerBar` on OrderDetail) so "what needs attention" is visible on every tab, not just Overview. |
| Right rail | none — everything is single-column inside tabs | No persistent rail (owner / next action / due / related / recent timeline). Ops action stack is buried at the bottom of Overview. |
| Primary vs secondary vs overflow | header has one ghost `Edit`; ops actions are a flat `toolbar` of equal-weight buttons inside Overview | No action hierarchy (primary / secondary ▾ / ⋯). |

### 15.2 The pattern (adopt as `RecordHeader` v2 + `RecordLayout`)

```
┌── BREADCRUMB ──────────────────────────────────────────────────────────────┐
│ Home › Orders › 176152681                                                   │
├── HEADER ──────────────────────────────────────────────────────────────────┤
│ <Title>  ·  <ID>                        [Primary]  [Secondary ▾]  [⋯]       │
│ <status pill> <health pill> · owner: Ana Cruz · due 14 Aug · ₱180,000       │
├── ATTENTION (only when non-empty) ─────────────────────────────────────────┤
│ ⛔ Paid, not yet endorsed · ⚠ No owner assigned    (from primaryFlag / blockers)│
├── SUMMARY (3–5 KeyVals) ───────────────────────────────────────────────────┤
│ [Stage] [Money: value/collected/outstanding] [Counts] [Dates] [Channel]    │
├── TABS ─────────────────────────────────────────┬── RIGHT RAIL ────────────┤
│ Overview | Children | Tasks | Files | Activity  │ Owner · next action      │
│ | Audit | Related                                │ Next owner · due · SLA   │
│  <tab body>                                       │ Related records          │
│                                                   │ Recent activity (3–5)    │
└───────────────────────────────────────────────────┴──────────────────────────┘
```

- **Breadcrumb**: extend `RecordHeader.back` from `{href,label}` to `crumbs: {href,label}[]`. Fixes the "no breadcrumbs" ledger item and the `/session/:id` orphan-highlight (a session's parent is its course/calendar).
- **Attention area**: reuse `BlockerBar` (already on OrderDetail) hoisted above the tab bar for *every* record. It renders `primaryFlag`/blockers for orders; extend to sessions (health `blockers[]`), and — once they get a health signal — inquiry/quote.
- **Right rail**: new `RecordRail` component: owner, next action, next owner, due/SLA countdown, related-record links, and the 3–5 most recent `mergeActivity` events (the full timeline stays in the Activity tab). Collapses under the body ≤1024px.
- **Action hierarchy**: `RecordHeader.actions` becomes `{primary, secondary[], overflow[]}` rendered as one solid button + a `Secondary ▾` + a `⋯` menu, instead of today's flat equal-weight `toolbar`.

### 15.3 Per-entity variation

| Entity | Status (header) | Health (header) | Second tab (children) | Attention feeds | Primary action | Verdict |
|---|---|---|---|---|---|---|
| **Inquiry** | pipeline stage (Received→…→Closed Won/Lost) | **NOT IMPLEMENTED** — no health signal (ledger). Add computed *aging* flag → "Awaiting feedback 6d". | Activity (leads have no children yet) | aging, unassigned | **Convert to order/quote** (carry company/course/pax) | NOT IMPLEMENTED — inquiry has no detail page at all. Build to this standard. |
| **Quote** | Draft→Sent→Accepted/Declined/Expired | **NOT IMPLEMENTED** — add derived flag: expiring-soon / expired (Expired now auto-fires nightly, so surface it). | Lines | expiring, discount>threshold | **Convert to order** | PARTIALLY — QuoteDetail exists, not on full standard, no health. |
| **Order** | `fulfillment_stage` + `payment_status` | `primaryFlag(o)` + `collectionState` (IMPLEMENTED) | Lines | `BlockerBar` (Paid-not-endorsed / unowned / no-feedback / stalled) | **Advance stage** (guarded by `fn_orders_stage_guard`) | PARTIALLY — long single scroll today; move to tabs (15.4). |
| **Client / Customer** | none (no lifecycle) — show owner badge | overdue AR badge (IMPLEMENTED as `Overdue ₱X`) | Orders | overdue balance | (context: new order for this client) | PARTIALLY — good 360 content, long scroll; move to tabs (15.5). |
| **Session** | `status` + `go_status` | `v_session_health` (IMPLEMENTED) | Orders / Participants | GoNoGo blockers (hoist above tabs) | ops action stack (Confirm / Close / Cancel) | ~80% — add rail + attention hoist + owner (needs assignee, ledger). |
| **Payment** | none — it is an event | derived: On-time / Late / Unmatched-ref | (n/a — lines are the order's) | unmatched SAP ref, overdue | **Confirm / Match** | NOT IMPLEMENTED as a record — payments live only inside `ReceivablePanel`; no page, and "refund" is a hard DELETE (ledger). A payment record page is a prerequisite for the refund/credit model. |
| **Participant** | Registered→Attended/No Show; result Pending/Pass/Fail | derived: missing-info / cert-overdue | (n/a) | attendance gap, cert pending | **Mark attendance / Issue cert** | NOT IMPLEMENTED as a standalone record — lives in `RosterPanel`. Standard applies if/when participants get their own route. |

**Consistency win:** OrderDetail + ClientDetail move onto the same `RecordHeader v2` + tabs + rail as SessionDetail. Once done, all seven read the same way and answer the five design-test questions in the same place.

### 15.4 OrderDetail redesign (PARTIALLY IMPLEMENTED → target)

Today (`OrderDetail.tsx`): `RecordHeader` + `BlockerBar` (good), then **one long single-column card** stacking a Fulfillment edit block, a 3-col KeyVal grid, then `RecordSection`s for Training lines, Accounts receivable, Files, Comments, Activity — all always rendered, no tabs. AR balance is buried below lines (baseline 02 §6 flagged this).

```
Home › Orders › 176152681
Acme Corp · 176152681                    [Advance → SAP Created] [Reassign ▾] [⋯]
New · Unpaid · ⛔ Paid, not endorsed · owner Ana Cruz · ₱180,000 · 12 Aug
── ATTENTION (BlockerBar, hoisted) ─────────────────────────────────────────
── SUMMARY: [Stage] [₱180k / ₱0 collected / ₱180k due] [3 lines · 24 seats] [Channel]
── TABS: Overview | Lines (3) | Receivable | Tasks | Files | Activity | Audit
   Overview  = summary + fulfillment edit block (stage/payment/SAP) + comments
   Lines     = the training-lines list + inline "Move to another session"
   Receivable= ReceivablePanel (promoted from buried section to its own tab)
── RAIL: owner · next action (advance) · due/SLA · client link · recent activity
```

Move the fulfillment editor and comments into Overview; `ReceivablePanel` gets its own tab (fixes buried-AR); Activity/Audit already exist via `mergeActivity`. Keep the optimistic-concurrency `updated_at` guard exactly as-is — it is good and must survive the refactor.

### 15.5 ClientDetail redesign (PARTIALLY IMPLEMENTED → target)

Today (`ClientDetail.tsx`): header with owner/overdue/archived badges (good) + Archive action (good), then **stacked always-on sections**: two KeyVal cards (summary band + contact band), Orders table, Sessions-booked table, Contacts, Files, Activity. Content is excellent (LTV, collected, outstanding, unique sessions derived from order history) but it is a long scroll.

```
Home › Customers › Acme Corp
Acme Corp · Manufacturing              [New order]  [Set organization ▾]  [Archive]
owner Ana Cruz · ⚠ Overdue ₱45,000
── SUMMARY band: Bookings 12 · Seats 96 · LTV ₱1.2M · Collected ₱1.1M · Outstanding ₱45k
── TABS: Overview | Orders (12) | Sessions (8) | Contacts | Files | Activity
   Overview = contact/org KeyVals + the 5-stat summary
── RAIL: owner · outstanding · overdue orders · org link · recent activity
```

Keep the derived spend/seats/outstanding logic and the soft-delete/org gating (`softDeleteReady`, `canSetOrg`) unchanged — only the layout changes.

---

## Part 25 — Tables as operational workspaces

### 25.1 Current state per table

| Capability | Orders | Worklist (Fulfillment) | Clients | Calendar-list |
|---|---|---|---|---|
| Columns | Order/date, Customer, Stage(+`primaryFlag`), SAP, Channel, Seats, Amount | ☑ select, Order, Customer, Stage(+flag), Age, Owner, Value, Next step | Company, Contact, Email, Phone, Owner | (see `Calendar.tsx`; `data-label`/`hide-m` mobile) |
| Sticky identifier col | ✅ `sticky-1` ≤1200px | ✅ `sticky-1` ≤1200px | ❌ | ❌ |
| Sticky header | ❌ | ❌ | ❌ | ❌ |
| Column sort | ❌ **missing** | ❌ **missing** | ✅ `useSort` (aria-sort) | ✅ |
| Filters | q (order#/SAP), stage, pay | who (mine/unassigned/all), stage(+counts), ORDER_VIEWS(+counts) | q only (company/name/email) | risk/status |
| Saved views | URL params (ephemeral) | URL params (ephemeral) + ORDER_VIEWS (hard-coded) | local `useState` q (not even URL) | — |
| Bulk | ❌ | ✅ select→advance / assign / claim | ❌ | — |
| Density | global `data-density=compact` token only | same | same | same |
| Export | ✅ current page only (labeled) | ❌ | ✅ CSV (sorted) | — |
| Pagination | ✅ server-paged, PAGE_SIZE 50 | client `rows.slice(0,250)` cap, no pager | client `.slice(0,300)` + muted note | — |
| Mobile | overflow + `sticky-1` | overflow + `sticky-1` | overflow | ✅ card/`data-label` |

### 25.2 Fixes (do not re-recommend what shipped)

- **Column sort on Orders + Worklist** — `Clients` already has the pattern (`useSort` + `aria-sort` + `indicator()`). Port it: Orders sort by date/amount/seats/stage (note: Orders is server-paged, so sort must go into `useOrdersPaged` order-by, not client-side); Worklist sort by age/`days_in_stage`/value/stage (client-side, already in memory). **NOT IMPLEMENTED.**
- **Sticky header** — add `thead th { position: sticky; top: 0 }` inside the scroll container for all four (only first *column* is pinned today via `sticky-1`). Cheap CSS, high value on long lists.
- **Saved views → server-persisted** — the biggest gap. Today ORDER_VIEWS is a hard-coded array and every filter is a URL param that dies on navigation. Add a `saved_view` table (owner, name, entity, filter-json, shared-bool) and a view chip-bar that reads/writes it. **NOT IMPLEMENTED** (still ephemeral, ledger).
- **Bulk beyond Worklist** — Orders needs bulk (assign, export selected, advance) using Worklist's selection engine (`selected: Set`, `toggle`, `toggleAll`, `selectedVisible`). Reuse it. **NOT IMPLEMENTED.**
- **Clients paging** — drop the 300-row `.slice` for server paging like Orders; add Owner/Org/Overdue facets. **NOT IMPLEMENTED.**
- **Worklist 250-cap nudge** — `rows.slice(0,250)` silently truncates; add a "refine filter to see the rest" note (Orders labels its export honestly — match that candor).
- **Export scope** — Orders export is honestly labeled "this page." Offer "export all matches" (server-side) once someone actually needs >50 rows.
- **Density** — the compact token exists globally; expose a per-table toggle in the toolbar so ops can compact the queue without changing the whole app.
- **Mobile** — Orders/Worklist/Clients still just overflow-scroll; adopt Calendar's `data-label`/`hide-m` card pattern (already in `globals.css` `@media(max-width:720px)`) so a phone shows stacked labelled cards, not a pinched grid.

### 25.3 Role-specific saved views to ship

Reuse `orderState.ts` predicates (`isOverdue`, `isPaidUnendorsed`, `isStalled`, `isNoFeedback`, `isUnowned`) and session health (`v_session_health`). Persist server-side (25.2).

| View | Definition | For | Drill target |
|---|---|---|---|
| My Open Work | mine, stage ≠ Cancelled/SAP Created | Sales | Orders?who=mine |
| Follow-ups Today | inquiries `expected_close ≤ today`, mine | Sales | Inquiries filtered |
| My Overdue Collections | mine + `isOverdue` | Sales | Orders view=overdue |
| Ready for Operations | stage = Endorsed to Ops | Coordinator | Worklist stage |
| Paid, Not Endorsed | `isPaidUnendorsed` | Coordinator/Ops | Worklist view=paid_unendorsed |
| Stalled >14d | `isStalled` (`days_in_stage>14`) | Coordinator | Worklist view=stalled |
| Unassigned Queue | `isUnowned` | Coordinator/Manager | Worklist who=unassigned |
| Sessions This Week | start ≤ 7d, Tentative/Confirmed | Operations | Calendar-list |
| Sessions At Risk | health ∈ {At Risk, Blocked} | Operations | Calendar-list risk-only |
| Certificates Pending | Completed sessions, certs unissued | Operations | Sessions filtered |
| Team Pipeline | region scope, all owners | Manager | Worklist who=all |
| Reps Over SLA | `v_sla_breach` grouped by owner | Manager | Worklist + Notify owners |

Coordinator/Manager are **NEEDS PRODUCT DECISION** roles (no real Coordinator or Sales-Manager role yet — `is_supervisor` boolean only). The views can ship against the four DB roles now and re-scope when the role model lands.

---

## Parts 26 & 27 — Forms and reduce manual entry

### 26.1 What Phases 1–4 already fixed (do not repeat)

- **Required markers + inline errors** — `SalesEntry` has `req-star` on Order number / Fee, `.field-error` gated on `tried`, `.invalid` styling.
- **SAP/reference format check** — non-blocking `^[A-Za-z0-9-]{3,30}$` warning (`orderIdWarn`).
- **Inline duplicate-client warning** — `usePossibleDuplicateClients(email)` renders a "may be a duplicate" notice with links before insert.
- **Date-range monotonic validation + editable per-session pax + restricted status picker** — SessionForm (ledger; both P0 bugs fixed).
- **Fee autofill** — `feeFor(course, modality)` fills the line amount on course/modality/session change, with catalog hint.
- **Waitlist detection** — `isWaitlisted(l)` downgrades over-cap lines and shows a notice.

### 26.2 Form-by-form review (remaining gaps)

**SalesEntry** — still the non-transactional 4-write saga (client → orders → order_line[] → order_assignment) with a compensating delete only on line failure. **NOT IMPLEMENTED:** single `fn_create_order` RPC. Placeholder header writes remain: `seats: 1`, `amount_php: 0`, `modality: good[0].modality` (meaningless on mixed-modality orders) — all derivable, all discarded (`total`, `totalSeats` computed then thrown away). No review/confirm step, no unsaved-change guard, quote lines not pre-filled on `?quote=` (only client + schedule are). Running total is present (`Create order · ₱total`) — good.

**SessionForm** — post-fix. Remaining: no online-meeting-link field, no `materials_ready`, no `special_requirements` (all three feed the session-health model, ledger). Keep the live double-booking check.

**Inquiries-create** — **NOT IMPLEMENTED:** no lookup-autofill for existing client (company/contact/email/phone re-typed even when the client exists); no dedup; stage moves have no confirm/reason except markLost; Closed Won dead-ends (won lead never linked to the order). Verify `Closed Lost` enum on live (**NEEDS TECHNICAL VALIDATION**).

**RosterPanel** — **NOT IMPLEMENTED:** no CSV/paste import (every attendee hand-keyed); participant remove is a HARD delete; no single-participant transfer/substitute/soft-cancel. Export exists; import is the single biggest manual-typing cost.

**QuoteDetail add-line** — autofills unit price (good), `DiscountHint` suggests-not-forces (good). Fix house-default modality drift (`Face-to-face` here vs `Live Online Training` in SalesEntry's `blankLine()`).

### 27.1 Retyped-data ledger → the fix

| Retyped today | Already lives in | Fix | Status |
|---|---|---|---|
| Customer name/company/email/phone (new client) | `client` (often another rep's — the `23505` path proves it) | Global client search + cross-rep "email exists" hint before insert | PARTIAL — inline dup warning shipped; no autofill/search-to-pick |
| Country / currency | `orders.country` (trigger-inherited from course) | Show read-only, never ask | NOT IMPLEMENTED (never captured — but never shown either) |
| Sales owner | `profile.sales_id` | Auto self-assign on create | IMPLEMENTED (`order_assignment` upsert, non-fatal) |
| Course code / name | `course` catalog | Course picker (dropdown) | IMPLEMENTED (`courses.data` select) |
| Line fee / price | `course_fee` | `feeFor()` autofill + catalog hint | IMPLEMENTED |
| Quote lines → order lines | `quote_line` | Pre-fill SalesEntry lines on `?quote=` | NOT IMPLEMENTED (only client+schedule prefill) |
| Won inquiry → order | `inquiry` | "Create order from lead" carrying company/course/pax | NOT IMPLEMENTED (no inquiry detail/convert) |
| Header seats / amount / modality | Σ lines | Compute in RPC, drop placeholders | NOT IMPLEMENTED (writes 1 / 0 / first-line) |
| Roster names | client delegate list / prior sessions | CSV/paste import | NOT IMPLEMENTED |
| Payment reference (SAP) | — (external) but re-keyed per order | Format check + dedup against existing | PARTIAL — format warning only, no dedup |
| Timestamps (order date) | `now()` | Default to today | IMPLEMENTED (`order_date` defaults to today) |
| Go/No-Go status | `booked` vs `min` | Read `go_status`, don't recompute | IMPLEMENTED server-side; UI reads it |

---

## Part 37 — Streamline every screen (one-row verdicts)

| Screen | Why it exists | Who | Primary task | Above-the-fold | Unnecessary / duplicated / missing | Verdict |
|---|---|---|---|---|---|---|
| Home | Landing + attention | all | orient | role KPI cards + 3 streams | 100% overlaps My Work + DataQuality | **fold-into My Work** (retire the overlap, ledger) |
| My Work | The one to-do surface | all | act on my work | tasks / approvals / at-risk / SLA | added additively over Home/Worklist | **keep** — make it the primary surface |
| Worklist (Fulfillment) | Order queue engine | ops/sales | claim/advance | who/stage/view filters, bulk, SLA banner | orders-only; overlaps My Work | **fold-into My Work** (keep the engine) |
| Orders | Order book | all | find/open order | server-paged table | no sort/bulk/facets/saved-views | **keep** + upgrade to workspace (25) |
| OrderDetail | One order | all | advance/collect | header+BlockerBar | long scroll, AR buried | **tab** (15.4) |
| SalesEntry | Create order | sales/admin | build order | customer/header/lines | non-transactional, retypes quote | **keep** + RPC + review step |
| Inquiries | Lead pipeline | sales | move stage | kanban + weighted | no detail page, no convert | **keep list** + build detail (drawer/record) |
| Quotations | Quote list | sales | build/convert | list | no health, print-only send | **keep** + detail to standard |
| Clients | Client book | all | find client | sortable table + attribution tab | 300-row cap, no facets, no paging | **keep** + workspace + **merge Organizations** (Customer 360, ledger) |
| ClientDetail | Customer 360 | all | see history | 5-stat band + tables | long scroll | **tab** (15.5) |
| Organizations | Org rollup | all | group clients | list | separate from Clients | **fold-into Customer 360** |
| Calendar | Schedule | ops | see/triage sessions | month grid + list | no week/day, no drawer | **keep** + week view + session drawer |
| SessionDetail | One session | ops/all | run/close | tabbed header+health | no rail, no owner, no breadcrumb | **keep** (reference) + rail |
| SessionForm | Create/edit session | ops | schedule | full form | good candidate for drawer | **drawer** off Calendar |
| Approvals | Decision queue | BO | decide | pending/history | no "what am I approving" impact | **fold-into My Work** approvals section |
| Dashboard | Org KPIs | BO/mgmt | scan health | 6 KPIs + 2 charts | one view all roles, 5 dead-end KPIs | **keep** + role-specific + drill-through |
| Reports | Analytics | BO/mgmt/ops | export | 6 tabs | no date-range control | **tab under Analytics** (consolidate) |
| Quality | NPS/complaints | BO/ops | monitor | NPS + trainers | overlaps Reports | **tab under Analytics** |
| DataQuality | Exception checks | ops/admin | fix data | 6 check tiles | 100% overlaps My Work | **fold-into My Work Exceptions** |
| Duplicates | Merge dupes | ops/admin | reconcile | candidate list + `fn_merge_orders` | standalone | **fold-into My Work Exceptions** |
| Courses / Pricing | Catalog + rules | admin/ops | edit fees | tables | two pricing surfaces, near-name-clash | **keep** under Admin, rename "Courses & fees" |
| Resources | Trainer/venue pool | ops | assign/load | tables | — | **keep** under Operations |
| Communications | Templates + log | admin | send/track | templates + log | config-grade | **keep** under Admin |
| AuditLog | Governance trail | admin | trace changes | filters + CSV | field-names only, no before/after | **keep** + value-level audit (ledger) |
| Admin | Users/roles | super_admin | change roles | role table | no invite/deactivate, no lookups console | **keep** + config console |

**Net IA moves (consistent with the ledger's future-state anchors):** Home + Worklist + DataQuality + Duplicates + Approvals → **My Work**; Clients + Organizations → **Customer 360**; Dashboard + Reports + Quality → **Analytics** (tabs). This *retires* redundancy rather than adding a surface.

---

## Part 40 — Responsive

Priority is the **1366×768 laptop** (the realistic office machine), then the phone for a handful of on-the-go tasks. Big screens are easy; the squeeze is 1366 and mobile.

### 40.1 Already shipped
`table.sticky-1` pins the first column ≤1200px on Worklist + Orders. "All amounts in PHP (₱)" labels present. Off-canvas sidebar + topbar + scrim + focus-trap ≤860px. `.grid → 1fr` collapse ≤860px. Calendar-list `data-label`/`hide-m` card pattern ≤720px. `prefers-reduced-motion` honored.

### 40.2 Breakpoint targets

| Surface | Large desktop (≥1440) | **1366 laptop (priority)** | Small laptop (~1180) | Tablet (~820) | Mobile (≤640) |
|---|---|---|---|---|---|
| Worklist/Orders | full table + rail | full table; `main` max-width 1320 fits; sticky-1 not yet triggered (>1200) | **sticky-1 kicks in ≤1200** — good; add sticky header | horizontal scroll — adopt `data-label` cards | stacked labelled cards; keep Order#, Customer, Stage+flag, next step; hide SAP/Channel |
| Tables (generic) | — | fit | first col pinned | scroll-x wrapper (present) | card mode (adopt Calendar pattern) |
| Forms (SalesEntry/SessionForm) | 2–3 col grids | 2-col grids fit | grids OK | grids → 1fr ≤860 (present) | single column; sticky submit bar with running total |
| Dashboard | 6 KPI + 2 charts | KPIs wrap (auto-fit minmax 200) | wrap to 2-up | 1–2 up | 1-up; charts get "View as table" toggle (shipped) |
| Calendar | month grid | month grid (min-width 760, scrolls) | grid | **list view** default | card list (`data-label`, shipped) |
| Record detail | body + rail side-by-side | body + rail (rail ~300px) | rail under body ≤1024 | single column, tabs scroll-x (`.tabbar` overflow shipped) | single column; attention area first; rail collapses to a summary block |
| My Work | multi-section + counts | fits | fits | sections stack | sections stack; collapse to counts + "view all →" |

### 40.3 Realistic mobile use cases (design *only* for these)

An ops/sales user on a phone is not building orders — they are: **(1) approvals** (BO taps Approve/Reject on a cancellation from My Work — needs the "what am I approving" impact context, ledger), **(2) search** (⌘K → open a record to read status), **(3) notifications** (the header bell + panel already goes `position:fixed; left/right:8px` ≤860px — good), **(4) calendar quick-look** (which sessions today, at-risk — card list), **(5) quick status update** (advance an order a stage, mark a session Confirmed, post a note). Everything heavy (roster entry, session form, multi-line order) stays desktop. Do not spend responsive effort making SalesEntry pleasant on a 375px screen — make the *five above* excellent and let the rest degrade to scroll.
