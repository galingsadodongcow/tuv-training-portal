# Handoff Verification Report

Response to `HANDOFF_TO_CLAUDE_CODE.md`. **Important scope limit:** this session
has **no access to the live Supabase DB** (ref `ruwuqzwtwngpcauzbrqj`) — no
connector, and the `SUPABASE_DB_URL` secret used by the apply workflow is not
set. So every "live" check below was run against a **local Postgres
reconstruction** built from `supabase/schema.sql` + all repo migrations + the
seed. That reflects *what the repo says*, not the live ledger. Anything that must
be confirmed against production is flagged **LIVE-UNVERIFIED**.

## Repo vs. handoff discrepancies found

| Handoff claim | Reality in repo |
|---|---|
| `20260809000000_qa_live_hardening.sql` is "in the repo as a file" | **Not present.** No `20260809*` migration exists. Content lives only on the live DB (per handoff) and cannot be reproduced from here. |
| `20260809010000_qa_function_grants.sql` in repo | **Not present.** Same as above. |
| Task 3 source `docs/qa/ROLE_JOURNEY_MAPS.md` | **Not present.** Fixes were taken from the inline descriptions in the handoff. |
| "repo has 30 migration files" | Confirmed — 30 files. |

## Task 1 — S3/S4/S5/S6 (from `20260808300000_rls_ownership.sql`)

Simulated as two different sales reps (S-01 / S-03) on the reconstruction.

| Finding | Check | Result (reconstruction) |
|---|---|---|
| S3 quotes | rep B `update quote set discount_pct=100` on rep A's quote | `UPDATE 0` (blocked); rep A updates own → `UPDATE 1` |
| S3 quotes | rep B delete rep A's quote | `DELETE 0` (blocked) |
| S4 order_line | rep B insert `order_line` on rep A's order | blocked (rep B can't even read the order → source row invisible; `with check` also gates it) |
| S5 interaction | rep B insert `client_interaction` with rep A's `sales_id` | RLS violation (blocked); own `sales_id` → allowed |
| S6 reminders | plain sales user calls `fn_queue_reminders()` | raises "limited to operations and above" |

**Verdict:** the migration file is correct — applied to a clean DB it produces the
intended owner-scoping. **LIVE-UNVERIFIED:** the handoff states the live ledger
does not list `20260808300000`, which implies it is **probably not applied on
production**. Cannot confirm from here. **Action for Alan:** apply the existing
repo migrations to the live DB via `.github/workflows/apply-supabase.yml` (needs
`SUPABASE_DB_URL`), then re-run these four checks as anon + two reps + the Supabase
advisor before calling S3–S6 closed.

## Task 2 — frontend fixes actually in `src/`

All present, build green, smoke tests pass.

| Fix | Present |
|---|---|
| X1 Confirm on 6 destructive deletes | ✅ `useConfirm` in ReceivablePanel, PricingRules, QuoteDetail, AttachmentsPanel, ContactsPanel, TrainerManage |
| X2 error states (Reports/Quality/Communications/Feedback) | ✅ `ErrorNote` branches present |
| U1 `scroll-x` wrappers | ✅ ReceivablePanel, AttachmentsPanel, ContactsPanel, SessionDetail, globals.css |
| A2 keyboard-operable quotation rows | ✅ `role="button" tabIndex={0}` + Enter/Space |
| A3 dialog semantics + Escape | ✅ Confirm.tsx `role=dialog aria-modal` + Escape handler |
| A1/A1r/A4 aria-labels | ✅ present across AuditLog/Admin/SalesEntry/Resources/etc. |
| X3 `window.prompt` → Confirm | ✅ no `window.prompt` in Inquiries |

- `npm run build` → **Compiled successfully, 30/30 pages**.
- `npm run test:e2e` (`e2e/smoke.spec.ts`, ran against a local `npm start`, using
  the preinstalled Chromium) → **7/7 passed** (login renders, root resolves, and
  5 protected routes redirect to /login).

## Task 3 — journey-map fixes (applied, build green)

| ID | Change | File |
|---|---|---|
| BO2 🟠 | Removed hardcoded `YEAR=2026`; derive from `useActiveYear()` (highest active year) with a current-year fallback; subtitle now interpolates the year | `src/screens/Dashboard.tsx` |
| S4 🟡 | `who` default now `mine` only for a **non-supervisor** selling rep; supervisors (and non-sellers) default to `all` | `src/screens/Worklist.tsx` |
| OP4 🟡 | Added a readiness banner at the top of the Cancel modal: "N of M bookings still need a disposition …" (uses existing `v_cancel_readiness` data) | `src/components/CancelSession.tsx` |
| S2 🟡 | **No change needed** — the session picker already renders `booked/min booked · N left — full, joins waitlist` per option, before selection; placement verified | `src/screens/SalesEntry.tsx` |

## Task 4 — `fn_enforce_pax` decision (both drafts, NOT applied)

Two mutually-exclusive draft migrations. **Do not apply until Alan picks one.**
Both validated on the reconstruction:

| Draft | Behaviour verified (insert schedule with explicit max=5, min=3) |
|---|---|
| `20260809020000_pax_option_a_course_derived.sql` | overwritten to course defaults → `max=20 min=8` (course authoritative). If chosen, also make SessionForm max/min read-only. |
| `20260809030000_pax_option_b_per_session.sql` | respected → `max=5 min=3` (per-session cap; venue guard is the hard ceiling). |

These are **not** in the migration bundle and the apply workflow does not run
individual files, so neither auto-applies.

## Not done this pass (need Alan / live access)

- Recreating `20260809000000` / `20260809010000` as repo files — their validated
  content is only on the live DB; cannot reproduce without reading it.
- Applying any migration to the live DB (blocked on `SUPABASE_DB_URL`).
- Task 4 second item (`orders.modality/seats/amount_php` NOT NULL), task 5
  (payment_status vs AR, leaked-password toggle, mutable search_path on 3 trigger
  fns) — decisions/lower-priority; left for a follow-up once a live path exists.
