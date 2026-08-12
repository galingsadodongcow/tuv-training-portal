# 04 — Role / permission final validation

Two layers: **RLS** (authoritative, DB) and the **UI surface** (cosmetic — must not *show* an action the RLS rejects, and should not *hide* one a role has).

## RLS (authoritative) — validated in the Supabase session, per `role-crud-matrix.md`

All 8 roles were simulated live-in-rollback (`role-crud-matrix.md` §Findings). Result: **all PASS after** the `20260812210000_rls_customer_authority` fix, which closed two real least-privilege **holes**:
- `contact`: `owner_sales_id IS NULL` matched any role → management/auditor could write unowned-client contacts. Now gated behind `sales`.
- `quote`: `created_by = auth.uid()` matched any signed-in user → management/auditor could create quotes. Now gated to coordinator/sales/sales_manager (+ super_admin).

Confirmed: RLS enabled on 52/52 tables; management + auditor denied on every business-table write **and** every SECURITY DEFINER RPC; refund/void limited to BO/super_admin; payments have no DELETE policy for any role; auditor reads `audit_log` with old→new values and has no write path.

⚠️ **These RLS results were validated in-rollback but the fix migration is recorded as NOT YET APPLIED to prod** (`01`). Until applied, the two holes above are **open in production**. Re-simulate after applying.

## UI surface cross-check (this session) — mismatches found + fixed

The UI is authoritative for nothing, but a read-only role seeing a write button it can't use is a trust/clarity defect (UAT §22–23, §26). Found and **fixed this pass** (controls only removed — aligns UI to RLS, no over-grant, no dependency on the pending migration):

| Screen | Leak (before) | Fix |
|---|---|---|
| **Inquiries** | Entire write surface ungated → management/auditor saw New-inquiry + stage move/advance/lost/reopen | Gated to `super_admin/coordinator/sales/sales_manager` |
| **Worklist** | Advance-stage (per-row + bulk) + selection checkboxes ungated → management/auditor saw them | Gated with `canAct` (excludes management/auditor) |
| **OrderDetail** | Comment composer ungated | Hidden from management/auditor |
| **AttachmentsPanel** | File uploader ungated (session/order/client Files) | Hidden from management/auditor |

## UI under-grants — deferred (coupled to the pending migration)

The customer-authority migration **grants** coordinator/operations/business_owner new writes, but the UI still hides them. Widening the UI now — while that migration is not yet live — would recreate the very "button the DB rejects" mismatch we just fixed. So these are deferred until the migration is applied (`08`):
- Coordinator: quote create/edit (`Quotations`/`QuoteDetail` `canEdit`), contact edit (`ContactsPanel`).
- Coordinator/operations: set a customer's organization; a client core-field edit form (Overview is read-only for all roles today).
- Auditor: add read access to Quotations nav (matrix ▲; currently excluded) — minor under-grant, no security impact.

## Per-role read-only / authority confirmation (UI)
- **Management / Auditor** — after the fixes above, no write control is surfaced anywhere. ✅
- **Business owner** — nav + actions are authority-level (approvals, refund/void, forecast, pricing oversight); no routine intake/config clutter. ✅
- **Super admin** — override/destructive actions (endorse-override, return, void, refund, cancel) all require a reason via `useConfirm`. ✅
- **sales_manager** — region-scoped customer *writes* not implemented; the UI surfaces **no** customer-write control to them, so there's no invisible mismatch (reads/visibility work). Documented feature gap (`08`).

**Accepted deviation** (already in the matrix): `sales` can create Organizations (matrix marks ▲ set-org) — left as a client→org convenience.
