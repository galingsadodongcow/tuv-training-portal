# Phase B — Build & Validation Notes (role model, money model, Customer 360, handoff)

**Status: BUILT AND VALIDATED — NOT applied to production.** Every call against the
live DB this pass was read-only (schema/RLS reconnaissance). Nothing was written to
`ruwuqzwtwngpcauzbrqj`. Apply via `.github/workflows/apply-supabase.yml` only after review.

## Locked decisions honoured

| Decision | What shipped |
|---|---|
| **Full 8-role model** (D1/D4/D7/D8) | `coordinator`, `sales_manager`, `management`, `auditor` added to `user_role`; RLS reworked for all eight. |
| **Immutable payments + BO/super_admin-only refunds** (D3) | Payment lifecycle (`Pending→Confirmed→Voided`), delete blocked, financial fields frozen; `refund` + `credit_note` objects; void/refund gated to `business_owner`/`super_admin` behind a persisted reason. |
| **Full Customer 360** (D5) | `inquiry.client_id` (+ `inquiry.owner`); client rolled under organization (canonical FK reconciled, orgs backfilled/deduped); 360 views. |
| **Build-and-validate, don't apply** | Migrations + a throwaway-Postgres validation harness; no prod write. |

Customer-model shape chosen (per review): **roll `client` under `organization`** (reversible,
low blast radius) — *not* a full collapse of `client` into `organization`.

## The six migrations (`supabase/migrations/`, also appended to the CI bundle)

1. `20260812100000_phaseb_roles_enum.sql` — the 4 new enum labels, **isolated** (a
   just-added enum value can't be used in the same txn; the CI bundle runs under psql
   autocommit, so labels are added here and used only in later files).
2. `20260812110000_phaseb_role_rls.sql` — role-group helpers (`fn_role_reads_all`,
   `fn_is_team_lead`, `fn_role_intake_write`); `fn_can_see_order` widened; policies on
   `orders`/`order_line`/`order_assignment`/`inquiry`/`audit_log` updated. Read-all =
   super_admin/operations/business_owner/coordinator/management/auditor; management +
   auditor get **no writes**; coordinator gets intake writes; sales_manager is team-scoped;
   auditor reads `audit_log`.
3. `20260812120000_phaseb_customer360.sql` — reconcile the `client.org_id` /
   `client.organization_id` FK drift (`organization_id` canonical, `org_id` kept as a
   **synced deprecated mirror** via `trg_client_org_sync`; no column dropped this pass);
   backfill orgs from `client.company` deduped by `fn_norm_org`; add `inquiry.client_id` +
   `inquiry.owner` and backfill by email→company; `v_org_contacts` + `v_customer_360`
   (security_invoker).
4. `20260812130000_phaseb_payments_money.sql` — `payment_state_t`; payment lifecycle
   columns; `fn_payment_immutable_guard` (no delete, frozen fields, legal transitions,
   BO/super_admin void); `refund` + `credit_note` tables (RLS: BO/super_admin write);
   `fn_ar_recompute` now nets **confirmed payments − refunds + applied credits**;
   `fn_void_payment` / `fn_refund_payment` RPCs.
5. `20260812140000_phaseb_audit_r02.sql` — `audit_log.source` (system vs user) + `reason`;
   `fn_audit` populates both (reason from a txn-local `app.audit_reason` GUC set by RPCs);
   audit triggers extended to `payment`/`refund`/`credit_note`/`inquiry`/`contact`/`invoice`/`participant`;
   `fn_audit_search` surfaces source+reason and admits `auditor`.
6. `20260812150000_phaseb_handoff.sql` — `handoff_status_t` + `order_handoff`;
   `fn_order_completeness` (D2 contract as data); `fn_endorse_order` (H01 gate, super_admin
   override with reason), `fn_accept_endorsement` (H02), `fn_return_for_correction`
   (H02/RET01, regresses stage through a single controlled bypass of the forward-only stage
   guard).

## Validation (throwaway PostgreSQL 17.10, faithful RLS harness)

A subset of the live schema (tables, enums, helper fns, **current** RLS policies) + seed rows
was reconstructed locally and RLS simulated as `anon` and as each of the 8 roles. Results:

- **Apply + idempotency:** all six apply clean and re-apply as no-ops.
- **Role RLS:** management/auditor/coordinator read all orders & leads; management/auditor
  **hard-blocked** from every write; coordinator intake writes succeed; sales_manager sees
  only its team's orders + inquiries; auditor reads `audit_log`, management cannot.
- **Money:** existing payments become `Confirmed`; delete blocked (RLS **and** guard backstop);
  financial-field edit blocked; coordinator can record; ops void blocked, BO void/refund
  succeed; AR recomputes from confirmed − refunds + applied credits.
- **Audit:** `source`/`reason` present; payment/refund now audited; a no-JWT background write
  is flagged `source=system`.
- **Handoff:** completeness passes a complete order and blocks one with an unscheduled line;
  coordinator endorse succeeds, incomplete endorse is refused, super_admin override works;
  accept closes; return regresses the stage **only** through the RPC (a plain backward move is
  still blocked; the bypass GUC is txn-local and does not leak).

## Follow-ups (not in this pass)

- **Frontend role wiring** — `src/lib/roles.ts` NAV/gates + `Guard` for the 4 new roles, and
  UI for handoff (endorse/accept/return), refund/void, and Customer 360. This pass is the DB layer.
- **`client.org_id` DROP** — once no app path writes the deprecated mirror, drop it in a
  cleanup migration.
- **On apply:** run the workflow, then re-run the Supabase advisor and re-simulate RLS as
  `anon` + two sales reps on the live DB (per CLAUDE.md's drift discipline).
