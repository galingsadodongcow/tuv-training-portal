# Navigation, Information Architecture, My Work & Screen-by-Screen Review

> Part 2 of 5 — grounded in `src/lib/roles.ts`, `src/components/Shell.tsx`, `src/components/CommandPalette.tsx`, `src/lib/orderState.ts`, and the 30 screens in `src/screens/*`. Roles are the four DB roles; "Sales Manager" is `salesperson.is_supervisor` (read in `Worklist.tsx` `canAssignAny`, shown in `Shell.tsx` as a "· Supervisor" pill).

## 1. Navigation audit

The app navigates from **one flat `NAV` array of 23 items** (`roles.ts:23-47`), filtered per role by `Shell.tsx` (`NAV.filter(n => n.roles.includes(role))`). No groups, no sections, no collapse.

Visible-item counts per role: `super_admin` **23 (all)**; `operations` **17** (no Inquiries, New sales order, Duplicates, Data quality, Users, Audit); `business_owner` **13**; `sales` **11** (Home, Calendar, Orders, Fulfillment, Inquiries, Quotations, New sales order, Clients, Organizations, Duplicates, Dashboard).

**Problems:**
- **23 flat items is past the scannable limit** — no chunking; the sales lifecycle (`Inquiries → Quotations → New order → Orders → Fulfillment`) is scattered across non-adjacent positions.
- **Three names for one thing.** Nav "Fulfillment" → route `/worklist` → `<h1>Fulfillment</h1>`. "New sales order" (`/sales-entry`) is the only imperative/verb item among nouns. "Courses and pricing" (`/courses`) sits near "Pricing rules" (`/pricing`) — two pricing surfaces, near-identical names. "Feedback and quality" (`/quality`) vs "Data quality" (`/data-quality`) — unrelated but both say "quality." Admin/config items (Users, Trainers & venues, Annual rollover, E-learning access) are mixed inline with daily operational items.
- **Active-state orphans.** `active = pathname===path || startsWith(path+'/')` works for `/orders/:id`, `/clients/:id`, but **`/session/:id`** (a most-used screen) has **no nav parent** → nothing highlights when you open a session from Calendar. Same for `/sales-entry` and `/course/:id/edit`.
- **No mobile information scent** — the off-canvas drawer (correctly inert/focus-trapped/Escape) is still the same 23-item flat list; the only finder is the `⌘K` chip.
- **`⌘K` is the only cross-cutting finder and is invisible as a concept** — a small chip; nothing in the rail says "Search."

## 2. Recommended information architecture

Collapse **23 flat items into 8 top-level groups**; push record-scoped and settings surfaces off the rail. Target: sales see ~6 groups, super_admin ~8, never 23 loose links.

```
HOME
MY WORK                         (Home streams + Worklist/Fulfillment, unified)
SALES        ▸ Inquiries  ▸ Quotations  ▸ Orders   [+ New order = section button]
OPERATIONS   ▸ Calendar  ▸ Sessions (gives /session/:id a parent)
             ▸ Participants & Certificates  ▸ Resources (Trainers & Venues)
CUSTOMERS    ▸ Clients  ▸ Organizations
FINANCE      ▸ Receivables / Payments  ▸ Approvals
INSIGHTS     ▸ Dashboard  ▸ Reports  ▸ Quality (Feedback & NPS)
ADMIN        ▸ Users & Access ▸ Courses & Fees ▸ Pricing Rules ▸ Communications
             ▸ Data Quality ▸ Duplicates ▸ Annual Rollover ▸ Audit Log
```

- **Primary rail:** Home, My Work, and the group parents (expand to children only when the role has ≥1 child).
- **Inside-record (never a rail item):** SessionDetail, OrderDetail, ClientDetail, QuoteDetail, OrganizationDetail, CourseForm, SessionForm, the AR/Roster/Contacts/Attachments panels. This fixes the `/session` and `/sales-entry` orphan-highlight bugs — "Sessions" becomes the parent.
- **Settings/back-office (Admin group, collapsed):** Courses & Fees, Pricing Rules, Communications, Data Quality, Duplicates, Rollover, Users, Audit — today 8 of the 23 rail rows for super_admin.

**Per-module purpose · users · functions · related records:**

