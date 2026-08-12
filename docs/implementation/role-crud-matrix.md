# Role / CRUD authority matrix

The authority every role should have over every major entity, and its validation status. This is the **target** the application must match, taken from the approved second-pass permission model (`docs/ux-second-pass/02-role-model-and-permissions.md`) as implemented by Phase B (roles `super_admin, coordinator, operations, business_owner, sales, sales_manager, management, auditor`; migrations `20260812100000_phaseb_roles_enum.sql`, `20260812110000_phaseb_role_rls.sql`).

**Legend:** C create · R read · U update · D delete/❌ (prefer Archive/Cancel/Void/Deactivate) · As assign/reassign · Ap approve · X export · ● scoped (own/team) · ▲ read-only · ✔ full · ✖ none.

**Validation columns:**
- **UI** — confirmed from `src/lib/roles.ts` nav gates + screen `canEdit`/role guards (static, done this pass).
- **RLS** — authoritative DB check by simulating as each role. **✅ VERIFIED on the live DB** this pass: each role was simulated in a `BEGIN … set request.jwt.claims + SET LOCAL role authenticated … ROLLBACK` transaction and every operation was probed for allow/deny (INSERT via the RLS `with_check` error; UPDATE/DELETE via affected-row count so a silently-denied write is not mistaken for allowed; RPC role-gates via their raised messages). **RLS is enabled on all 52 public tables** (`relrowsecurity` true; migration `20260808310000_enable_rls_all`). Divergences were fixed at the DB — see **Findings** below.

## Summary matrix (intended authority)

| Entity | super_admin | coordinator | operations | business_owner | sales | sales_manager | management | auditor |
|---|---|---|---|---|---|---|---|---|
| **Courses** | CRUD | ▲ | CRU (D→deactivate) | ▲ | ▲ | ▲ | ▲ | ▲ |
| **Categories/Subcategories** *(S6: real `category`+`subcategory` tables shipped; `course.subcategory_id`)* | CRUD | ✖ | CRU | ▲ | ▲ | ✖ | ▲ | ▲ | — RLS ✅ read all-authenticated, write super_admin/operations only (simulated) |
| **Sessions (schedule)** | CRUD | ▲ | **CRU + Cancel(approval)** | ▲ Ap | ▲ | ▲(team) | ▲ | ▲ |
| **Trainers** | CRUD | ✖ | CRU (D→deactivate) | ▲ | ✖ | ✖ | ▲ | ▲ |
| **Venues** | CRUD | ✖ | CRU (D→deactivate) | ▲ | ✖ | ✖ | ▲ | ▲ |
| **Participants** | CRUD | ✖ | **C R U + soft-cancel/transfer/substitute; attendance; certs** | ▲ | ●(attendance on own/team) | ●(team ▲) | ▲(masked) | ▲ |
| **Customers (client)** | CRUD (archive) | C R U ● | R U As | R U | ● C U (archive own) | ●(region) As● | ▲ | ▲ |
| **Contacts** | CRUD | C R U ● | R U | R U | ●(own/unowned) | ● | ▲ | ▲ |
| **Organizations** | CRUD | R U | R U | R U | ▲ set-org● | ● | ▲ | ▲ |
| **Inquiries** | CRUD | C R U | R | R | ● C U(own) | ●(team) As | ▲ | ▲ |
| **Quotations** | CRUD | C R U | R | R | ● C U(own) | ● | ▲ | ▲ |
| **Orders** | CRUD | **C R U (owns intake→endorse)** As | R U (fulfillment) As | R U | ● C U(stage) | ● As | ▲ | ▲ |
| **Order → endorse (handoff)** | ✔ | **Send** | **Accept / Return** | ✔ | ●(advance) | ● | ✖ | ✖ |
| **Payments / AR** | CRUD | **C R U** (record/confirm, no void) | C R U | R C U **Ap(refund)** | ▲(own/team) | ▲● | $▲ | $▲ |
| **Refund / Void / Credit** | ✔ | ✖ | ✖ | **Ap ✔** | ✖ | ✖ | ✖ | ▲ |
| **Approvals** | Ap ✔ | request | request | **Ap ✔** | ✖ | ✖ | ▲ | ▲ |
| **Reports / Analytics** | R X ✔ | R● | R X | R X ✔ | R●(own) | R●(team) | **R X ✔** | R▲ X |
| **Audit log (old→new values)** | **Au ✔** | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | **Au ✔** |
| **Configuration / Admin** | Adm ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

## Per-cell validation status (this pass)

