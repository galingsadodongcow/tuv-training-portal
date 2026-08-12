# Role × Function Permission Matrix — Academy Portal

> **Evidence:** roles are **VERIFIED** from the live `user_role` enum and `src/lib/roles.ts`. Permissions reflect **database Row-Level Security (RLS), which is authoritative** — the UI only hides controls, it never grants access. Cells are sourced from `docs/implementation/role-crud-matrix.md` (the team's live per-role RLS simulation, 8-role model), the RLS migrations, and the UI role-gates in the screens. Where the UI and DB were reconciled by the team, that is noted.
>
> **Legend:** `C` create · `R` read · `U` update · `D` delete · `A` approve · `E` export · `—` no access · `(own)` limited to records the user owns · `(team)` team/region scope · `(soft)` soft-delete/deactivate only.

## The eight roles

| Role | One-line purpose | Home screen |
|---|---|---|
| **super_admin** | Everything + system configuration + audit | My Work |
| **operations** | Staff, schedule and fulfil training; run sessions | My Work |
| **coordinator** | Order intake → endorse to Operations | My Work |
| **sales** | Work leads, quote, open orders | My Work |
| **sales_manager** | Distribute & unblock the sales team | My Work |
| **business_owner** | Approvals, money oversight, pricing | My Work |
| **management** | Read-only oversight (no task queue) | **Overview** |
| **auditor** | Reconstruct any record via search + audit log | **Audit** |

> **By design (verified):** there is **no Trainer login** — the trainer pool is managed by Operations. **Management and Auditor are strictly read-only** — the DB denies them every business-table write and every SECURITY DEFINER RPC; the only thing they can write is their own saved-view preference. *Any* write control shown to these two roles is a defect.

---

## Master matrix (business objects)

| Object / function | super_admin | operations | coordinator | sales | sales_manager | business_owner | management | auditor |
|---|---|---|---|---|---|---|---|---|
| **Inquiry (lead)** | CRUD | R | CRU | CRU (own) | R (team) | R | R | R |
| **Quotation** | CRUD | R | CRU | CRU (own) | R (team) | R | R | R |
| **Customer (client)** | CRUD | CRU | CRU | CRU (own) | R (team) | CRU | R | R |
| **Contact** | CR**D** | R | CR**D** | CR (own) | R | R | R | R |
| **Organization** | CRUD | RU | RU (set-org) | CR/set-org (own) | R | RU | R | R |
| **Order** | CRUD | RU (fulfil) | CRU (intake) | CRU (own, not pay/SAP) | R (team) | RU | R | R |
| **Order line** | CRUD | RU | CRU | CRU (own) | R | R | R | R |
| **Invoice** | CRUD | CRU | CRU | R (own) | R | CRU | R | R |
| **Payment** | C · void/refund | C | C | R (own) | R | C · **void/refund** | R | R |
| **Course** | CRUD | CRUD | R | R (read cat.) | R | R | R | — |
| **Category / Subcategory** | CRUD | CRUD | R | R | R | R | R | — |
| **Course fee / price** | CRUD | CRUD | R | R | R | R (Pricing) | R | — |
| **Pricing rule** | CRUD | CRUD | — | — | — | CRUD | R | — |
| **Session (schedule)** | CRUD | CRUD | R | R | R | R | R | R |
| **Participant (roster)** | CRUD | CRU (soft) | CRU (soft) | R (own) | R | R | R | R |
| **Attendance / assessment / certificate** | CRU | CRU | CRU | R | R | R | R | R |
| **Trainer** | CRUD | CRUD | R | R | R | R | R | — |
| **Venue** | CRUD | CRUD | R | R | R | R | R | — |
| **Approval (decision)** | **A** | — | — | — | — | **A** | — | — |
| **Duplicate order (merge/dismiss)** | CRU | CRU | R (triage) | — | — | — | — | — |
| **E-learning access grant** | CU | CU | R | — | — | — | — | — |
| **User / profile / role** | CRUD | — | — | — | — | — | — | — |
| **Communications template** | CRUD | CRUD | — | — | — | — | — | — |
| **Annual rollover** | CRU | CRU | — | — | — | — | — | — |
| **Audit log** | R E | — | — | — | — | — | — | **R E** |
| **Analytics / Reports** | R E | R E | — | — | R E | R E | R E | — |
| **Saved view (own prefs)** | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |

### Handoff-action authority (order endorsement)

| Action | Who may |
|---|---|
| **Endorse to Operations** | coordinator, sales, operations, super_admin |
| **Accept endorsement** | operations, super_admin |
| **Return for correction** | operations, coordinator, business_owner, super_admin |
| **Override endorse despite blockers** | super_admin only (reason required) |

---

## Navigation access (what each role sees in the nav)

Nav is cosmetic; the table shows the *primary* items after the #8 nav trim (VERIFIED from `roles.ts`).

| Role | Primary nav items |
|---|---|
| **super_admin** | My Work · Calendar · CRM · Customers · Training(edit) · Trainers&venues · Analytics · **Admin** (Pricing, Communications, Rollover, Users) · **Audit** |
| **operations** | My Work · Calendar · CRM · Training(edit) · Trainers&venues · Analytics · **Admin** (Pricing, Communications, Rollover) |
| **coordinator** | My Work · Calendar · CRM · Customers |
| **sales** | My Work · CRM · Customers · Training(read) |
| **sales_manager** | My Work · CRM · Customers · **Team** · Analytics |
| **business_owner** | My Work · Calendar · CRM · Customers · Trainers&venues · Analytics · Pricing |
| **management** | **Overview** · Customers · Training(read) · **Financial** · Analytics |
| **auditor** | **Search** · Audit log |

> Any role can also reach records off-nav via the **⌘K / Ctrl-K command palette** (jump-to-page + record search) and record links. Retired list screens (`/dashboard`, `/reports`, `/organizations`, `/inquiries`, `/quotations`, `/orders`, `/worklist`, `/elearning`) **redirect** into the consolidated shells (`/analytics`, `/crm`, Customer 360) rather than 404.

---

## Reading the matrix — key rules that trip people up

1. **Sales cannot change payment status or the SAP reference** on an order — a DB trigger blocks it; the UI shows those fields read-only to Sales.
2. **Only Business Owner / super_admin can void or refund** a payment, and **payments are never deleted** — they are voided (kept, struck through).
3. **Session cancellation needs Business-Owner approval** — Operations proposes it through the Cancel/No-Go flow; it is not a unilateral delete.
4. **Contacts are the one hard-delete** left (super_admin/coordinator only) — everything else (participants, orders, payments) soft-deletes or voids.
5. **Management & Auditor writes are impossible at the DB** — if you are one of these roles and see a write button, it will fail; report it.
6. **"Owns it" matters for Sales** — a sales rep's create/update rights are scoped to records they own (or their team, for a supervisor/sales_manager); they cannot edit another rep's leads/orders.