| Module | Purpose | Primary users | Key functions | Related |
|---|---|---|---|---|
| My Work | The one operational to-do surface | all | claim, advance, mark done, decide, drill | orders, sessions, tasks, approvals |
| Inquiries | Lead pipeline | sales, super_admin | create, move stage, mark lost, weighted pipeline | client, course, quote |
| Quotations | Formal quotes → order | sales, super_admin | build lines, discount hint, convert, print | client, course, order |
| Orders | Order book + fulfillment | all | filter, expand lines, open, export | client, session, invoice, payment |
| Calendar/Sessions | Schedule & each run | ops, all read | grid/list, Go/No-Go, close, cancel, forecast, roster, certs | order_line, trainer, venue, participant |
| Participants & Certs | Attendance + issuance | ops | mark attendance, issue/verify certs | session, participant |
| Resources | Trainer & venue pool + load | ops | add, assign, load, unstaffed | session |
| Clients / Orgs | Customer 360 + rollups | all | 360 view, LTV/AR, org grouping, archive | order, session, contact |
| Finance | Receivables, approvals | BO, ops, super_admin | AR aging, record payment, decide | order, invoice, schedule |
| Insights | Dashboards, reports, quality | BO, mgmt, ops | KPIs, exports, NPS, complaints | all |
| Admin | Config & governance | super_admin (+ops catalog) | roles, fees, rules, templates, audit | profiles, salesperson |

## 3. My Work — the unified operational center