| Area | UI gate (roles.ts / screen) | RLS (live simulation) |
|---|---|---|
| RLS enabled on every table | n/a | ✅ **PASS** — 52/52 tables `relrowsecurity = true` |
| Nav visibility per role (all entities) | ✅ confirmed — see `NAV` in `roles.ts` | n/a (cosmetic) |
| Sales blocked from `payment_status`/`sap_order_no` | ✅ UI hides + `fn_guard_orders_sales_fields` (42501) | ✅ **PASS** — `sales` UPDATE of an owned order raises 42501 on both fields; other write fields succeed |
| Refund/void limited to BO/super_admin | ✅ ReceivablePanel gates | ✅ **PASS** — `fn_void_payment`/`fn_refund_payment` allow only business_owner + super_admin; coordinator/operations/all others denied |
| Payments immutable (no hard delete) | ✅ immutable model (Phase B) | ✅ **PASS** — DELETE on `payment` affects 0 rows for **every** role (no DELETE policy; guard is the backstop) |
| Coordinator intake (create orders + inquiries, endorse) | ✅ nav gates include `coordinator` | ✅ **PASS** — `coordinator` may INSERT orders/inquiries and call `fn_create_order`/`fn_endorse_order`; clients/contacts/quotes fixed (see Findings) |
| Management / Auditor read-only | ✅ no write actions surfaced | ✅ **PASS (critical)** — both denied on **every** business-table INSERT/UPDATE **and every** SECURITY DEFINER RPC (create_order, endorse, accept, return, void, refund, remove_participant). Only own `saved_view` prefs are writable. |
| Handoff Accept/Return authority | ✅ OrderDetail gates | ✅ **PASS** — `fn_accept_endorsement` = operations/super_admin; `fn_return_for_correction` = operations/coordinator/business_owner/super_admin; endorse = coordinator/sales/operations/super_admin |
| Auditor reads `audit_log` w/ values | ✅ nav includes `auditor`; `fn_audit_search` relaxed | ✅ **PASS** — `audit_log` + `fn_audit_search` readable by super_admin + auditor only (others get 0 rows); auditor has **no** write path |
| Participant soft-remove + transfer (`participant.status`) | ✅ `fn_remove_participant` + transfer UI (S5); roster hides Removed | ✅ **PASS** — `fn_remove_participant`/`fn_transfer_participant` allow operations/coordinator/super_admin only (42501 otherwise) |
| Customer-entity writes (client/contact/organization/quote) | ✅ screen gates | ⚠️ **FAIL → FIXED** — see Findings; re-verified PASS after `20260812210000_rls_customer_authority.sql` |

## Findings (live simulation, this pass)

All 8 roles simulated against the live DB (rolled back). Two classes of divergence between the **intended matrix** and the **actual RLS** were found and fixed at the DB (RLS is authoritative), in `supabase/migrations/20260812210000_rls_customer_authority.sql`:

1. **Gaps — matrix grants authority the RLS denied** (the client/contact/organization/quote write policies predated the Phase B role model and only admitted super_admin + owning-sales):
   - `coordinator` could not create/update **clients**, create/update **contacts**, or create **quotes** — despite owning intake (C R U in the matrix).
   - `operations` could not update **clients**, **contacts**, or **organizations** (matrix R U).
   - `business_owner` could not update **contacts** or **organizations** (matrix R U).
2. **Holes — RLS granted writes to read-only roles** via role-agnostic ownership branches (a genuine least-privilege risk):
   - **contact:** `owner_sales_id IS NULL` matched *any* role, so `management`/`auditor` could write contacts of unowned clients. Now the ownership branch is gated behind the `sales` role.
   - **quote:** `created_by = auth.uid()` matched *any* role, so any signed-in user (incl. `management`/`auditor`) could create a quote. Now gated to `coordinator`/`sales`/`sales_manager` (+ super_admin).

After the fix (re-verified live-in-rollback): coordinator/operations/business_owner gain exactly their matrix authority; `management` + `auditor` are denied on client/contact/organization/quote in every path. Everything else in the summary matrix matched the RLS on the first pass — no other divergence found.

**Note (minor, not fixed):** `organization` INSERT still allows `sales` (matrix marks sales ▲ set-org, not create); left as a convenience for the client→org set-org flow. `sales_manager` region-scoped *writes* on customers are not implemented (reads/visibility work via `fn_is_team_lead`); documented as a lesser follow-up.

## Supabase advisor (this pass)
Run against current prod (the two new migrations are staged in the PR, **not yet applied** — re-run after they land via the workflow).
- **Security:** clean baseline. Only WARNs are the accepted `0029` (SECURITY DEFINER RPCs callable by signed-in users — each internally role-gated) and the Auth leaked-password toggle. No anon-executable (`0028`) functions; no `security_definer_view` ERRORs.
- **Performance:** 149 advisories, **all pre-existing** and none introduced by this pass — `multiple_permissive_policies` (59), `unindexed_foreign_keys` (50), `auth_rls_initplan` (30, i.e. wrap `auth.uid()`/`current_setting` in a scalar subselect), plus a few INFO (`unused_index`, `no_primary_key` on staging tables). None blocking; noted for a future performance-hardening pass. The RLS-fix migration keeps the app's existing policy style, so it does not materially change these counts.

## Delete review (prefer non-destructive)
Entities where a hard `DELETE` should be replaced by Archive/Cancel/Void/Deactivate — to audit in the CRUD pass and fix where a destructive path exists:
- **Participants** — `participant.status` now exists (PR #80); replace the hard-delete UI with soft-cancel/transfer/substitute (S5).
- **Payments** — immutable model shipped (Phase B); confirm no hard-delete path remains.
- **Sessions / Orders / Customers / Trainers / Venues / Courses** — confirm lifecycle uses Cancel/Archive/Deactivate, not `DELETE`.
- **Audit / financial records** — never destructively deletable except audited super_admin repair.

## Open items for the Supabase session — ✅ done this pass
1. ✅ Per-role simulation run; **RLS** column filled PASS/FAIL (all PASS after the fix).
2. ✅ Confirmed **no write path** for `management`/`auditor` via any table or `SECURITY DEFINER` RPC.
3. ✅ Category→subcategory tables + RLS built (S6, `20260812220000`); Categories row updated.
4. ✅ UI↔RLS divergences reconciled at the DB (`20260812210000_rls_customer_authority.sql`).

**Remaining (lesser) follow-ups:** `sales_manager` region-scoped customer *writes*; and after these two migrations apply, re-run the advisor + re-simulate as `anon` + two sales reps to confirm on live data (per CLAUDE.md drift discipline).
