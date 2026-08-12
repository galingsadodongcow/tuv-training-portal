# Information Architecture — Second Pass

> Covers Parts 12, 13, 14, 48. Grounded in the *current* code: `src/lib/roles.ts` (grouped `NAV`), `src/components/Shell.tsx` (renders section headers), `src/components/CommandPalette.tsx` (`fn_global_search`), and the screens `Home.tsx`, `MyWork.tsx`, `Worklist.tsx`, `DataQuality.tsx`, `Dashboard.tsx`. Baseline: `docs/qa/ux-review/02-ia-navigation-my-work-screens.md` (first pass, when the rail was 23 flat items).
>
> **What changed since first pass:** the flat rail is gone — `roles.ts` now carries `NavItem.group` and ships **Home · My Work · Sales · Operations · Customers · Oversight · Insights · Admin**. `MyWork.tsx` + `/my-work` exist. `⌘K` still searches title/name only. The first-pass recommendation "group the rail / add My Work" is **IMPLEMENTED** — this pass critiques *how* it was done and finishes the consolidation it left half-done.

---

## Part 12 — Critique of the shipped grouped nav

The grouping is a real improvement over 23 loose links, but it was drawn around **screens that already existed**, not around the jobs people do. Several groups are thin, one is mislabeled, and the lead pair (Home + My Work) is a redundancy the grouping itself introduced.

### 12.1 The eight groups, as shipped (`roles.ts:25-56`)

| Group | Items | Verdict |
|---|---|---|
| *(top, no group)* | Home, My Work | **Two operating surfaces where there should be one.** See Part 13.1. |
| Sales | Inquiries, Quotations, New sales order, Orders, **Fulfillment**, Duplicates | Mixed altitudes: a lead pipeline, a verb action, an order book, an ops queue, and a data-hygiene tool all under one label. **Fulfillment is an ops queue, not Sales.** Duplicates is data hygiene. |
| Operations | Calendar, Trainers and venues, E-learning access, Annual rollover | Calendar is daily; the other three are config/annual. Rollover fires once a year. |
| Customers | Clients, Organizations | Two screens for one concept (Part 13.4). |
| Oversight | Approvals (only) | **A group of one.** A section header for a single row is noise. |
| Insights | Dashboard, Reports, Feedback and quality | Three analytics screens that should be one screen with tabs (Part 13.3). |
| Admin | Courses and pricing, Pricing rules, Communications, Data quality, Users and access, Audit log | Two pricing surfaces adjacent again; **Data quality** buried here while `MyWork` computes the same exceptions. |

### 12.2 Naming

| Nav label | Route | `<h1>` | Problem |
|---|---|---|---|
| Fulfillment | `/worklist` | `Fulfillment` | Route name (`worklist`) ≠ label ≠ concept. Still an ops queue sitting under **Sales**. |
| New sales order | `/sales-entry` | — | Only imperative item in a list of nouns; belongs as a **section [+ New order] button**, not a rail row. |
| Courses and pricing | `/courses` | — | Adjacent to **Pricing rules** (`/pricing`). Two "pricing" surfaces, near-identical names — unchanged from first pass. |
| Feedback and quality | `/quality` | — | Collides with **Data quality** (`/data-quality`). Two unrelated "quality" items — unchanged from first pass. |
| Data quality | `/data-quality` | `Data quality` | Reads as a governance report; it is an **exceptions dashboard** (`DataQuality.tsx` is six drill-through tiles over `isUnowned/isStalled/isOverdue` — the exact predicates `MyWork.tsx` uses). |

### 12.3 Order & altitude

Daily-driver screens and once-a-year/config screens sit in the same visual weight. **Annual rollover** (fired at year-end), **E-learning access**, **Communications** (templates), and **Courses/Pricing** (catalog config) are all one tap from the same rail as **Calendar** and **Orders**. The rail should separate *do-the-work-today* from *set-up-the-system*.

### 12.4 Role visibility

`Shell.tsx:133` only prints a group header when the role actually has an item under it, so empty groups don't render — that part is correct. But the role slices reveal gaps that are **NEEDS PRODUCT DECISION**, not nav bugs:

