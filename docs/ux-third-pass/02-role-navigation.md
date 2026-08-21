# 02 — Role navigation (current → target)

Principle: **5–7 primary concepts for daily roles, fewer for oversight.** Supporting entities reached via records + search, not top-level slots. Config lives in Admin. Nothing loses *authority* — only *nav prominence*.

## Current per-role visible nav counts (from `roles.ts`)

| Role | Count | Items |
|---|---|---|
| super_admin | 21 | all |
| operations | 18 | everything except Inquiries, Data quality, Users, Audit |
| coordinator | 13 | My Work, Calendar, Inquiries, Quotations, New order, Orders, Customers, Organizations, Ops today, Fulfillment, Duplicates, E-learning, Analytics |
| business_owner | 12 | My Work, Calendar, Quotations, Orders, Customers, Organizations, Ops today, Fulfillment, Trainers & venues, Approvals, Analytics, Pricing |
| management | 11 | My Work, Calendar, Inquiries, Quotations, Orders, Customers, Organizations, Ops today, Fulfillment, Trainers & venues, Analytics |
| sales | 10 | My Work, Calendar, Inquiries, Quotations, New order, Orders, Customers, Organizations, Fulfillment, Analytics |
| auditor | 10 | My Work, Calendar, Inquiries, Quotations, Orders, Customers, Organizations, Fulfillment, Analytics, Audit |
| sales_manager | 9 | My Work, Calendar, Inquiries, Quotations, Orders, Customers, Organizations, Fulfillment, Analytics |

## Target per-role navigation

### Operations — 18 → **6** (−67%)
`My Work · Calendar · Training · Resources · Orders · Analytics`
- **Removed/folded:** Operations today (→ My Work + Calendar), Fulfillment (→ Orders saved view), Duplicates + E-learning (→ My Work exceptions / Orders views), Approvals (→ My Work), Quotations/New order (reach from Orders/Customer when needed), Customers/Organizations (via search + record links), Courses & pricing/Pricing/Communications/Rollover/Data quality (→ **Admin**).
- **Training** = catalogue (Courses + Categories) — sessions live in Calendar + Session detail.

### Coordinator — 13 → **5**
`My Work · Calendar · CRM · Customers · Orders`
- CRM carries Inquiries + Quotations + New order. Duplicates/E-learning → My Work exceptions. Ops today → My Work. Analytics optional (read).

### Sales — 10 → **4** (−60%)
`My Work · CRM · Customers · Training`
- **CRM** = Inquiries pipeline + Quotations + New order + my Orders (one workspace). **Customers** = Customer 360 (Organizations folded in). **Training** = catalogue + schedule lookup (read). Fulfillment/Analytics drop from sales nav (reach own numbers in My Work / CRM).

### Sales Manager — 9 → **5**
`My Work · CRM · Customers · Team · Analytics`
- **Team** = pipeline + unassigned + overdue + workload + reassign (the manager-specific queue). Replaces scattered Fulfillment/Orders prominence.

### Management — 11 → **5** (read-only)
`Overview · Customers · Training · Financial · Analytics`
- **Overview** = the KPI landing (replaces My Work for a role with no tasks). **Training** = calendar + activity (read). **Financial** = receivables + revenue. Drops Inquiries/Quotations/Orders/Organizations/Fulfillment/Ops-today as separate items (reach via Overview drill-through + search).

### Auditor — 10 → **2** (−80%)
`Audit · Search`
- Auditor reconstructs any record through global search + the audit log. Remove the CRM/Customers/Orders/Fulfillment/Calendar/Analytics nav clutter — they were read-only browse surfaces the audit+search path covers better.

### Super Admin — 21 → **~8 (2 groups)**
`My Work · Calendar · Training · Orders · Customers · Analytics` + **Admin** (Users, Pricing, Communications, Rollover, Reference data, Data quality) + **Audit**
- Keeps full operational visibility but pushes all configuration under one **Admin** group instead of 7 loose Admin-group items.

## What moves where (summary)
| Item | From | To |
|---|---|---|
| Operations today | Operations group | **Retired** → My Work + Calendar |
| Fulfillment | Operations group | **Orders** (saved view) |
| Duplicates, E-learning | Operations group | **My Work** exceptions / Orders views |
| Approvals | Oversight group | **My Work** queue (+ decision drawer) |
| Data quality | Admin | **My Work** exceptions (normal) / **Admin** (super_admin) |
| Organizations | Customers group | **Customer 360** tab / **Admin** reference |
| Reports, Quality, Dashboard | 3 items | **one Analytics** area with tabs |
| Courses & pricing, Pricing, Communications, Rollover, Users | 5 loose Admin items | one **Admin** group |
