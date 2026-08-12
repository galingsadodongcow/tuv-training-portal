# Final UAT — summary

Final live-product validation pass for the TÜV Rheinland Academy Training Operations & Sales Hub. Not another redesign — validate the finished system, confirm production matches `main`, trace real employee use, fix remaining friction, decide GO/No-Go.

**Method note:** this pass ran in the **code-review session (no Supabase access, no authenticated browser)**. Workflows were validated by tracing the actual screens/hooks on `main` and the migrations in-repo; live schema state, the 8-role RLS simulation, and the advisors were validated in the **separate Supabase session** (recorded in `docs/implementation/role-crud-matrix.md`) and are cited here, not re-executed.

## Overall verdict: **GO.** The one blocker cleared — migrations applied + verified live.

The product is coherent, light, and role-appropriate at the code level; `tsc` + build pass; no unsafe delete; handoff works; health is consistent. The one blocker was operational, not code — and it is now closed: both migrations are **applied to production, recorded in the migration ledger, and re-verified with a live 8-role RLS simulation** (see `01` and `docs/implementation/role-crud-matrix.md`).

| Area | Status |
|---|---|
| **Production DB matches `main`** | ✅ **CONFIRMED** — both migrations applied via the workflow; ledger reconciled (46 rows) (`01`). |
| **Critical migrations live** | ✅ `rls_customer_authority` + `s6_category_hierarchy` applied + verified; `perf_hot_fk_indexes` added. |
| **Role / RLS** | ✅ all 8 roles + `anon` + two `sales` reps PASS in live-rollback simulation on the **applied** schema. |
| **Management / Auditor truly read-only** | ✅ RLS denies all writes; **UI leaks fixed this pass** (Inquiries/Worklist/comment/upload). |
| **No unsafe financial delete** | ✅ all removals are reason-carrying RPCs / status flips. |
| **Sales → Operations handoff** | ✅ completeness gate + mandatory reasons enforced in UI *and* DB. |
| **Session health consistent** | ✅ single source (`v_session_health`); pill identical across surfaces. |
| **Operations usability** | ✅ coherent scheduling system (all calendar views, 2-field session create, full participant lifecycle). |
| **Sales usability** | ✅ focused CRM (lean capture + now-editable qualification, quote→order no-retype). |
| **TypeScript / build** | ✅ clean / compiles. |
| **Accessibility** | ✅ no regression (dialogs, aria-labels, focus, empty/error states hold). |
| **Security advisor** | ✅ clean baseline, **re-run on the applied schema** — no ERRORs, no `0028`, no `security_definer_view`; `category`/`subcategory` policied. |
| **Performance advisor** | ✅ 150 advisories classified; hot FKs indexed in `20260812230000_perf_hot_fk_indexes`, the rest deferred to a perf pass (`06`). |

## Operations usability verdict
Feels like a training-management/scheduling system. My Work (actions) and Calendar (when) are cleanly split; creating a session is a 3-field task; the participant lifecycle is fully non-destructive; session health is one number shown the same everywhere. **GO.**

## Sales usability verdict
Feels like a focused training CRM. Lean lead capture, and — fixed this pass — qualification is editable afterwards so the weighted pipeline works. Quote→order is review-not-re-entry; handoff is well-gated; sales never needs Operations admin. Deferred: sales-scoped My Work queues and "next run" search ordering (`08`). **GO.**

## Management / Auditor verdict
RLS denies every write; the UI write-control leaks found this pass are fixed. Both are concise and read-only. Re-confirmed on the applied schema: management/auditor `DENY` on every `contact`/`quote` path (incl. unowned-client contact and `created_by`=self quote). **GO.**

## Top remaining friction (all deferred, `08`)
1. Coordinator UI under-grants (couple to the migration going live).
2. Sales My Work queues (inquiries/quotes/returned orders) + "next run" search ordering.
3. Finish S6 adoption so Calendar/Reports use the hierarchy, then retire free-text `course.category`.

## Fixes applied during UAT (`07`)
Inquiry write-gating + Edit surface; Worklist advance gating; OrderDetail comment + Attachment upload gating; RosterPanel invalidation. All frontend-only, green.

## Deferred (`08`) and known risks
The `contact`/`quote` RLS hole is **closed in production** — `20260812210000` is applied and re-verified live (management/auditor denied on every write path). No material risk remains open.

## GO / No-GO recommendation
**GO.** The single blocker cleared:
1. ✅ Applied `20260812210000_rls_customer_authority` + `20260812220000_s6_category_hierarchy` via the workflow.
2. ✅ Ledger reconciled + `relrowsecurity` confirmed (54/54); re-simulated all 8 roles + `anon` + two `sales` reps on the applied schema (all PASS).
3. ✅ Re-ran the security + performance advisors on the applied schema (security clean; performance classified, hot FKs indexed).

Recommendation is **GO** for normal business use. No blocker remains on `main` or in production. Remaining items are non-blocking follow-ups (`08`): sales-scoped My Work queues, "next run" search ordering, finishing S6 adoption (Calendar/Reports), the deferred performance pass, and the Auth leaked-password toggle (dashboard).
