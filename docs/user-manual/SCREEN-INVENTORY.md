# Screen Inventory & Application Map — Academy Portal

> **Evidence:** **VERIFIED** from the App Router route files (`src/app/(app)/**/page.tsx`) and the screen components (`src/screens/*`). Every route is guarded by `<Guard roles=[…]>`; the DB RLS is authoritative regardless. Live interactive confirmation is **NOT TESTABLE** (auth-gated deployment, no credentials).

## Application shape

A single-page app. Every authenticated screen renders inside a **Shell** (left nav + top bar with a ⌘K command palette and a notification bell). Records open at their own routes; lists and creation forms are consolidated into a few **workspace shells** (CRM, Analytics, Team, Financial). Roles land on a role-specific **home** (`homePathForRole`): most → My Work, management → Overview, auditor → Audit.

---

## Screen map (module → screen → purpose → actions → roles → up/downstream)

### Work surfaces

| Screen | Route | Purpose | Key actions | Roles | Upstream → Downstream |
|---|---|---|---|---|---|
| **My Work** | `/my-work` | Single action list: tasks, approvals, orders/sessions needing attention, exceptions, duplicates | Mark task done; drill into any row | all working roles | ← everything → the record it links to |
| **Overview** | `/overview` | Management KPI landing (Dashboard embedded) | Drill-through tiles | management, super_admin | → Analytics / records |
| **Team** | `/team` | Sales-manager queue: Workload · Queue · Pipeline | Reassign/claim/advance (Queue), view load | sales_manager, super_admin | ← orders/inquiries |
| **Calendar** | `/calendar` | Scheduling command centre; Month/Week/Day/List | Open session drawer; **inline assign trainer/venue, confirm**; filter | super_admin, operations, business_owner, coordinator | ← courses → sessions → roster |
| **Search** | `/search` | Full-page global record search (`fn_global_search`) | Search → open record | all (nav: auditor) | → any record |

### Commerce (CRM)

| Screen | Route | Purpose | Key actions | Roles | Up → Down |
|---|---|---|---|---|---|
| **CRM** | `/crm` | Pipeline · Quotes · Orders tabs (one workspace) | New order/inquiry/quote; saved views (Needs fulfilment, Awaiting e-learning) | all except mgmt/auditor (tabs role-scoped) | inquiry → quote → order |
| **New order** | `/sales-entry` | Create a sales order (customer + lines) | Create order; add lines; convert from quote | super_admin, sales, coordinator | quote → **order** → endorsement |
| **Order detail** | `/orders/[id]` | One order: overview, lines, payments, files, comments, activity | Edit stage/SAP/payment; **endorse/accept/return**; record payment; move line | scoped by `fn_can_see_order` | order → session lines, AR, handoff |
| **Quote detail** | `/quotations/[id]` | Build a quote: header + lines, discounts | Edit status/valid-until/discount; add/remove lines; convert to order | sales, coordinator, super_admin | inquiry → **quote** → order |
| **Customers** | `/clients` | Customer list (Customers / Attribution tabs) | Search; open; export | all except (ops dropped from nav) | → customer 360 |
| **Customer 360** | `/clients/[id]` | One customer: overview, orders, contacts, files, activity, related accounts | New order; set/create org; add contact; archive | scoped | customer → orders/sessions/AR |
| **Organization** | `/organizations/[id]` | Parent account: members, attributes, files (off-nav) | Edit org; manage members | scoped | org → customers |

### Delivery (Operations)

| Screen | Route | Purpose | Key actions | Roles | Up → Down |
|---|---|---|---|---|---|
| **Session detail** | `/session/[id]` | One session: overview, orders, participants, files, activity | Confirm/close/cancel; **Go/No-Go**; forecast; roster | ops/super_admin write; others read | course → **session** → roster → certs |
| **New / edit session** | `/session/new`, `/session/[id]/edit` | Create/clone/edit a session | Course, learning type, dates (+ More: pax, fee, trainer, venue, status) | operations, super_admin | course → session |
| **Training catalogue (edit)** | `/courses` | Courses + fees; edit drawer | New/edit course; set fees; category/subcategory | super_admin, operations | category → subcategory → **course** → session |
| **Training (read-only)** | `/training` | Catalogue lookup (fees, types) | Browse | sales, ops, mgmt, coordinator, etc. | reference |
| **Trainers & venues** | `/resources` | Trainer pool + venues (Trainers / Venues tabs) | Add/edit trainer & venue; delivered counts | super_admin, operations, business_owner | → session assignment |

