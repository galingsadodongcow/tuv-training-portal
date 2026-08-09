# CRUD Verification

Ran against a local Postgres load (schema + all migrations + the enlarged seed),
exercising every writable entity through Create → Update → Delete and checking
role permissions. See `SIMULATION_LOG.md` for the harness setup.

## Data-layer CRUD (does the write path work at all)

Insert → update → delete executed for each entity, inside a rolled-back
transaction. **21 / 21 entities pass.**

| Entity (incl. triggers) | Result |
|---|---|
| course, course_fee | ✅ |
| client, contact, client_interaction | ✅ |
| schedule | ✅ |
| participant (+ score/result/cert) | ✅ |
| invoice + payment (+ AR recompute trigger) | ✅ |
| quote + quote_line | ✅ |
| feedback | ✅ |
| complaint (+ resolved-at trigger) | ✅ |
| discount_rule | ✅ |
| trainer + availability + session_trainer | ✅ |
| venue | ✅ |
| attachment | ✅ |
| comms_log | ✅ |
| inquiry (+ CRM columns) | ✅ |
| orders + order_line + order_assignment (+ rollup trigger) | ✅ |
| approval | ✅ |
| salesperson | ✅ |
| profiles (role update) | ✅ |

Two initial "failures" were **test-script artifacts**, confirmed not app bugs:
- inquiry insert without `sales_id` → NOT NULL violation. The app (`Inquiries.tsx`)
  always sends `sales_id`, so the real path passes.
- deleting an order that already had an `assignment_log` row → FK block. The app
  only deletes an order in `SalesEntry`'s rollback, which runs on the
  `order_line` insert failure — **before** any assignment exists — so the FK is
  never hit.

## Role-permission CRUD (does RLS allow the right role, block the rest)

| Attempt | Expected | Result |
|---|---|---|
| sales creates inquiry / quote / owned-client contact | allow | ✅ |
| sales creates discount_rule | deny | ✅ RLS blocked |
| operations creates course / schedule / calendar_year / trainer | allow | ✅ |
| operations manages discount_rule / invoice / payment | allow | ✅ |
| sales edits another rep's quote / interaction attribution | deny | ✅ (from ownership pass) |

## Critical finding surfaced during this pass — FIXED

**Privilege escalation via disabled RLS.** 23 base tables had deliberately
role-scoped policies but **row security was never enabled**, so the policies were
inert and the anon key could bypass them. Demonstrated in the harness:
a `sales` user could `update profiles set role='super_admin' where user_id =
auth.uid()` (**self-escalation to super admin**), rewrite every salesperson's
team, and create/edit courses, prices, and schedules directly via PostgREST —
regardless of the UI guards.

**Fix:** `20260808310000_enable_rls_all.sql` enables row level security on every
table that has policies (idempotent — a no-op where it is already on). Re-verified
in the harness: the escalation now returns `UPDATE 0` (blocked), the sales user's
role stays `sales`, while every legitimate role write above still passes and the
seed still loads (it runs as owner, which bypasses RLS).

> Note: this was observed against the reconstructed `schema.sql`, which omits the
> `enable row level security` statements. Your production database may already
> have RLS on for some or all of these tables; the migration is safe either way.
> Apply it and confirm — if any table was open, this closes it.
