# Role × Function Matrix

Scope: TÜV Rheinland Academy PH training portal. Generated from route guards
(`src/app/(app)/**/page.tsx` + `src/components/Guard.tsx`), the nav model
(`src/lib/roles.ts`), Supabase RLS policies (`supabase/schema.sql` +
`supabase/migrations/*`), and SECURITY DEFINER RPCs. Verified against a local
Postgres load of schema + all migrations + seed (see `SIMULATION_LOG.md`).

## Roles (from `user_role` enum)

| Role | Source | Intent |
|------|--------|--------|
| `super_admin` | `user_role` enum, `fn_current_role()` | Full access, incl. user/role admin, audit log, data quality. |
| `operations` | `user_role` | Fulfillment, courses/pricing, trainers/venues, comms, rollover, AR. |
| `business_owner` | `user_role` | Oversight: approvals, reports, quality, forecasts; read-heavy. |
| `sales` | `user_role`, linked to a `salesperson` via `profiles.sales_id` | Inquiries, quotes, new orders, own/team clients & orders. |
| ~~trainer~~ | descoped by the customer | No login. Trainer pool is managed by operations. |

Access is enforced at two layers: **UI** (route `Guard` + nav filter, `roles.ts`)
and **DB** (RLS `using`/`with check` on `fn_current_role()` / `fn_current_sales_id()`
/ team-region helpers). A UI-only block with a permissive DB policy is a finding
(see `QA_AUDIT_REPORT.md`).

## Route access (UI layer — `Guard roles`)

| Route | super_admin | operations | business_owner | sales |
|-------|:-:|:-:|:-:|:-:|
| /home, /calendar, /clients, /clients/[id], /orders, /orders/[id], /session/[id], /dashboard | ✅ | ✅ | ✅ | ✅ |
| /organizations(/[id]), /worklist, /quotations(/[id]) | ✅ | ✅ | ✅ | ✅ |
| /inquiries, /sales-entry, /duplicates | ✅ | ⛔ | ⛔ | ✅ |
| /approvals, /reports, /resources, /quality, /pricing | ✅ | ✅ | ✅ | ⛔ |
| /courses, /course/*, /session/new, /session/[id]/edit, /communications, /elearning, /rollover | ✅ | ✅ | ⛔ | ⛔ |
| /admin, /audit, /data-quality | ✅ | ⛔ | ⛔ | ⛔ |

Routes without an explicit `Guard` (Home, Calendar, Clients, Orders, Session,
Dashboard) are all-roles by design and rely on RLS for row-level data scoping.

## Business functions (DB layer — write authority)

| Function | Table / RPC | super_admin | operations | business_owner | sales |
|----------|-------------|:-:|:-:|:-:|:-:|
| Create/edit inquiry | `inquiry` | ✅ | ⛔ | ⛔ | ✅ (own) |
| Create sales order | `orders` insert | ✅ | ⛔ | ⛔ | ✅ (own, Inside/Field) |
| Edit order | `orders` update | ✅ | ✅ | partial | ✅ (own) |
| Add order line | `order_line` | ✅ | ✅ | ⛔ | ✅ (see finding S4) |
| Quotation create/convert | `quote`,`quote_line` | ✅ | ⛔¹ | ⛔¹ | ✅ (see finding S3) |
| Pricing / discount rules | `discount_rule` | ✅ | ✅ | ✅ | ⛔ |
| Invoices & payments (AR) | `invoice`,`payment` | ✅ | ✅ | ✅ | ⛔ |
| Schedule create/edit | `schedule` | ✅ | ✅ | ⛔ | ⛔ |
| Go/No-Go, close, cancel | `fn_*` RPCs | ✅ | ✅ | approve only | ⛔ |
| Approvals (forecast, cancel) | `approval` | ✅ | request | ✅ decide | ⛔ |
| Courses & fees | `course`,`course_fee` | ✅ | ✅ | ⛔ | ⛔ |
| Trainers/venues, availability, co-trainers | `trainer`,`venue`,`trainer_availability`,`session_trainer` | ✅ | ✅ | ⛔ | ⛔ |
| Certificates issue/verify | `fn_issue_certificate`,`fn_verify_certificate` | ✅ | ✅ | ⛔ | ⛔ |
| Feedback capture | `feedback` | ✅ | ✅ | ✅ | ⛔ |
| Complaints raise / manage status | `complaint` | ✅ / ✅ | any / ✅ | any / ✅ | any / ⛔ |
| Contacts & interactions | `contact`,`client_interaction` | ✅ | ⛔² | ⛔² | ✅ (see finding S5) |
| Attachments | `attachment` + storage | ✅ | ✅ | own | own |
| Communications templates/queue | `message_template`,`fn_queue_*` | ✅ | ✅ | ⛔ | ⛔³ |

¹ Quotations route is open to operations/business_owner in the UI but the DB
write policy is `super_admin`/`sales` only — a UI/DB mismatch (finding S3-adjacent).
² `client_interaction`/`contact` write is `super_admin`/`sales` only.
³ `fn_queue_reminders` is currently callable by any authenticated user (finding S6).

## Service functions

| Function | Mechanism | Who |
|----------|-----------|-----|
| Auth / session / role claim | Supabase Auth + `profiles.role` via `fn_current_role()` | all |
| Order visibility scoping | `p_orders_r` (team/region) + `fn_can_see_order` on children | sales scoped; ops/BO/admin all |
| Fill-count rollup | `fn_rollup_schedule` trigger | system |
| Waitlist auto-promotion | `fn_waitlist_autopromote` trigger | system |
| SLA breach escalation | `fn_notify_sla_breaches`, `v_sla_breach` | ops/admin |
| AR recompute | `fn_ar_recompute` trigger on `payment` | system |
| Certificate expiry watch | `v_cert_expiring` | ops/admin/BO |
| Global audit search | `fn_audit_search` (super_admin-gated internally) | super_admin |
| Digest / nightly hygiene | `fn_nightly_hygiene`, digest views | system/ops |
| Email delivery | `supabase/functions/send-comms` (Resend) | system |
| CSV export | client-side `src/lib/csv.ts` | per screen role |

## Unknowns / gaps flagged during discovery

- **G1** Child-table read scoping (`order_line`, `participant`, `invoice`,
  `payment`) did not mirror `orders` — resolved by `20260808290000_rls_hardening`
  (finding S1). 
- **G2** New AR/analytics views ran as owner (no `security_invoker`) — resolved
  in the same migration (finding S2).
- **G3** Quote/contact/interaction writes are role-gated but not owner-scoped
  (findings S3/S5) — recommendation, not yet applied.
- **G4** `quote_seq` lacked `GRANT USAGE` → quote creation could 500 for sales
  (fixed in `20260808200000`).