### Oversight & finance

| Screen | Route | Purpose | Key actions | Roles |
|---|---|---|---|---|
| **Analytics** | `/analytics` | One area: Overview · Revenue · Receivables · Certificates · Profitability · Pipeline · Quality · Data-quality (role-scoped tabs) | Read; export CSV; verify certificate | super_admin, operations, business_owner, management, auditor, sales_manager |
| **Financial** | `/financial` | Receivables + Revenue (Reports embedded) | Read; export | management, business_owner, operations, super_admin |
| **Approvals** | `/approvals` | Decide forecast sign-offs & cancellations | Approve/reject with note | business_owner, super_admin |
| **Complaints** | `/complaints` | Complaint records | Read/manage | super_admin, operations, business_owner, management |
| **Audit log** | `/audit` | Every change row | Read; search; export | super_admin, auditor |

### Exceptions (off-nav, surfaced via My Work / CRM saved views)

| Screen | Route | Purpose | Roles |
|---|---|---|---|
| **Fulfilment queue** | `/worklist` → `/crm?tab=orders&queue=fulfillment` | Advance/assign/bulk-act orders | ops/coordinator/super_admin (mgmt/auditor read) |
| **Duplicates** | `/duplicates` | Reconcile duplicate order pairs | super_admin, operations, coordinator |
| **E-learning** | `/elearning` → CRM saved view | Grant self-paced access | super_admin, operations, coordinator |

### Administration

| Screen | Route | Purpose | Roles |
|---|---|---|---|
| **Users & access** | `/admin` | Create users, assign roles, salesperson mapping | super_admin |
| **Pricing rules** | `/pricing` | Discount/pricing rules | super_admin, operations, business_owner |
| **Communications** | `/communications` | Message templates | super_admin, operations |
| **Annual rollover** | `/rollover` | Roll the training year (Rebuild/Copy) | super_admin, operations |

### Auth / entry

| Screen | Route | Purpose |
|---|---|---|
| **Login** | `/login` | Email + password (Supabase). "Accounts are created by the Super Admin." |
| **Root** | `/` | Redirects to the role's home |

### Retired → redirect (still reachable by old links)

`/dashboard`,`/reports`,`/quality`,`/data-quality` → `/analytics` · `/organizations` (list) → `/clients` · `/inquiries`,`/quotations` (list),`/orders` (list) → `/crm` · `/worklist` → CRM fulfilment view · `/elearning` → CRM e-learning view · `/course/new`,`/course/[id]/edit` → `/courses` · `/home`,`/operations-today` → `/my-work`.

---

## Core data model (upstream → downstream chain)

**VERIFIED** from the schema/migrations. This is the spine the manual is organised around:

```
Category ─▶ Subcategory ─▶ Course ─▶ (Course fee per learning type)
                                  │
                                  ▼
                               Session (schedule)  ◀─ Trainer, Venue
                                  │
Customer ─▶ Inquiry ─▶ Quote ─▶ Order ─▶ Order line ─▶ Session booking
   │                                 │
   │                                 ▼
   │                            Participant (roster) ─▶ Attendance ─▶ Assessment ─▶ Certificate
   │                                 │
   ▼                                 ▼
Contact / Organization          Invoice ─▶ Payment ─▶ (Refund / Void)
```

- A **Course** is the reusable template (title, category, learning types, fees). A **Session** is one scheduled *instance* of a course on specific dates with a trainer and venue. **This course↔session distinction is the single most important concept in the app** — see the manual §3.
- An **Order** is the commercial record (who bought what). Its **lines** each reference a **Session** (except E-learning lines, which have no session). Fulfilment, AR, and endorsement all hang off the order.
