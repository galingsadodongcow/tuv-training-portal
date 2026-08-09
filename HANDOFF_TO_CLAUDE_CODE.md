# Handoff to Claude Code — TÜV Academy Portal QA

You are picking up a live QA pass on the TÜV Rheinland Academy training portal.
Work in the repo `tuv-training-portal` (Next.js App Router + TypeScript, v2.0.0).
This brief is self-contained. Read it fully before touching anything.

## Environment

- Live site: https://tuv-training-portal.netlify.app/ (JS shell only before login).
- Supabase project ref: `ruwuqzwtwngpcauzbrqj`.
- Frontend: `src/app/(app)/**/page.tsx` route files wrap `src/screens/*.tsx`.
  Route role gates live in `src/components/Guard.tsx` + `src/lib/roles.ts`.
- DB: `supabase/migrations/*` (30 files), `supabase/schema.sql`, seeds in
  `supabase/seed/`. CI applier: `.github/workflows/apply-supabase.yml`.

## The one thing you must internalize first

**The repo and the live database have drifted.** The repo carries 30 migration
files and a prior QA report (`docs/qa/QA_AUDIT_REPORT.md`) marking everything
"fixed and re-validated." The live Supabase migration ledger records only 5
applied entries. Most hardening reached the DB through manual bundle pastes, but
two security holes were live and open until 2026-08-09.

**Never trust "fixed in the repo." Verify against the live DB and a role-scoped
query every time.** Use the Supabase advisor and simulate as anon / sales /
operations before believing a policy holds.

## Already fixed and verified live (2026-08-09)

Two migrations were applied to the live DB and are in the repo as files:

- `supabase/migrations/20260809000000_qa_live_hardening.sql`
  - H1 CRITICAL: `audit_log` SELECT policy was `using(true)` → anon key read all
    change rows incl. client name/email/phone in `new_data`. Now scoped to
    `super_admin`. Verified: anon 0, sales 0, admin all.
  - H3: venue capacity guard rebound to fire on all writes.
- `supabase/migrations/20260809010000_qa_function_grants.sql`
  - H2 HIGH: anon could execute `fn_global_search`, `fn_org_summary`, `fn_funnel`,
    `fn_audit_search`, `fn_ar_recompute` etc. via a PUBLIC grant. Revoked EXECUTE
    from PUBLIC; re-granted to `authenticated` where the app needs it; internal
    plumbing locked. Verified: anon blocked, sales still works, advisor
    anon-exec warnings gone.
  - security_invoker set on `v_cert_expiring`, `v_quote_total`,
    `v_session_feedback`, `v_trainer_quality`.

These are idempotent. If they are not yet committed, commit them (branch
`claude/qa-live-hardening-20260809`).

## Business logic validated (do not re-litigate)

Capacity guard, trainer double-booking, close (blocks on unmarked attendance,
forced close writes actuals + locks roster), transfer guard, certificate
issuance (ops-only, Attended-only), discount engine, rollover (role-gated, copies
160 sessions), and the full waitlist chain (Waitlist lines bypass the guard,
FIFO auto-promote on freed seats, owner notified). All pass.

## Your task list, in order

### 1. Verify prior-agent RLS claims that are NOT in the live ledger

`docs/qa/FIX_PLAN.md` claims migration `20260808300000_rls_ownership.sql` applied
findings S3, S4, S5, S6 (quote owner-scoping, order_line INSERT check, contact/
interaction owner-scoping, `fn_queue_reminders` role gate). That migration is a
repo file but the live ledger does not list it. Verify each against the live DB
by simulating as two different sales reps. For each that is not actually live,
apply it. Suggested checks:

- As rep B, attempt `update quote set discount_pct=100` on rep A's quote → must
  be 0 rows.
- As rep B, attempt to insert `order_line` on an order rep B does not own → must
  be blocked by `with check`.
- As rep B, insert a `contact` / `client_interaction` on rep A's client → must
  be blocked.
