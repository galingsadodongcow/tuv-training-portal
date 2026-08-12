# 09 — Post-apply alignment (blocker cleared)

The two pending migrations were **applied and verified in the Supabase session** (per the operator; this code session has no Supabase access to re-check the live DB). With production schema now matching `main`, the final-UAT blocker is cleared and the coupled frontend follow-up (deferred item §2/§3) is shipped here.

## Blocker — cleared
- `20260812210000_rls_customer_authority` and `20260812220000_s6_category_hierarchy` applied via the workflow; ledger + role re-simulation + advisors handled in the Supabase session. The two least-privilege holes (management/auditor writing `contact`/`quote`) are now closed in production.

## Coordinator/operations UI widened to match the now-live RLS
Now that the RLS is live, the UI gates that were intentionally held back are opened to exactly the roles the live policies allow (row-scoping still enforced by RLS):

| Screen | Before | After | Matches RLS |
|---|---|---|---|
| `Quotations` / `QuoteDetail` `canEdit` | super_admin, sales | + **coordinator** | quote write = super_admin/coordinator/sales(own) |
| `OrganizationDetail` `canEdit` | super_admin, sales | + **coordinator, operations, business_owner** | org UPDATE + client set-org widened to these |
| `ClientDetail` `canSetOrg` | super_admin, owning-sales | + **coordinator, operations, business_owner** | client UPDATE widened |
| `roles.ts` Quotations nav | (no auditor) | + **auditor** (read) | matrix ▲ |

## Mismatch the migration *introduced* — found & fixed
The customer-authority migration split `contact` into I/U/D and **narrowed DELETE to super_admin + coordinator** (previously a sales rep could delete their own client's contacts). So `ContactsPanel`'s "Remove" shown to `sales` became a dead button. Fixed by splitting the panel's gate:
- **Add contact** (INSERT): super_admin, coordinator, sales.
- **Remove contact** (DELETE): super_admin, coordinator only.
- Interaction log (`client_interaction`, untouched by the migration) kept its original super_admin/sales gate — not widened blindly.

## Deliberately NOT done
- **Organization create** stays super_admin + sales — the migration left `organization` INSERT unchanged, so widening create would re-introduce a mismatch. Only org *update* + client set-org were widened.
- **Client core-field edit form** — the Overview is still read-only `KeyVal`s for all roles; adding an edit form is a net-new capability, not a gate widening. Remains a follow-up.
- **Contact soft-remove** (vs hard delete) still wants a `contact.status` column — DB follow-up.

## Verdict
With the blocker cleared and the UI aligned, the recommendation moves from CONDITIONAL GO to **GO** for normal business use. `tsc` + `build` green.
