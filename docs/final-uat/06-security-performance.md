# 06 — Security & performance

## Security

### Code-level (this session)
- **No unsafe operational hard-delete path.** Every business/financial/history removal routes through a reason-carrying RPC or a status flip: `fn_remove_participant`, `fn_void_payment`, `fn_refund_payment`, `fn_merge_orders`; sessions cancel/close via `fn_cancel_schedule`/`fn_close_session`. All 11 `.delete()` calls in `src/` target config/join/draft rows (course_fee, session_trainer, order_assignment, quote_line, discount_rule, saved_view, attachment, trainer_course/availability) — none destroy a financial or history record. No destructive `delete from`/`drop table`/`truncate` on business tables in migrations. (Full table in `role-crud-matrix.md` delete review + the UAT delete audit.)
  - **One borderline:** `ContactsPanel.tsx:41` hard-deletes a `contact` (RLS-gated to super_admin/coordinator). Low-stakes reference row; softening it needs a `contact.status` column (DB) → deferred (`08`).
- **UI↔RLS mismatches fixed:** management/auditor no longer see write controls the RLS rejects (Inquiries/Worklist/OrderDetail comment/Attachments) — see `04`.

### Advisor (from `role-crud-matrix.md`, must be re-run after the migrations apply)
- **Security advisor: clean baseline.** Only accepted WARNs: `0029` (SECURITY DEFINER RPCs callable by signed-in users — each internally role-gated) and the Auth leaked-password toggle. No anon-executable functions (`0028`), no `security_definer_view` ERRORs.
- The `20260812210000_rls_customer_authority` migration **removes** two least-privilege holes; it is a security *improvement*. **Applying it is a GO precondition.**
- ⚠️ Re-run the security advisor on the applied schema (the recorded run predates the two new migrations).

## Performance

### Advisor classification (149 advisories, all pre-existing — none introduced by recent work)
Per `role-crud-matrix.md`:

| Class | Count | Impact | Action |
|---|---|---|---|
| `unindexed_foreign_keys` | 50 | **MEDIUM** — some affect frequent joins (orders, participants, schedule) | Add indexes on the hot FKs used by My Work / Calendar / Orders / Search in a focused perf migration (Supabase). Defer the cold ones. |
| `multiple_permissive_policies` | 59 | LOW–MEDIUM — extra policy evaluation per query | Consolidate overlapping permissive policies where cheap; not blocking. |
| `auth_rls_initplan` | 30 | LOW–MEDIUM — `auth.uid()`/`current_setting` re-evaluated per row | Wrap in a scalar subselect (`(select auth.uid())`). Mechanical; batch in the perf migration. |
| INFO (`unused_index`, `no_primary_key` on staging) | few | LOW | Defer. |

**Guidance (§6):** none blocks normal use. Do **not** launch a broad optimization exercise. The only "HIGH IMPACT NOW" candidates are the handful of unindexed FKs on the tables My Work / Calendar / Orders / Search join every load — fix those in one small perf migration in the Supabase session; defer the rest.

### Client-side (code)
No obvious N+1 or over-refetch in the hot paths; TanStack Query caches per key, and this pass tightened RosterPanel invalidation (no longer under- or over-invalidating). Row virtualization for very long lists remains an open backlog item (non-blocking; server-side pagination already covers Orders).