- As a plain sales user, call `fn_queue_reminders()` → must raise, not run.

### 2. Confirm the frontend fixes are in the deployed build

`docs/qa/FIX_PLAN.md` marks these applied in code: Confirm dialogs on 6
destructive deletes (X1), error states on Reports/Quality/Communications/Feedback
(X2), `scroll-x` wrappers (U1), keyboard-operable quotation rows (A2), dialog
semantics + Escape (A3), aria-labels (A1/A1r/A4), `window.prompt` → Confirm (X3).
Grep the current `src/` to confirm each is present, then run `npm run build` and
`npm run test:e2e` (Playwright, `e2e/smoke.spec.ts`). Report any that are missing.

### 3. Implement the UI/UX journey-map fixes

Source: `docs/qa/ROLE_JOURNEY_MAPS.md`. Priority order:

- **BO2 (🟠):** `src/screens/Dashboard.tsx` hardcodes `const YEAR = 2026`. Derive
  the year from the active `calendar_year` (status = 'Active'), or add a year
  switch. This goes stale in Jan 2027.
- **S4 (🟡):** `src/screens/Worklist.tsx` defaults the "who" filter to `mine` for
  supervisors, landing them on their own queue. Extend the non-seller default so
  supervisors (`is_supervisor`) also default to `who=all`.
- **OP4 (🟡):** surface `v_cancel_readiness` inside the CancelSession modal so ops
  sees the missing dispositions before clicking.
- **S2 (🟡):** confirm the session picker in `SalesEntry.tsx` shows fullness
  before selection (the `left`/`full` render already exists — verify placement).

### 4. Resolve the two business decisions (ask Alan, do not guess)

- **`fn_enforce_pax` overwrites `max_participants`** on every write (course default
  or fallback) and forces `min_participants = 8`. This blocks per-session caps and
  makes the venue guard moot on that column. Two paths:
  - Course-derived: make the `max_participants` field read-only in `SessionForm`
    and label it "from course."
  - Per-session: drop the `max_participants` overwrite in `fn_enforce_pax` (keep
    min if wanted) and let the venue guard enforce the ceiling.
  Draft both as separate migrations so Alan picks one.
- **`orders.modality`, `orders.seats`, `orders.amount_php`** are still NOT NULL on
  the header after the multi-line split moved them to `order_line`. Dead,
  redundantly populated columns and an insert trap. Propose a migration to make
  them nullable (safer) or drop them (cleaner, needs a code sweep of
  `SalesEntry.tsx` and any header insert paths first).

### 5. Data-integrity cleanup (low priority)

- `payment_status` is settable on an order independent of the AR ledger. EL-002
  shows status Paid, invoiced 0, paid 0, balance 7,000. Either record the missing
  payment/invoice or derive `payment_status` from AR only. Decide with Alan.
- Enable leaked-password protection in Supabase Auth (dashboard toggle, not a
  migration).
- 3 trigger fns (`fn_stage_stamp`, `fn_norm_org`, `fn_touch_updated_at`) have a
  mutable search_path. Add `set search_path = public` when convenient.

## Guardrails

- Every DB change is a migration file in `supabase/migrations/`, applied through
  `.github/workflows/apply-supabase.yml`. **Stop pasting bundles by hand.** That
  is the drift that hid H1 and H2.
- Test destructive logic in a transaction and roll back. Never leave QA rows in
  the live DB.
- After any RLS or grant change, re-run the Supabase advisor and simulate as anon
  and as sales before calling it done.
- The `audit_log` table and its policy exist only on the DB, not in any repo
  migration before 20260809. Keep it that way in sync going forward.

## Deliverables to produce

- A short verification report: for task 1 and 2, which claims held live and which
  did not.
- Migrations for anything you had to newly apply.
- The BO2/S4/OP4 frontend fixes with `npm run build` passing.
- Two draft migrations for the `fn_enforce_pax` decision (both options).
- A git command summary for everything staged.
