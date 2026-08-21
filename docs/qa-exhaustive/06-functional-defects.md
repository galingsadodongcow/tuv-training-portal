# 06 — Functional defects

Each entry: ID · severity · role · module · evidence · cause · fix.
Evidence is live-database or code; nothing here is inferred from a screenshot
that was not taken.

---

**DEF-1 · P0 · all roles · Analytics / Session record**
*Cost and margin data readable by every authenticated role.*
Evidence: as `sales`, `select count(*) from v_session_pnl` → **161/161**;
`sum(margin)` → **₱21,907,500**; `trainer.daily_rate` → all 6 rates, max ₱12,000.
Cause: `v_session_pnl` is `security_invoker`, but `schedule`, `trainer` and
`venue` are readable by every authenticated user, so the view returns all rows.
The UI tab gate is cosmetic.
Fix (needs a decision — business rule): either (a) a `security definer` P&L RPC
that checks `fn_role_reads_all()`, or (b) move `daily_rate`/`day_rate` behind a
restricted view and drop them from the base-table grants. **Not implemented —
see §41 of the brief.**

**DEF-2 · P1 · sales, operations · Orders**
*40 of 163 orders (24.5%) have no owner.*
Evidence: live count of `orders` with no `order_assignment` row.
Cause: ownership is optional at creation; `fn_create_order`'s `p_sales_id` is
nullable and the queue's claim flow is opt-in.
Fix: default the owner to the creator when the creator is a selling role, and
add an owner blocker to `fn_order_completeness` (see BP-1).

**DEF-3 · P1 · QA · whole app**
*No authenticated automated test coverage exists.*
Evidence: `e2e/authenticated.spec.ts` exists but is inert — the project only
activates when `E2E_USER_EMAIL`/`PASSWORD` are set, and no test account exists.
Fix: create a least-privileged test account, restore the secrets. The harness is
already built and CI-wired.

**DEF-4 · P2 · operations · Resources / Calendar**
*6 live (non-cancelled, non-completed) sessions have no trainer.*
Evidence: live query. There is an "unstaffed" notice on `/resources` and a
dashboard metric, but nothing blocks the session progressing.
Fix: surface unstaffed sessions inside the ≤21-day window as a My Work task.

**DEF-5 · P2 · management, auditor · CRM / Customers / detail routes**
*5 screens have no route Guard, so nav-hidden roles can deep-link in.*
Evidence: `/crm`, `/clients`, `/clients/[id]`, `/orders/[id]`, `/session/[id]`.
Data is correctly RLS-scoped, so this is consistency, not breach.
Fix: add Guards matching the nav role lists.

**DEF-6 · P2 · all · data layer*
*~96 `.select(` calls, only ~17 bounded by `.limit`/`.range`.*
Evidence: grep of `src/hooks/data.ts`. Several are `select('*')` over views
(`v_country_revenue`, `v_trainer_quality`, digest views).
Cause: pagination was added to Orders/Clients but not to the long tail.
Fix: bound the remaining list queries; the dataset is small today (161
sessions) so impact is latent, not current.

**DEF-7 · P2 · operations · Sessions*
*The pax rule is undecided.* Two draft migrations
(`20260809020000_pax_option_a_course_derived`,
`20260809030000_pax_option_b_per_session`) both sit unapplied; exactly one
should be. `fn_enforce_pax` currently forces `min_participants = 8`.
Fix: decide, apply one, delete the other.

**DEF-8 · P3 · all · terminology*
*"Customer" (7 label occurrences) vs "Client" (3).* Also `Session`/`Schedule`
used interchangeably in code vs UI. Recommend "Customer" and "Session" as the
single standard.

**DEF-9 · P3 · admin · Supabase Auth*
*Leaked-password protection disabled* (advisor WARN). Dashboard toggle;
Pro-plan feature.

**DEF-10 · P3 · all · observability*
*No telemetry destination configured.* `NEXT_PUBLIC_TELEMETRY_ENDPOINT` is
unset, so production errors are not collected anywhere. The capture code exists.

**DEF-11 · P3 · data · staging tables*
`staging_order_booking` and `staging_calendar` have **no primary key**
(performance advisor). Acceptable for staging, but they are in `public` and
therefore in the API surface.

**DEF-12 · P4 · operations · Calendar*
No recurring sessions, no duplicate-from-drawer, no drag-and-drop reschedule.
