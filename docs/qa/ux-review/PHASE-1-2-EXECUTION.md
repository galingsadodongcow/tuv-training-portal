# Phase 1 & 2 execution log

What was implemented from the redesign roadmap (autonomous execution), what was deliberately deferred, and why. Governing rule for this pass: **correctness-first and non-destructive** — land every well-bounded, validated fix and every *additive* structural improvement; defer anything whose blast radius (deleting screens, changing the CRM data model) is too large to auto-merge into a live app unsupervised.

All database changes were validated against the **live production schema** in a rolled-back transaction (Supabase MCP `BEGIN…ROLLBACK`) before applying — not just the local reconstruction — so the repo↔live drift risk is eliminated for this pass.

## Shipped — Phase 1 (workflow integrity / correctness)

| Item | What | Validation |
|---|---|---|
| **Order stage state machine** | `fn_orders_stage_guard` BEFORE UPDATE trigger enforces the legal `fulfillment_stage` graph (forward moves, cancel, no-feedback, reopen); **system context and super_admin bypass** so nightly hygiene and admins are never blocked. | Live dry-run: illegal backward move → 42501; forward move → allowed. |
| **Participant dedup** | `fn_participant_dedup_guard` BEFORE INSERT blocks a second same-email add to a session. INSERT-only, so transfers (UPDATE) are unaffected; grandfathers existing data (0 dups live). | Live dry-run: duplicate add → 23505. |
| **Reminders wired** | `fn_nightly_hygiene` now calls `fn_queue_reminders` (previously dead code) — session + payment reminders queue into `comms_log`. **No emails send**: `send-comms` is not scheduled (verified `cron.job`), so this only populates the queue. Guarded so a reminder error can't abort hygiene. | Function recreated from the real live body + one line. |
| **Quote auto-expire** | `fn_nightly_hygiene` expires `Sent` quotes past `valid_until` that were never converted. | — |
| **`fn_merge_orders`** | Real duplicate reconciliation (ops/super_admin only): cancels the duplicate order + its lines so seats/revenue stop double-counting (rollup triggers recompute), closes the `duplicate_candidate`. Duplicates screen now calls this with a keep/cancel chooser + danger confirm, replacing the flag-only "merge". | Live dry-run: dup → Cancelled, 0 uncancelled lines. |
| **`v_session_health`** | One computed health level per session (Healthy / Needs Attention / At Risk / Blocked), proximity-weighted so it isn't all-yellow. security_invoker. | Live distribution sane: Healthy 30 / Needs Attention 29 / At Risk 5 / Completed 96 / Cancelled 1. |
| **SessionForm P0 fix** | min/max participant inputs are now editable (default from course), and the form value is submitted — restoring the per-session-cap the DB migration allows. Status picker restricted to Tentative/Confirmed so users can't hand-set `Completed` and bypass `fn_close_session`. | tsc + build. |

## Shipped — Phase 2 (additive IA & structure)

| Item | What |
|---|---|
| **Grouped navigation** | The flat 23-item rail is now grouped (Home · My Work · Sales · Operations · Customers · Oversight · Insights · Admin), rendered as section headers, role-filtered as before. Additive — every route and role gate is preserved. |
| **My Work** | New `/my-work` screen + route (all roles): tasks assigned to me, approvals to decide, orders needing attention, sessions needing attention (via `v_session_health`), and SLA breaches — a single operational surface built additively (Home is untouched). |
| **Notification center** | A header bell with an unread count + a dropdown panel (read/unread, deep-links to the record, mark-one/mark-all read, Escape/outside-click close). Reads the existing `notification` table. |
| **Session health surfaced** | Health pill on the session detail header and a health cue on the calendar, from the shared `src/lib/health.ts` renderer. |

## Deferred (with rationale) — not merged this pass

| Item | Why deferred |
|---|---|
| **Central customer record** (unify Client + Organization + Inquiry; add `inquiry.client_id`) | A CRM data-model change touching every customer screen and existing data. Needs product decisions on lead↔customer linking and a data backfill — not safe to auto-merge unsupervised. |
| **Fold/delete DataQuality & Duplicates screens; consolidate Dashboard/Reports/Quality into one Analytics area** | Deleting/merging working screens is destructive and high-regression. Nav grouping already improves the IA additively; the consolidation is a reviewed refactor. |
| **Endorsement completeness gate** | Blocking the Endorse-to-Ops transition on required-field completeness risks blocking legitimate endorsements without a careful field spec + override UX. Needs a defined completeness contract first. |
| **Ops intake permission change** (let operations open Inquiries / New sales order) | A permission/RLS change (who can write inquiries/orders) that must be verified as anon + each role before shipping. |
| **Breadcrumbs** | Lower-value; every extra shared-shell edit is blast radius. The record back-link + grouped nav cover orientation for now. |
| **Refund / void / credit model; four-axis status UI; dual-ownership UI** | Larger designs (finance decisions; `schedule.operations_owner`/`sales_owner` columns exist but wiring the UI is a separate change). |

## How it was applied
Frontend merges via the normal branch → PR → Netlify build. The Phase-1 migration is appended to `supabase/bundles/2026_program_all_migrations.sql` and applied through the `apply-supabase.yml` workflow (idempotent), then re-verified with the Supabase security/performance advisors.