- **Operations cannot see Inquiries or New sales order** (`roles.ts:29,31` gate them `['super_admin','sales']`). Ops is locked out of intake — carried forward from the ledger, still open.
- **Duplicates** shows for `['super_admin','sales']` but the merge RPC (`fn_merge_orders`) is `ops/super_admin`. A sales user sees the queue but can't act — visibility ≠ capability mismatch.
- **`is_supervisor`** (the de-facto Sales Manager) changes RLS scope and `canAssignAny` but gets **no distinct nav** — a manager sees the identical rail to a rep. No team view exists in the IA.

### 12.5 Depth, breadcrumbs, orphans

- The nav is **one level** — group header + flat children, no expand/collapse, no nesting. Fine for the volume, but it means record pages have **no parent**: `/session/:id`, `/orders/:id`, `/clients/:id`, `/sales-entry` don't live in `NAV`, so `Shell.tsx:132` (`pathname===n.path || startsWith(n.path+'/')`) highlights **nothing** when you open a session from Calendar. First-pass orphan-highlight finding — **NOT IMPLEMENTED**.
- **No breadcrumbs anywhere.** With record pages orphaned from the rail, a breadcrumb (`Operations › Sessions › ISO 9001 LA · 12 Aug`) is the only way to answer "where am I / how do I get back to the list." **NOT IMPLEMENTED.**

### 12.6 Recents / favorites / saved views / mobile / ⌘K

| Concern | State | Note |
|---|---|---|
| Recents / favorites | **NOT IMPLEMENTED** | No recently-viewed, no pinning. Every return trip goes through the list or `⌘K`. |
| Saved views | **NOT IMPLEMENTED** (persisted) | Filters are ephemeral URL params (`Worklist.tsx:49` `setParam`). Nothing server-persisted; a rep re-picks their filter every visit. |
| Mobile nav | **PARTIALLY** | `Shell.tsx` off-canvas drawer is correctly inert + focus-trapped + Escape-closable, but it's the same grouped list; no bottom-tab quick access to the 3-4 daily destinations. |
| ⌘K discoverability | **PARTIALLY** | A `⌘K` chip exists in the topbar (`Shell.tsx:106`) with an aria-label — but nothing in the rail says "Search," and the palette is the *only* cross-cutting finder. |

### 12.7 Verdict

The grouping is **directionally right but should not be preserved as-is.** Fix in Part 48: retire Home into My Work; move Fulfillment and Duplicates out of Sales; collapse Oversight-of-one; merge the three Insights screens; split daily Operations from annual/config; separate an Administration bucket cleanly; give record pages a parent so highlighting and breadcrumbs work.

---

## Part 13 — Screen consolidation

The **second-pass fact**: `MyWork.tsx` was added **additively** — Home, Worklist, and DataQuality were never retired. The portal now has **four screens computing the same exception predicates** over the same `useFulfillmentQueue` data. This is redundancy that *grew* in Phase 2, not shrank.

### 13.1 Home vs My Work — the new overlap (**merge; retire Home**)

They are near-duplicates built from overlapping hooks:

| | `Home.tsx` | `MyWork.tsx` |
|---|---|---|
| Tasks assigned to me | ✅ `useMyTasks` + Mark done | ✅ `useMyTasks` + Mark done (identical table) |
| Pending approvals | ✅ gated `canDecide` | ✅ gated `canDecide` (identical) |
| Orders needing attention | KPI cards → `/worklist?...` | ✅ inline rows, self-scoped, `primaryFlag` sorted |
| Sessions needing attention | `belowMin` count card | ✅ `v_session_health` + `healthNeedsAction` rows |
| SLA breaches | — | ✅ `useSlaBreaches` |
| Notifications | ✅ inline stream | — (lives in `NotificationCenter` bell) |
| Role KPI cards | ✅ `cardsByRole` (4 roles) | — |

`MyWork` is strictly the richer surface (real health, SLA, self-scoping). `Home` duplicates its tasks/approvals streams verbatim and adds a notifications stream that **already has a home** in the header bell (`NotificationCenter.tsx`). **Recommendation:** fold Home's role KPI cards (`cardsByRole`) in as My Work's top "attention band," drop Home's redundant notifications stream (bell owns it), and **retire `/home`**. My Work becomes the single landing surface. Detailed design in `07-my-work-and-dashboards.md`.

