# 13 — Data quality and integrity audit

All figures are live production queries run during this audit (read-only).

## Referential integrity — clean

| Check | Result |
|---|---|
| Orders pointing at a missing client | **0** |
| Order lines pointing at a missing order | **0** |
| Participants pointing at a missing schedule | **0** |
| Orders with no client | **0** |
| Customers with no email | **0** |

No orphans anywhere tested. This is better than typical for a system of this age.

## Volumes

163 orders · 161 sessions · 28 customers · 7 salespeople · 6 trainers ·
5 venues · 6 portal users · 7,546 audit rows.

## Findings

**DQ-1 (P0) — cost/margin exposure.** See DEF-1. The integrity issue is that
*sensitivity* is not modelled: `trainer.daily_rate` and `venue.day_rate` are
ordinary columns on world-readable tables.
*Recommended fix (needs a decision):*
1. Revoke column access by moving rates into a restricted view, **or**
2. Replace `v_session_pnl` reads with a `security definer` RPC gated on
   `fn_role_reads_all()`.
Option 2 is smaller and keeps the UI unchanged.

**DQ-2 (P1) — 40 of 163 orders have no owner (24.5%).** Ownership is optional
at every layer: nullable `p_sales_id` in `fn_create_order`, no completeness
blocker, opt-in claim queue.

**DQ-3 (P2) — 6 live sessions have no trainer.** No venue gaps (0).

**DQ-4 (P2) — 5 of 7 salespeople have no portal login.** They exist as
`salesperson` rows and can own orders, but cannot sign in, so their work is
performed by someone else under a different identity — which weakens the audit
trail's meaning.

**DQ-5 (P2) — team structure is a single flat `Sales` team.** Set during this
session because every team was null (which made supervisor delegation inert).
One team + one supervisor means `/team` and the delegation matrix are
structurally trivial. Needs a real org model.

**DQ-6 (P3) — two staging tables lack primary keys**
(`staging_order_booking`, `staging_calendar`) and live in `public`, so they are
exposed through PostgREST.

**DQ-7 (P3) — `schema_migrations` has RLS enabled with no policy** (advisor
INFO). Effectively deny-all, which is safe, but it is in the API schema.

**DQ-8 (P3) — migration ledger version drift.** Migrations applied through the
Supabase apply path are stamped with fresh timestamps
(`20260814210212`) rather than the repo filename version
(`20260814050000`). Content matches, but `list_migrations` will never align with
`ls supabase/migrations`. Given this repo's documented history of ledger drift,
this is worth a note in CLAUDE.md rather than a fix.

## Audit trail

`audit_log` holds 7,546 rows with `actor_id`, `actor_role`, `old_data`,
`new_data`, `source` and `reason`. The new delegation RPCs write to it with a
`source` of the function name. Sales reads **0** rows — correctly restricted.

**DQ-9 (P3) — bulk data-setup operations bypass the audit trail.** The team
assignment performed during this session was a direct SQL `update` and therefore
produced no `audit_log` entry. Any future admin bulk operation should go through
the RPCs (which do audit) or be recorded deliberately.

## Constraints and uniqueness

- `course_fee` has a course+modality unique constraint.
- `trainer.code` / `venue.code` now carry **case-insensitive unique indexes**
  (added 2026-08-14) and auto-generate.
- `order_assignment` is keyed one-per-order (upsert on `order_id`), so
  double-assignment races are impossible.
- `quote_line.course_id` FK added `20260812310000`.
- Soft delete (`deleted_at`) is used on orders/clients/schedules and respected by
  the partial indexes.
