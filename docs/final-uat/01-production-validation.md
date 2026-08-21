# 01 — Production database validation

**Question:** does the production database match the code on `main`?

## Migration inventory (code on `main`)

The repo carries all Phase B + implementation migrations through:

| Migration | Purpose |
|---|---|
| `20260812100000_phaseb_roles_enum` | 8-role enum |
| `20260812110000_phaseb_role_rls` | role-keyed RLS |
| `20260812120000_phaseb_customer360` | customer 360 |
| `20260812130000_phaseb_payments_money` | immutable money model |
| `20260812140000_phaseb_audit_r02` | audit (old→new values) |
| `20260812150000_phaseb_handoff` | endorse / accept / return |
| `20260812160000_phaseb_revoke_anon_execute` | revoke anon EXECUTE |
| `20260812170000_ros01_participant_status` | participant soft-remove/transfer |
| `20260812180000_srch01_global_search` | global search |
| `20260812190000_sv01_saved_views` | saved views |
| `20260812200000_sal01_create_order` | atomic order create |
| **`20260812210000_rls_customer_authority`** | **customer-entity write authority + least-privilege fix** |
| **`20260812220000_s6_category_hierarchy`** | **category → subcategory hierarchy** |

## ⚠️ The one hard blocker — apply + verify the last two migrations live

`docs/implementation/role-crud-matrix.md` (§ Supabase advisor, and § Open items) records that the two newest migrations were **authored and validated in a `BEGIN…ROLLBACK` simulation but recorded as "staged in the PR, not yet applied"** to the live database. This is exactly the "merged code ≠ live schema" gap. It **cannot be verified or resolved from the code-review session** (no Supabase access there); it must be done in the Supabase-enabled session.

Both were reviewed at the code level here and are **safe to apply** — idempotent throughout (`create … if not exists`, `add column if not exists`, `drop policy if exists` then create), non-destructive (S6 keeps `course.category`; the RLS migration only rewrites policies):

1. **`20260812210000_rls_customer_authority.sql`** — closes two **real least-privilege holes** that are live in production until this migration is applied:
   - `contact`: the `owner_sales_id IS NULL` branch matched *any* role → `management`/`auditor` could write contacts of unowned clients. Now gated behind the `sales` role.
   - `quote`: the `created_by = auth.uid()` branch matched *any* signed-in user → `management`/`auditor` could create quotes. Now gated to `coordinator`/`sales`/`sales_manager` (+ super_admin).
   - Also fills matrix **gaps** (coordinator/operations/business_owner couldn't update clients/contacts/orgs they should).
   - **Because this closes a security hole, applying it is a GO precondition, not a nicety.**

2. **`20260812220000_s6_category_hierarchy.sql`** — adds `category` + `subcategory` tables, `course.subcategory_id`, backfills from the free-text `course.category`, RLS = read all-authenticated / write super_admin+operations. The frontend strip-and-retries on `42703`, so the app works before/after it lands; the feature is only *functional* once applied.

## Required steps in the Supabase session (before GO)

1. Apply both migrations via `.github/workflows/apply-supabase.yml` (needs `SUPABASE_DB_URL`). Do **not** hand-paste — that manual path is what caused prior drift.
2. Confirm the migration ledger records them and `relrowsecurity` is true on `category` + `subcategory`.
3. Re-simulate as `anon` + `management` + `auditor` + two `sales` reps and confirm: management/auditor are write-denied on `contact` and `quote` (the closed holes); coordinator/operations/business_owner gained their matrix authority; category/subcategory read-all / write-ops-only.
4. Re-run the Supabase security **and** performance advisors on the applied schema (the matrix advisor run predates these migrations).

## Code-level status (verified this session)

- `npx tsc --noEmit` — clean.
- `npm run build` — compiles.
- All 13 migrations present and idempotent; the two new ones reviewed line-by-line (safe).

**Verdict:** code on `main` is ready; **production schema state is UNCONFIRMED from here** and is the primary GO gate. See `04-role-permission-final.md` for the role/RLS detail and `README.md` for the overall Go/No-Go.