### 13.2 Orders vs Worklist (**keep both; re-scope and rename**)

Not a merge — they answer different questions:
- **Orders** (`/orders`) = the **order book** (browse/search/export all orders, the reference list).
- **Worklist** (`/worklist`, `<h1>Fulfillment</h1>`) = the **action queue** (claim/advance/bulk/SLA — `Worklist.tsx` is the strong engine).

The problem is placement and naming, not existence. Worklist's *queue* belongs to **My Work** (a user's actionable orders already render there). Keep Worklist as the **team/everyone fulfillment board** for ops/managers, move it under **Training Operations / Orders**, and settle one name (route `/worklist`, label "Fulfillment," `<h1>` "Fulfillment" — align all three). Orders stays as the browse surface.

### 13.3 Dashboard vs Reports vs Quality (**merge into one Analytics screen with tabs**)

Three separate rail rows (`Insights` group) for one analytical destination. `Dashboard.tsx` is a single shared KPI view; Reports is six tabs; Quality is NPS/complaints. **Recommendation:** one **Analytics** screen, tabs = **Overview (role dashboard) · Reports · Feedback & Quality**, one global date-range control across tabs (first-pass gap, still open). Role-specific dashboard design is in `07-my-work-and-dashboards.md`.

### 13.4 Clients vs Organizations (**merge into Customer 360**)

Two rail rows under **Customers** for one concept. A client belongs to an organization; splitting them forces the user to hold the relationship in their head. **Recommendation:** one **Customers** surface — Organizations become a grouping/filter and a tab within the customer record, not a sibling screen. *Caveat (NEEDS TECHNICAL VALIDATION / DEFERRED):* the ledger notes inquiries have no `client_id` and Client/Organization/Inquiry are unlinked at the DB level, so true 360 needs the schema work first. The **nav merge** can ship ahead of the data merge.

### 13.5 DataQuality vs Duplicates (**fold both into My Work "Exceptions"**)

