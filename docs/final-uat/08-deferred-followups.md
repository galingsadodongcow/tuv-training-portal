# 08 — Deferred follow-ups

Ordered by priority. Each says why it was deferred (not done blindly).

## BLOCKER — must clear before GO (Supabase session)
1. **Apply + verify the two migrations on production.**
   - `20260812210000_rls_customer_authority` — closes two live least-privilege **holes** (management/auditor could write contacts/quotes). **Security fix; not optional.**
   - `20260812220000_s6_category_hierarchy` — category/subcategory tables.
   - Apply via `.github/workflows/apply-supabase.yml` (not hand-paste). Then: confirm the ledger + `relrowsecurity`; re-simulate as anon + management + auditor + two sales reps; **re-run the security AND performance advisors** on the applied schema. Cannot be done from the code session (no Supabase).

## High value — after the migration is live
2. **Widen coordinator UI writes to match the now-live RLS** (couple to #1): quote create/edit (`Quotations`/`QuoteDetail` `canEdit`), contact edit (`ContactsPanel`), set-org + a client core-field edit form. Deferred because doing it *before* the migration lands recreates a UI-shows-what-DB-rejects mismatch.
3. **Add auditor read access to Quotations nav** (`roles.ts`) — matrix grants ▲; minor under-grant, no security impact.

## Sales capability gaps (additions, not corrections)
4. **My Work sales queues** — open inquiries needing action, my quotes (Draft/Sent), and a distinct **returned-order** flag (today a returned order only shows if also stalled). A capability add; kept out of the correction pass.
5. **Training search for "next run"** (`fn_global_search` SQL + one client constant): order sessions upcoming-first (currently newest-first, so past dates rank first), add `course` kind for sales, and match `course.category`/subcategory. SQL → Supabase session.

## Operations / data-model
6. **Complete S6 adoption, then retire `course.category`** — Calendar filters + Reports still key on the free-text mirror; `subcategory_id` is write-only. Plan: (a) point Calendar/Reports at the `category`/`subcategory` tables and surface subcategory; (b) once nothing reads the free-text column, drop it in a migration. **Do not drop it yet** — it's still read in several places.
7. **Reconcile the two secondary risk computations** with the health pill — Calendar `riskClass()` and Operations today's `useDigest()` "at risk" can visually disagree with `v_session_health`. Pick one definition.
8. **`contact` soft-remove** — `ContactsPanel.tsx:41` hard-deletes (RLS-gated). Add a `contact.status` column + `fn_remove_contact` for parity with the participant/payment soft-delete stance. DB work.

## Consolidation / polish (judgement calls, need live preview)
9. **My Work ↔ Operations today** overlap (session-attention + approvals in both) — merge decision, not a blind cut.
10. **Screen-weight compact pass** on Calendar / Reports / SalesEntry — tighten with a live preview; don't over-thin useful density.
11. **Performance perf migration** — index the hot unindexed FKs (My Work / Calendar / Orders / Search joins); wrap `auth.uid()` in scalar subselects (`auth_rls_initplan`); consolidate cheap overlapping permissive policies. Batch as one migration; defer cold advisories. Non-blocking.
12. **Calendar drawer deep-link** (nice-to-have) — drawer state is local, not URL-driven, so a specific session's drawer isn't shareable.
13. **Row virtualization** for very long lists (existing backlog item; server pagination already covers Orders).
