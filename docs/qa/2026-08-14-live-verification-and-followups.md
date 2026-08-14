# Live verification & advisor follow-ups — 2026-08-14

Follow-up to `docs/qa/2026-08-14-quality-hardening.md`. This records the live
Supabase inspection the handover asked for and the small fixes that came out of
it. Project inspected: `ruwuqzwtwngpcauzbrqj` ("A02 Academy Hub"), the ref in
CLAUDE.md.

## Migration state

- **The hardening migration `20260814010000` is already applied** — and it is
  genuinely live, not just a ledger row: `public.fn_dashboard_metrics(integer)`
  exists and is `SECURITY INVOKER`, and all five trigram indexes plus the partial
  "hot" indexes are present. `pg_trgm` 1.6 is installed in `extensions`. So the
  handover's "apply to staging first" step is already moot for this migration.
- **No separate staging Supabase project exists** for this portal among the
  linked projects. The target is the production database, so DB changes should
  go through `.github/workflows/apply-supabase.yml` (bundle apply) and be
  re-verified live, not applied casually.

## Drift found and reconciled

The live ledger carried three items with no repo counterpart:

1. **Ledger version `20260814020000_ledger_reconcile`** — present in
   `supabase_migrations.schema_migrations` with no repo file. Its body was not
   recoverable (this project stores statement text for only 17 of 79 ledger
   rows; this row's is null), and live-schema inspection found no object
   attributable to it. Consistent with the name, it was ledger bookkeeping, not
   DDL. Reconciled with a documented no-op migration file so a from-scratch
   rebuild stays faithful.
2. **`ix_audit_changed_at`** and **`participant_schedule_idx`** — byte-identical
   twins of `idx_audit_changed` / `idx_participant_schedule` (both created by
   `20260814010000`), created by no repo migration. The Performance Advisor
   flagged both pairs as `duplicate_index`. Dropped the un-tracked twins (keeping
   the repo-defined `idx_*`) in `20260814040000_drop_duplicate_indexes.sql`.

## Security advisor

Most findings are by design and were left alone per CLAUDE.md (do not broadly
flip `SECURITY DEFINER` helpers to invoker): the RLS helpers (`fn_current_role`,
`fn_can_see_order`, `fn_create_order`, workflow RPCs, …) are intentionally
definer-and-callable.

- **Fixed:** `fn_orders_lock_payment_status()` — a `SECURITY DEFINER` **trigger**
  function returning `trigger` — still had the default PUBLIC/anon/authenticated
  `EXECUTE` grant, exposing it as an anon RPC (advisor 0028). It was missed by
  `20260812010000_lock_trigger_fn_execute`. Revoked in
  `20260814030000_revoke_anon_lock_payment_trigger_fn.sql`. Revoking EXECUTE does
  not stop the trigger firing.
- **Left for a dashboard operator (not code):** `auth_leaked_password_protection`
  is disabled — enable the HaveIBeenPwned check in Auth settings.

## Performance advisor

No ERROR-level findings. The new hardening indexes show as `unused_index` (INFO)
only because they had no recorded scans when the advisor ran — expected for a
fresh migration, not proof they are unneeded; re-check after real traffic. The
larger pre-existing items (39 `unindexed_foreign_keys` INFO, 30
`auth_rls_initplan` WARN — RLS policies calling `auth.<fn>()` un-wrapped, 59
`multiple_permissive_policies` WARN) predate this work and are candidates for a
separate, deliberate pass, not folded in here.

## Authenticated Playwright coverage — how to enable

The scaffolding is complete: `auth.setup.ts` drives the real login form and the
`authenticated-chromium` project (in `playwright.config.ts`) activates only when
both credentials are set. The new `authenticated-browser` job in
`.github/workflows/quality.yml` runs it and self-skips until configured. To turn
it on, set these repo secrets:

- `STAGING_BASE_URL` — a deployed staging/preview URL whose backend is a **real**
  Supabase (placeholder values cannot authenticate).
- `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` — a **least-privileged** staging test
  account.

Never point it at production or run destructive flows from browser tests. Once
green, extend `authenticated.spec.ts` to role-by-role read-only smoke checks
(sales, operations, business owner, super_admin) since RLS behavior depends on
live profile data.

## Applying these follow-ups to the live DB

`20260814020000` is already recorded live (the new file is repo/rebuild
fidelity only). `20260814030000` (revoke) and `20260814040000` (drop duplicate
indexes) still need to be applied to the live DB via the sanctioned workflow, or
with an explicit go-ahead. Both are idempotent and reversible (re-grant EXECUTE /
recreate the index). Re-run the Security and Performance advisors afterward to
confirm the two findings clear.