`DataQuality.tsx` is six drill-through tiles (`Orders without an owner`, `Stalled`, `Overdue`, `Sessions below minimum`, `Unstaffed`, `Duplicate candidates`) computed from `isUnowned/isStalled/isOverdue` + `useDuplicates` — **the same predicates `MyWork.tsx` already runs**. Duplicates is one of those six tiles promoted to its own screen. **Recommendation:** retire `/data-quality` as a standalone; surface its checks as an **"Exceptions" section/filter inside My Work** (org-wide scope for super_admin/ops). Keep `/duplicates` as the **worktable** the Exceptions "Duplicate candidates" tile drills into (it hosts the real `fn_merge_orders` keep/cancel chooser — that's an action surface, not a dashboard).

### 13.6 Consolidation summary

| Screen | Action | Becomes |
|---|---|---|
| `Home` | **Retire** | Absorbed into My Work (KPI band) |
| `MyWork` | **Promote** | Primary operating surface |
| `Worklist` | Keep, re-scope | Team Fulfillment board under Ops/Orders |
| `Dashboard` | Merge | Analytics › Overview (role-specific) |
| `Reports` | Merge | Analytics › Reports |
| `Quality` | Merge | Analytics › Feedback & Quality |
| `Clients` + `Organizations` | Merge | Customers (Customer 360) |
| `DataQuality` | Retire as screen | My Work › Exceptions |
| `Duplicates` | Keep | Exceptions drill-target / merge worktable |

Net: **~31 screens → ~25 rail destinations**, and the four overlapping exception surfaces collapse to one.

---

## Part 14 — Global search (⌘K)

### 14.1 What it does today

`CommandPalette.tsx`: 2-char minimum, 200ms debounce, calls `supabase.rpc('fn_global_search', { p_q })`, role-filters results against a `KIND` map (`order/client/session/organization/course/inquiry`), and renders two groups — **Go to** (nav) + **Records**. The RPC matches **title/name only**. Keyboard handling (↑/↓/Enter/Esc, Tab-trap), a11y (`role=combobox`/`listbox`/`option`, `aria-activedescendant`), and focus restore are all solid — the *interaction* is good; the *coverage* is thin.

### 14.2 Realistic employee searches — what fails today

Grounding against the six `KIND` entries and a title/name-only RPC:

| A user types… | Intent | Works now? | Gap |
|---|---|---|---|
| `Acme` | Find the customer | ✅ (client name) | — |
| `maria@acme.ph` | Find contact by **email** | ❌ | Email not indexed |
| `0917…` | Find by **phone** | ❌ | Phone not indexed |
| `176201` | Open an **order by ID** | ⚠️ only if numeric ID is in `title` | No ID-scoped match |
| `Q-2026-0142` | Open a **quote by ID** | ❌ | Quote not in `KIND` at all |
| `Juan Dela Cruz` | Find a **participant** | ❌ | Participant not searchable |
| `Reyes` (trainer) | Find a **trainer** | ❌ | Trainer/salesperson not in `KIND` |
| SAP `4500123` / payment ref | Find by **SAP / payment ref** | ❌ | Not indexed |
| `PH-2026-0087` | Verify a **certificate no.** | ❌ | Certificate not searchable |
| `ISO 9001 LA` | Find a **session/course** | ✅ | — |

**Six of ten realistic lookups fail.** The palette is a course/client/session finder, not an employee's global search.

### 14.3 Recommendations (NOT IMPLEMENTED)

- **Entity coverage:** add `participant`, `trainer`/`salesperson`, `quote`, `invoice`/`payment` (by ref), `certificate` (by number → routes to verify flow). Extend `fn_global_search` and the `KIND` map together, keeping the existing role-filter (`KIND[r.kind].roles.includes(role)`).
- **Field coverage:** index **email and phone** on client/participant/trainer; index **order/quote/SAP/payment/cert IDs** so a raw ID jumps straight to the record.
- **Partial + typo tolerance:** `pg_trgm` similarity + prefix (`:*`) matching so `Reys` finds `Reyes` and `Acme Corp` matches on `Acme`.
- **Grouped results with counts:** group by kind (`Orders (3) · Clients (2) · Participants (5)`) rather than the current flat *Records* bucket.
- **Kind-scoping tokens:** `o:176201`, `c:acme`, `cert:PH-2026-0087`, `p:juan` to disambiguate at the source (cheap parse in `CommandPalette`, narrows the RPC).
- **Preview before commit:** a right-hand preview (status · owner · health) on the active row so the user confirms before navigating — reuses `primaryFlag` / `v_session_health` renders already in the app.
- **Recents / favorites / saved searches:** on empty query, show the last ~8 opened records; allow pinning; make saved views (Part 48) invocable from `⌘K`.
- **Role-permission consistency:** the RPC must apply the *same* RLS the record page does, so search never surfaces a row the user can't open. Today the client-side `KIND.roles` filter is a UI gate over RPC output — verify the RPC itself is `security_invoker`/RLS-respecting so it can't leak titles across sales reps. **NEEDS TECHNICAL VALIDATION.**

---

## Part 48 — Future information architecture

Design principle (future-state anchor): **navigate by the employee's workflow, not by DB entity.** No top-level item per table. Nine primary areas, each with a purpose, its owning roles, key functions, and the entities it touches.

### 48.1 Primary rail

```
MY WORK            ← lands here; absorbs Home; per-user action surface + Exceptions
─────────────────  daily work
SALES              ▸ Inquiries  ▸ Quotations   [+ New order]
CUSTOMERS          (Customer 360 — Clients + Organizations merged)
ORDERS             (order book; browse/search/export)
TRAINING OPS       ▸ Fulfillment (team queue)  ▸ Sessions  ▸ Participants & Certs  ▸ Resources
CALENDAR           (schedule grid/week/day; session drawer)
FINANCE / PAYMENTS ▸ Receivables/AR  ▸ Payments  ▸ Approvals
ANALYTICS          ▸ Overview (role dashboard)  ▸ Reports  ▸ Feedback & Quality
─────────────────  set-up-the-system (collapsed)
ADMINISTRATION     ▸ Users & Access  ▸ Courses & Fees  ▸ Pricing Rules
                   ▸ Communications  ▸ Annual Rollover  ▸ Audit Log
```

- **Record pages get a parent.** Sessions (under Training Ops) parents `/session/:id`; Orders parents `/orders/:id`; Customers parents `/clients/:id` — fixing the orphan-highlight bug and enabling breadcrumbs (`Training Ops › Sessions › <title>`).
- **`[+ New order]`** is a section action button, not a rail row — retires the lone imperative item.
- **Exceptions** (ex-DataQuality) and **Duplicates** live inside My Work, not on the rail.

### 48.2 Area reference

| Area | Purpose | Primary roles | Key functions | Related entities |
|---|---|---|---|---|
| **My Work** | Everything waiting on *me*; the operating surface | all (role-shaped) | claim, advance, mark done, decide, drill; **Exceptions** for ops/admin | task, order, schedule, approval, sla_breach |
| **Sales** | Lead → quote → order intake | Sales, Sales Manager, Marketing/Order Coordinator, super_admin | move inquiry stage, weighted pipeline, build quote, convert to order | inquiry, quote, quote_line, client, course |
| **Customers** | Customer 360 (Clients + Orgs merged) | all | 360 view, LTV/AR rollup, org grouping, contacts, archive | client, organization, contact, order, schedule |
| **Orders** | The order book (reference list) | all | filter, expand lines, open, export | orders, order_line, invoice, payment |
| **Training Ops** | Deliver the sessions | Training Operations, super_admin | Fulfillment queue (claim/advance/bulk/SLA), session prep, attendance, cert issue, trainer/venue load | schedule, order_line, participant, certificate, trainer, venue |
| **Calendar** | See & schedule sessions | Ops, all (read) | month/week/day, Go/No-Go, session drawer, forecast | schedule, course, trainer, venue |
| **Finance / Payments** | Money in + approvals | Business Owner, Ops, super_admin | AR aging, record payment, refund/credit (deferred), decide approvals | invoice, payment, order, approval, schedule |
| **Analytics** | Read the business | Management, Business Owner, Ops, Sales Manager | role dashboard (Overview), reports w/ date range, NPS/complaints | all (read) |
| **Administration** | Configure & govern | super_admin (+ Ops catalog), Auditor (read) | users/roles, courses & fees, pricing rules, comms templates, rollover, audit | profile, salesperson, course, pricing_rule, template, audit_log |

### 48.3 Role-specific rail (future role model)

The target 8-role model (ledger) doesn't exist yet — only four DB roles + `is_supervisor`. Mapping the areas to the intended jobs (**NEEDS PRODUCT DECISION + DB work**):

| Role (target) | Sees | Notably hidden |
|---|---|---|
| **System Administrator** | all + Administration | — |
| **Marketing/Order Coordinator** | My Work, Sales, Customers, Orders, Calendar | Finance approvals, Administration |
| **Training Operations** | My Work, Training Ops, Calendar, Orders (read), Customers (read) | Sales intake, Finance approvals, Administration |
| **Business Owner** (approver) | My Work (approvals), Finance, Analytics, Orders, Customers | Administration (except read) |
| **Sales User** | My Work (self), Sales, Customers, Orders, Calendar (read) | Training Ops queue, Finance, Administration |
| **Sales Manager** (real team role) | Sales User rail **+ team scope** across My Work/Analytics | Administration |
| **Read-only Management** | My Work (exceptions read), Analytics, Orders (read) | all writes |
| **Auditor/Compliance** | Analytics (read), **Audit Log**, records (read) | all writes, never super_admin |

Least-privilege: Auditor and Management are **read-only** and never inherit super_admin — closing the current gap where auditor == super_admin.

### 48.4 What ships when

- **Nav-only, ship now (no schema):** retire Home; move Fulfillment→Training Ops and Duplicates→My Work Exceptions; collapse Oversight; merge Insights→Analytics tabs; merge Customers rail; add breadcrumbs + record-page parents; align the Fulfillment naming triple.
- **Needs product decision + DB:** the 8-role model, Sales Manager as a real role, ops-in-intake, true Customer 360 (`client_id` on inquiry).
- **Needs the search work:** ⌘K entity/field coverage + typo tolerance + preview + recents (Part 14).
