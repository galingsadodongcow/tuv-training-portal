# 01 — Screen inventory

Every user-facing surface on `main` today, with the metrics that drive the simplification calls. Frequency: DAILY / WEEKLY / OCCASIONAL / RARE / ADMIN.

## Routes (34 pages) + nav

**21 nav items** in 6 groups (`src/lib/roles.ts`): lead = My Work, Calendar; then **CRM** (Inquiries, Quotations, New order, Orders) · **Customers** (Customers, Organizations) · **Operations** (Operations today, Fulfillment, Trainers & venues, Duplicates, E-learning) · **Oversight** (Approvals, Analytics) · **Admin** (Courses & pricing, Pricing rules, Communications, Annual rollover, Data quality, Users & access, Audit log).

## Operations & shared records

| Screen | Route | Freq | Key metrics | Overlap | Rec |
|---|---|---|---|---|---|
| **My Work** | /my-work | DAILY | 5 action queues, 0 KPI tiles | mirrored by Dashboard / Worklist / Approvals | **KEEP** (canonical queue) |
| **Calendar** | /calendar | DAILY | 4 views (Month/Week/Day/List), 7 filter controls, 10 list columns, drawer = 6 actions | Day/List ↔ Operations today | **KEEP + simplify** |
| **Session detail** | /session/[id] | DAILY | 6 tabs, 6 header badges, status row = 7 buttons | Orders tab ↔ OrderDetail; Participants ↔ RosterPanel | **KEEP + trim tabs** |
| **Session create/edit** | /session/new,/edit | OCCASIONAL | 11 fields, 2 required, 8 folded | trainer/venue ↔ Calendar drawer | **KEEP** (already lean) |
| **Operations today** | /operations-today | DAILY | 7 read-only sections, 0 own actions | **all 7** re-present Calendar/Orders/Session/Roster/E-learning/Approvals | **RETIRE** |
| **Courses** | /courses | OCCASIONAL | 6 cols, inline fee grid | fee edit ↔ CourseForm | **MERGE → Training Catalogue** |
| **Course form** | /course/new,/edit | OCCASIONAL | ~11 fields + 3 modality rows; 4 advanced | — | **SIMPLIFY** (progressive) |
| **Resources** | /resources | OCCASIONAL | Trainers+Venues+Load = 3 tabs; list+modal | Load tab ↔ Trainers cols | **KEEP** (drop Load tab) |
| **Duplicates** | /duplicates | RARE | 4 cols, 3 actions/row | ↔ Operations-today "E-learning/dupes" | **MOVE → My Work exception** |
| **E-learning access** | /elearning | OCCASIONAL | 2 tables, 1 action/row | ↔ Operations-today section | **MOVE → Orders saved view** |

## Sales / CRM

| Screen | Route | Freq | Key metrics | Overlap | Rec |
|---|---|---|---|---|---|
| **Inquiries** | /inquiries | DAILY | Kanban only (6 stages), 11-field create (4+7), inline edit | value ↔ Dashboard/Reports | **KEEP + add table view** |
| **Quotations** | /quotations | WEEKLY | 6 cols, 2–3 create fields | health ↔ Inquiries | **MERGE → CRM** |
| **Quote detail** | /quotations/[id] | WEEKLY | 2 sections, 4-field add-line | — | **KEEP** |
| **New order** | /sales-entry | DAILY | 3 sections, ~12 fields, prefill from quote/client/schedule | dup-check ↔ Duplicates | **KEEP** (reach from CRM/customer) |
| **Orders** | /orders | DAILY | 7 cols, 3 filters | Lines ↔ OrderDetail; ↔ Fulfillment | **KEEP** (system of record) |
| **Order detail** | /orders/[id] | DAILY | 6 tabs, 6 badges, BlockerBar | Lines ↔ Orders expand; stalled ↔ Ops-today | **KEEP + trim tabs** |
| **Fulfillment** | /worklist | DAILY | advance + assign, bulk | ↔ Orders + My Work | **CONVERT → Orders saved view** |
| **Customers** | /clients | WEEKLY | 5 cols, 2 tabs (Clients/Attribution) | **HEAVY ↔ Organizations** | **KEEP** (= Customer 360 entry) |
| **Customer 360** | /clients/[id] | OCCASIONAL | 6 tabs, 5 KPIs, 4 panels | Orders/Sessions/Activity dup other screens | **KEEP + absorb Org** |
| **Organizations** | /organizations | RARE | table + create | **VERY HIGH ↔ Customers** | **MERGE → Customer 360 / Admin** |
| **Organization detail** | /organizations/[id] | RARE | edit + contacts + files | ↔ Customer 360 | **MERGE** |

## Oversight / analytics / admin

| Screen | Route | Freq | Purpose | Overlap | Rec |
|---|---|---|---|---|---|
| **Approvals** | /approvals | OCCASIONAL | forecast + cancellation decisions | ↔ My Work "Approvals" | **CONVERT → My Work queue + drawer** |
| **Analytics (Dashboard)** | /dashboard | DAILY | per-role KPI cards + exec charts | cards restate Worklist/DataQuality/Reports | **MERGE → one Analytics** |
| **Reports** | /reports | WEEKLY | 6 tabs (digest/revenue/AR/certs/profit/analytics) | Digest ↔ My Work; AR ↔ Customer 360 | **MERGE → one Analytics** |
| **Quality** | /quality | OCCASIONAL | 3 tabs (NPS/trainers/complaints) | trainers ↔ Resources load | **MERGE → Analytics (+ complaints as record)** |
| **Data quality** | /data-quality | OCCASIONAL | 6 check tiles | **near-total dup** of Dashboard/My Work | **RETIRE → My Work exceptions / Admin** |
| **Courses & pricing / Pricing rules / Communications / Annual rollover / Users & access / Audit log** | various | RARE/ADMIN | config + governance | — | **MOVE → Admin group** |

## Cross-cutting duplication (the headline)
- **One read-only aggregator** (Operations today) + **four analytics screens** re-present the same handful of hooks (`fulfillmentQueue`, `sessionHealth`, `unstaffed`, `duplicates`, `sla`). That's the single biggest source of "too many screens."
- **Transfer participant** exists in 3 UIs (RosterPanel, Session Orders tab, Order Lines tab).
- **Two customer books** (Customers + Organizations).
- **19+ status/health vocabularies** with 14 reused pill classes (see `07`).
