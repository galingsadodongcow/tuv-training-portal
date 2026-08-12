# Role / CRUD authority matrix

The authority every role should have over every major entity, and its validation status. This is the **target** the application must match, taken from the approved second-pass permission model (`docs/ux-second-pass/02-role-model-and-permissions.md`) as implemented by Phase B (roles `super_admin, coordinator, operations, business_owner, sales, sales_manager, management, auditor`; migrations `20260812100000_phaseb_roles_enum.sql`, `20260812110000_phaseb_role_rls.sql`).

**Legend:** C create · R read · U update · D delete/❌ (prefer Archive/Cancel/Void/Deactivate) · As assign/reassign · Ap approve · X export · ● scoped (own/team) · ▲ read-only · ✔ full · ✖ none.

**Validation columns:**
- **UI** — confirmed from `src/lib/roles.ts` nav gates + screen `canEdit`/role guards (static, done this pass).
- **RLS** — authoritative DB check by simulating as each role. **⏳ = pending: requires a Supabase-enabled session** (`BEGIN…ROLLBACK` + per-role simulation). The MCP validator is not enabled in the working chat, so no cell below is marked RLS-verified yet.

> Method for the Supabase session: for each (role, entity) below, set the JWT role/claims, attempt each operation, and confirm allow/deny matches this table. Record PASS/FAIL per cell; fix any UI↔RLS divergence at the DB (RLS is authoritative — the UI gate is cosmetic).

## Summary matrix (intended authority)

| Entity | super_admin | coordinator | operations | business_owner | sales | sales_manager | management | auditor |
|---|---|---|---|---|---|---|---|---|
| **Courses** | CRUD | ▲ | CRU (D→deactivate) | ▲ | ▲ | ▲ | ▲ | ▲ |
| **Categories/Subcategories** *(today: free-text `course.category`; hierarchy is DB TODO)* | CRUD | ✖ | CRU | ▲ | ▲ | ✖ | ▲ | ▲ |
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

| Area | UI gate (roles.ts / screen) | RLS |
|---|---|---|
| Nav visibility per role (all entities) | ✅ confirmed — see `NAV` in `roles.ts` | n/a (cosmetic) |
| Sales blocked from `payment_status`/`sap_order_no` | ✅ UI hides + `fn_guard_orders_sales_fields` (42501) | ⏳ re-sim as `sales` |
| Refund/void limited to BO/super_admin | ✅ ReceivablePanel gates | ⏳ re-sim as `operations`,`coordinator` |
| Coordinator intake (Inquiries/New order open) | ✅ nav gates include `coordinator` | ⏳ re-sim as `coordinator` |
| Management / Auditor read-only | ✅ no write actions surfaced | ⏳ **critical** — confirm no write path via any RPC as `management`/`auditor` |
| Handoff Accept/Return authority | ✅ OrderDetail gates | ⏳ re-sim as `operations` |
| Auditor reads `audit_log` w/ values | ✅ nav includes `auditor`; `fn_audit_search` relaxed | ⏳ re-sim as `auditor` (and confirm no writes) |
| Participant soft-remove + transfer (`participant.status`) | ✅ built — `fn_remove_participant` + transfer UI (S5); roster hides Removed | RPC self-gates to ops/coordinator/super_admin (42501); ⏳ confirm via live re-sim |

## Delete review (prefer non-destructive)
Entities where a hard `DELETE` should be replaced by Archive/Cancel/Void/Deactivate — to audit in the CRUD pass and fix where a destructive path exists:
- **Participants** — `participant.status` now exists (PR #80); replace the hard-delete UI with soft-cancel/transfer/substitute (S5).
- **Payments** — immutable model shipped (Phase B); confirm no hard-delete path remains.
- **Sessions / Orders / Customers / Trainers / Venues / Courses** — confirm lifecycle uses Cancel/Archive/Deactivate, not `DELETE`.
- **Audit / financial records** — never destructively deletable except audited super_admin repair.

## Open items for the Supabase session
1. Run the per-role simulation and fill the **RLS** column PASS/FAIL.
2. Confirm **no write path** exists for `management` and `auditor` via any `SECURITY DEFINER` RPC (the highest-risk least-privilege check).
3. Build the category→subcategory tables + RLS; update the Categories row above.
4. Reconcile any UI↔RLS divergence found (fix at the DB).