Home already ships the seed (role KPI "Needs your attention" cards + a "My Work" heading with three live streams: *Tasks assigned to me*, *Unread notifications*, *Pending approvals*). Worklist already has the claim/advance/bulk engine + named `ORDER_VIEWS` (`orderState.ts`) + `useSlaBreaches`. **My Work merges these two screens** so a user stops bouncing between Home (what's mine) and Fulfillment (the queue). DataQuality's six checks and the Home attention-cards become "Exceptions" filters (same `isUnowned/isStalled/isOverdue` predicates).

**Sections (each collapsible, live count + "view all →"):** 1. Assigned tasks (inline *Mark done*). 2. Approvals to decide (gated). 3. Returned to me. 4. Overdue. 5. Due today / this week. 6. Follow-ups. 7. Orders awaiting processing (inline *Advance*/*Claim*). 8. Payment issues. 9. Sessions to prep (≤14 days). 10. Sessions at risk (`belowMin`). 11. Certificates pending. 12. Waiting on others. 13. Escalations (`useSlaBreaches` + *Notify owners*).

**Filters/sort/saved views:** scope toggle (Mine · My team · Unassigned · Everyone), sort (oldest-first default, due date, value, risk), server-persisted saved views, one-click open + inline action.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  My Work — Good day, Alan                          [Mine ▾][This week ▾] ⚙ │
│  8 need action · 3 overdue · ₱2.4M at risk        Saved: ▸My Open Work ★   │
├───────────────────────────────────────────────────────────────────────────┤
│  ▸ NEEDS ACTION (8)                                                        │
│  │ ⚠ Approve: Cancel "ISO 9001 LA" · 12 Aug  waiting 3d [Approve][Reject] │
│  │ ● Task: Endorse order 176152 to Ops       overdue 2d [Open][Done]      │
│  │ ● Order 176201 Paid, not endorsed         ₱180k      [Advance →]       │
│  ▸ ORDERS AWAITING PROCESSING (14)     [All work][Overdue 3][Stalled 5]   │
│  ▸ SESSIONS AT RISK (4)  ▸ CERTS PENDING (11)  ▸ WAITING ON OTHERS (6)    │
└───────────────────────────────────────────────────────────────────────────┘
```

## 4. Role-specific dashboards

Today `Dashboard.tsx` renders the **same 6 KPIs + 2 charts for every role** — never reads `profile.role`; only "Sessions at risk" drills through, the other five KPIs + both charts are dead ends. Each persona should get metrics → exceptions → actions, all drill-through:

- **Admin:** users pending role · duplicate candidates · records needing attention · failed comms → assign role / merge / notify SLA / open audit.
- **Order Coordinator (ops, order-facing):** awaiting endorsement · paid not endorsed · stalled >14d · no feedback → advance (bulk) / notify / open Fulfillment filtered.
- **Training Operations:** sessions below min · unstaffed ≤21d · running this week · certs to issue → assign trainer / go-decision / close session.
- **Business Owner / Management:** booked vs forecast % · delivered revenue · pipeline weighted · cancellation rate → decide / set forecast / open reports; charts + forecast-attainment gauge.
- **Sales User:** my open orders · my stalled · my weighted pipeline · my overdue collections → claim / advance / new order / move inquiry.
- **Sales Manager:** team pipeline · team booked · unassigned in region · reps over SLA → reassign (bulk) / notify / open team Worklist.
- **Auditor:** changes today · deletes this week · role changes · high-risk writes → filter / export / open record.

Every tile is a `<Link>` carrying the exact filter query (pattern already proven by Home attention-cards and DataQuality checks).

## 5. Global search (⌘K)

Today: `fn_global_search(p_q)`, 2-char min, 200ms debounce, role-filtered `KIND` map over order/client/session/organization/course/inquiry, grouped *Go to* + *Records*. Evolve:
- **Entity coverage:** add participant, trainer, salesperson, quote, invoice/payment-ref, certificate no.; search **email and phone** (today title/name only). Certificate number routes into the verify flow.
- **Matching:** partial + typo tolerance (`pg_trgm` similarity / prefix `:*`).
- **Grouping & preview:** group by kind with counts; a right-hand preview pane (status, owner, health) before committing.
- **Keyboard:** already good; add kind-scoping tokens (`o:176201`, `c:acme`, `cert:PH-…`).
- **Recents / favorites / saved searches:** none today — add recent (last ~8 opened) on empty query, pinned favorites, and saved views invocable from `⌘K`.

## 6. Screen-by-screen review (tight)

- **Home** — right above-fold (role cards + streams); overlaps Worklist/DataQuality → merge into My Work; keep the "empty until role resolves" guard.
- **Calendar** — grid/list + filters good; missing week/day view + trainer/venue swimlane; `/session/:id` opens with no active nav; move per-row "Course" edit link to SessionDetail.
- **Orders list** — server-paged/filtered good; missing owner/channel/date filters, sort, bulk, saved views; CSV exports current page only (correctly labeled).
- **OrderDetail** — **inconsistent: long single-column scroll, not tabbed** (unlike SessionDetail); good concurrency guard + BlockerBar + inline line-transfer; AR balance buried; redesign to the record standard.
- **Worklist/Fulfillment** — strong engine (who/stage/view filters, ORDER_VIEWS, bulk, SLA banner); orders-only → fold into My Work; missing column sort + persisted views.
- **Inquiries** — kanban + weighted pipeline good; **inquiry has no detail page** (can't hold activity/notes/files or convert in one click).
- **Quotations / QuoteDetail** — clean; good discount hint, terminal-status confirm; missing PDF/email send (only `window.print()`), activity tab, status/owner filters.
- **SalesEntry** — strong multi-line builder w/ seats-left + waitlist detection + fee autofill; missing review/confirm step, per-line discount hint, running total above fold.
- **Clients** — sortable/CSV but **caps at 300 rows** with only a muted note (needs server paging); missing owner/org/overdue facets.
- **ClientDetail** — excellent 360 content but **long scroll, not tabbed** — apply the record standard.
- **Organizations** — missing consolidated AR + cross-client sessions above fold.
- **Approvals** — pending/history + confirm-reason good; missing "what am I approving" impact context (bookings affected) → surface in My Work.
- **Courses** — in-place fee editing good; belongs in Admin group; rename to "Courses & fees."
- **PricingRules** — fine settings table; move to Admin; show which rules are live above fold.
- **Resources** — trainers/venues/load good; keep under Operations; add assign-trainer-from-unstaffed inline.
- **Communications** — templates + log; config-grade → Admin; missing per-message retry + delivery drill.
- **Dashboard** — one shared view, one working drill → make role-specific, every KPI drill-through.
- **Reports** — rich 6 tabs; missing date-range control + cross-tab period + "schedule/email report."
- **Quality** — NPS/trainers/complaints good; rename group-side to "Feedback."
- **DataQuality** — every tile drills (good) but **100% overlap** with Home cards + Worklist views → fold into My Work Exceptions.
- **Admin** — role change confirms + clears stale `sales_id` (correct); keep.
- **AuditLog** — good filters/CSV/deep-links; extend `linkFor` to quotes/invoices.
- **SessionDetail** — **the reference pattern** (tabbed, header badges, ops actions, forecast, P&L, GoNoGo); minor: make material-cost an explicit save.
- **SessionForm** — full form; good candidate for a right-side drawer off Calendar.

## 7. Recommended major screen redesigns (highest-impact 8)

**7.1 OrderDetail → record standard, tabbed** — header (title/ID/stage/payment/AR/owner + primary/secondary actions), summary cards, tabs (Overview | Lines | Receivable | Tasks | Documents | Activity | Audit), side panel (blockers/next step/client link).

**7.2 SessionDetail** (already close) — add a persistent right rail (fill bar, Go/No-Go, trainer/venue, days-out, ops action stack); promote P&L margin % to a header chip for BO/super_admin.

**7.3 Worklist → My Work** — retire `/worklist` label; keep the engine.

**7.4 Inquiries** — add a detail + convert flow (Overview/Activity/Files tabs, "Create quote"/"Create order" prefill); keep the kanban as the list view.

**7.5 Clients / Customer 360** — tabbed + server-paged; header (owner, overdue, archived) + summary band, tabs (Overview/Orders/Sessions/Contacts/Documents/Activity), side rail quick actions.

**7.6 Calendar** — add week view + a session drawer (edit in place, calendar stays visible).

**7.7 Reports** — global date-range + comparison across all 6 tabs; "Save this view"/"Export all."

**7.8 Home → My Work** — Home becomes My Work; the org Dashboard stays separate under Insights.

## 8. Record-detail page standard

One enterprise pattern for Inquiry, Quote, Order, Client, Organization, Session, Participant, Payment. SessionDetail implements ~80% of it; OrderDetail, ClientDetail, QuoteDetail, OrganizationDetail should conform.

```
┌── HEADER ───────────────────────────────────────────────────────────────┐
│ ‹ back  <Title> · <ID>          [Primary action] [Secondary ▾] [⋯]      │
│ <status pill> <health/collection pill> <owner>  <key facts: date, value>│
├── SUMMARY CARDS (3–5 KeyVals) ───────────────────────────────────────────┤
│ [Stage/Status] [Money: value/collected/outstanding] [Counts] [Dates]     │
├── TABS ──────────────────────────────────────────────────────────────────┤
│ Overview | Lines-or-Participants | Tasks | Activity | Documents | Audit   │
├───────────────────────────────────────────────┬─────────────────────────┤
│ TAB BODY                                        │ SIDE PANEL              │
│                                                 │ Blockers / next step    │
│                                                 │ Related records         │
│                                                 │ Quick actions           │
│                                                 │ Timeline (recent)       │
└─────────────────────────────────────────────────┴─────────────────────────┘
```

Header reuses `RecordHeader`; the second tab is the record's children (Lines/Participants/Orders); the side panel reuses `BlockerBar` + `ActivityTimeline`/`mergeActivity` (already shared across OrderDetail/SessionDetail/ClientDetail). Consistency win: OrderDetail and ClientDetail move from long-scroll to this tabbed frame, matching SessionDetail.

## 9. Table & list review

Shared issues across Orders/Worklist/Clients/Calendar-list/Reports: **no sticky header/first column**; **uneven sorting** (Clients/Calendar sort; Orders/Worklist don't); **ephemeral saved views** (URL params only); **bulk actions only in Worklist**; no compact density; mobile — Calendar uses `data-label`/`hide-m` (good), others just overflow (wrap in `.scroll-x`, adopt the Calendar label pattern).

Per table: **Orders** add Owner/Channel/date facets + `primaryFlag` filter, sticky header, column sort, row bulk. **Worklist** add column sort (age/value/stage), sticky header + sticky checkbox column, persist views, "refine filter" nudge at the 250 cap. **Clients** server paging + facets (Owner/Org/Overdue), drop the 300 cap. **Calendar list** sticky header + "risk only" toggle + trainer/venue columns. **Reports** sticky headers + per-column sort + global date range.

**Role-specific saved views (persist server-side; reuse `orderState.ts` predicates):**

| View | Definition | For |
|---|---|---|
| My Open Inquiries | open stages, mine | sales |
| Follow-ups Today | inquiries `expected_close ≤ today`, mine | sales |
| Orders Awaiting Payment | `payment_status ≠ Paid`, not cancelled | sales, ops |
| Ready for Operations | stage `Endorsed to Ops` | ops |
| Payment Exceptions | `isOverdue` + `isPaidUnendorsed` | ops, BO |
| Sessions This Week | start ≤ 7d, Tentative/Confirmed | ops |
| Sessions At Risk | `belowMin` | ops, BO |
| Incomplete Participants | roster missing attendance | ops |
| Certificates Pending | Completed sessions, certs unissued | ops |
| Overdue Work | tasks past `due_date` + `isStalled` | all |
| Returned Records | records bounced back | all |

### Cross-cutting themes
1. Group the 23-item flat rail into 8 modules; move record/settings surfaces off the rail (fixes the orphan-highlight bugs).
2. Unify Home + Worklist + DataQuality into "My Work" (all three compute the same exception predicates).
3. Standardize record pages on the SessionDetail tabbed pattern (OrderDetail and ClientDetail are the outliers).
4. Make Dashboard role-specific and every KPI drill-through.
5. Persist saved views over the ephemeral URL-param filters.
6. Extend `⌘K` to email/phone/participant/trainer/cert coverage with typo tolerance, preview, recents/favorites.
