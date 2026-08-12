# Final UAT — summary

Final live-product validation pass for the TÜV Rheinland Academy Training Operations & Sales Hub. Not another redesign — validate the finished system, confirm production matches `main`, trace real employee use, fix remaining friction, decide GO/No-Go.

**Method note:** this pass ran in the **code-review session (no Supabase access, no authenticated browser)**. Workflows were validated by tracing the actual screens/hooks on `main` and the migrations in-repo; live schema state, the 8-role RLS simulation, and the advisors were validated in the **separate Supabase session** (recorded in `docs/implementation/role-crud-matrix.md`) and are cited here, not re-executed.

## Overall verdict: **CONDITIONAL GO** — GO once one blocker clears.

The product is coherent, light, and role-appropriate at the code level; `tsc` + build pass; no unsafe delete; handoff works; health is consistent. The **one blocker is operational, not code**: two migrations are merged but recorded as **not yet applied to production**, and one of them closes a live security hole.

| Area | Status |
|---|---|
| **Production DB matches `main`** | ⚠️ **UNCONFIRMED** — 2 migrations merged, not confirmed applied (`01`). Primary GO gate. |
| **Critical migrations live** | ⚠️ `rls_customer_authority` + `s6_category_hierarchy` pending apply+verify. |
| **Role / RLS** | ✅ all 8 roles PASS in live-rollback simulation *after* the pending fix; ⚠️ re-verify on the applied schema. |
| **Management / Auditor truly read-only** | ✅ RLS denies all writes; **UI leaks fixed this pass** (Inquiries/Worklist/comment/upload). |
| **No unsafe financial delete** | ✅ all removals are reason-carrying RPCs / status flips. |
| **Sales → Operations handoff** | ✅ completeness gate + mandatory reasons enforced in UI *and* DB. |
| **Session health consistent** | ✅ single source (`v_session_health`); pill identical across surfaces. |
| **Operations usability** | ✅ coherent scheduling system (all calendar views, 2-field session create, full participant lifecycle). |
| **Sales usability** | ✅ focused CRM (lean capture + now-editable qualification, quote→order no-retype). |
| **TypeScript / build** | ✅ clean / compiles. |
| **Accessibility** | ✅ no regression (dialogs, aria-labels, focus, empty/error states hold). |
| **Security advisor** | ✅ clean baseline; ⚠️ re-run post-apply. |
| **Performance advisor** | 149 pre-existing, none blocking; a small FK-index migration is the only "now" item (`06`). |

## Operations usability verdict
Feels like a training-management/scheduling system. My Work (actions) and Calendar (when) are cleanly split; creating a session is a 3-field task; the participant lifecycle is fully non-destructive; session health is one number shown the same everywhere. **GO.**

## Sales usability verdict
Feels like a focused training CRM. Lean lead capture, and — fixed this pass — qualification is editable afterwards so the weighted pipeline works. Quote→order is review-not-re-entry; handoff is well-gated; sales never needs Operations admin. Deferred: sales-scoped My Work queues and "next run" search ordering (`08`). **GO.**

## Management / Auditor verdict
RLS denies every write; the UI write-control leaks found this pass are fixed. Both are concise and read-only. **GO** (re-confirm on applied schema).

## Top remaining friction (all deferred, `08`)
1. Coordinator UI under-grants (couple to the migration going live).
2. Sales My Work queues (inquiries/quotes/returned orders) + "next run" search ordering.
3. Finish S6 adoption so Calendar/Reports use the hierarchy, then retire free-text `course.category`.

## Fixes applied during UAT (`07`)
Inquiry write-gating + Edit surface; Worklist advance gating; OrderDetail comment + Attachment upload gating; RosterPanel invalidation. All frontend-only, green.

## Deferred (`08`) and known risks
The security hole in `contact`/`quote` RLS is **open in production until `20260812210000` is applied** — that is the single material risk, and it is the blocker below.

## GO / No-GO recommendation
**NO-GO until the one blocker clears; then GO.**

Minimum blockers (all in the Supabase session):
1. Apply `20260812210000_rls_customer_authority` + `20260812220000_s6_category_hierarchy` via the workflow.
2. Verify the ledger + `relrowsecurity`; re-simulate management/auditor/anon/2 sales reps.
3. Re-run the security + performance advisors on the applied schema.

Once those three pass, the recommendation is **GO** for normal business use. No code blocker remains on `main`.
