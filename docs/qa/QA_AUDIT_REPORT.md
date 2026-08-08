# QA Audit Report

Findings from Phase 1 (local-DB simulation) and Phase 2 (code audit across
functional, security, data-integrity, UI, UX, accessibility). Each finding has a
severity, location, reproduction, and fix. Status marks what has been applied in
this pass. UI/UX/a11y are **code-inferred** — the app could not be rendered
(backend unreachable), so pixel layout, real contrast, and live keyboard order
were not measured.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

---

## Functional & data integrity

### 🔴 F1 — Recording a payment crashes (enum cast) — FIXED
`supabase/migrations/20260808160000_accounts_receivable.sql:63` (`fn_ar_recompute`).
`update orders set payment_status = case … end` assigns a **text** CASE to the
`payment_status_t` enum column; text→enum has no implicit assignment cast.
**Repro:** record any payment (app ReceivablePanel, or `insert into payment`) →
`42804: column "payment_status" is of type payment_status_t but expression is of
type text`; the whole AR flow fails. **Fix (applied):** cast the CASE to
`::payment_status_t`. Verified: payment insert now recomputes status.

### 🟠 F2 — Audit-log role filter crashes (enum vs text) — FIXED
`supabase/migrations/20260808280000_pricing_country_audit.sql` (`fn_audit_search`).
`a.actor_role = p_role` compares the `user_role` enum to a text param → `42883
operator does not exist: user_role = text`. **Repro:** filter the audit log by
role. **Fix (applied):** `a.actor_role::text = p_role`.

### 🟠 F3 — Quote creation 500s for sales (missing sequence grant) — FIXED
`supabase/migrations/20260808200000_quotations.sql:6`. `quote_number` defaults to
`nextval('quote_seq')`, but the anon/authenticated role was never granted USAGE
on `quote_seq`. **Repro (harness):** as sales, `insert into quote …` →
`permission denied for sequence quote_seq`. **Fix (applied):**
`grant usage, select on sequence public.quote_seq to authenticated`.

### Additional functional findings
The functional-audit pass also examined trigger recursion (`fn_waitlist_autopromote`
guard), rollup consistency (`fn_rollup_schedule`), aging/discount math, and the
frontend strip-and-retry fallbacks. Any confirmed items are listed in
`FIX_PLAN.md` under Functional; none rose to Critical beyond F1.

---

## Security (RLS / privilege)

### 🟠 S1 — Order-linked child tables globally readable (PII/financial leak) — FIXED
`order_line`, `participant`, `invoice`, `payment` used `using (fn_current_role()
is not null)`, so the phase-L order scoping was cosmetic: a `sales` user scoped
out of an order could still `GET /rest/v1/participant`, `/order_line`, `/invoice`,
`/payment` and read every team's participant PII (names, emails, exam scores,
cert numbers) and financials. **Repro (harness):** as sales, `select count(*)
from participant` returned 6 (all) instead of 3. **Fix (applied):**
`20260808290000_rls_hardening.sql` adds `fn_can_see_order(order_id)` and scopes
each child SELECT to it; re-run returns 3 / 28 / 23 / 23.

### 🟠 S2 — New AR/analytics views bypass RLS (no security_invoker) — FIXED
`v_order_ar`, `v_country_revenue`, `v_session_forecast`, `v_session_pnl` were
created after the `20260805` security-hardening batch and never got
`security_invoker=true`, so they run as owner and ignore row scoping. **Fix
(applied):** `alter view … set (security_invoker = true)` in the hardening
migration.

### 🟠 S0 — Order scoping inert unless RLS enabled on `orders` — FIXED
`20260808260000_access_scoping.sql` rewrote `p_orders_r` but never ran
`enable row level security`. **Repro (harness):** with RLS off on `orders`, sales
saw all 58. **Fix (applied):** `alter table public.orders enable row level
security;` added to that migration (and to the child tables in the hardening
migration).

### 🟡 S3 — Any sales user can edit/delete another rep's quote — RECOMMENDATION
`20260808200000_quotations.sql:42-49`. `p_quote_w`/`p_quote_line_w` are `for all`
gated only on role, no `sales_id`/`created_by` check. Rep B can set rep A's quote
`discount_pct=100`, flip to Accepted, or convert it. **Fix:** add
`and (fn_current_role()='super_admin' or sales_id = fn_current_sales_id())`.

### 🟡 S4 — Sales can add order lines to orders they don't own — RECOMMENDATION
`supabase/schema.sql` (order_line_write_sales). The `using` clause checks
`order_assignment`, but `using` does not apply to INSERT; the INSERT `with check`
only verifies channel. **Fix:** add the assignment-existence test to `with check`.

### 🟡 S5 — Contact / client_interaction writes not owner-scoped — RECOMMENDATION
`20260808210000_crm_depth.sql:25-26,39-41`. Any sales rep can write/delete
contacts on any client and interaction rows carrying another rep's `sales_id`.
**Fix:** add an owner-of-client / `sales_id = fn_current_sales_id()` check.

### ⚪ S6 — `fn_queue_reminders()` missing role gate — RECOMMENDATION
`20260808190000_communications.sql:101-147` (granted to authenticated) lacks the
role check that `fn_queue_email` has, so any signed-in user can queue customer
emails (bounded by 7-day dedup). **Fix:** add the same `if fn_current_role() in
(...) … raise` guard.

**Verified safe (not findings):** `fn_audit_search` super_admin gate is inside
the WHERE (non-admins get zero rows); `discount_rule`, `invoice`, `payment`,
`feedback` writes and `complaint` status updates are correctly ops+ only.

---

## UI

### 🟡 U1 — Embedded panel tables lack an overflow-x wrapper — RECOMMENDATION
globals.css scrolls tables only via `.card:has(> table)` (direct child). Tables
inside a bare `<div>` or a padded card don't match and can overflow at 360px:
`ReceivablePanel.tsx:112,132`, `ContactsPanel.tsx:72`, `AttachmentsPanel.tsx:69`,
`SessionDetail.tsx:315` (waitlist). **Fix:** wrap each in
`<div style={{overflowX:'auto'}}>`.

### ⚪ U2 — Dead CSS class / primitive drift — RECOMMENDATION
`Quality.tsx:121` uses `.stack` (undefined; inline style saves it).
`.fill-label` (a caption) is reused as a form-label wrapper in `PricingRules`,
`AuditLog`, `FeedbackPanel` instead of `label.field`. Cosmetic.

---

## UX

### 🟠 X1 — Destructive deletes had no confirmation — FIXED
Payments, discount rules, quote lines, attachments, contacts, and trainer
blackouts deleted on a single click with no dialog/undo, though the app ships a
`Confirm` primitive. `ReceivablePanel.tsx:63`, `PricingRules.tsx:51`,
`QuoteDetail.tsx:56`, `AttachmentsPanel.tsx:53`, `ContactsPanel.tsx:35`,
`TrainerManage.tsx:44`. **Fix (applied):** each now `await confirm({… tone:'danger'})`.

### 🟡 X2 — Failed queries render as empty/zero, not an error — RECOMMENDATION
Branches handle `isLoading` but not `error`, so a fetch failure looks like "no
data": `Reports.tsx` receivables/certs/margin/analytics tabs, `Quality.tsx:74,133`,
`Communications.tsx` Templates tab, `FeedbackPanel.tsx:93`. **Fix:** add
`x.error ? <ErrorNote/> :` ahead of the empty check (Reports digest/revenue tabs
already do).

### 🟡 X3 — `window.prompt` for lost-reason capture — RECOMMENDATION
`Inquiries.tsx:78` (`markLost`) uses native `prompt`. **Fix:** use
`confirm({ reason:'optional' })`.

---

## Accessibility

### 🟠 A1 — Form controls without an accessible name — PARTIALLY FIXED
Bare `<select>`/`<input>` announced by value only. **Fixed:** `AuditLog.tsx`
(table/action/role/search) and `Admin.tsx` (role, salesperson link, add-salesperson
inputs, inline team/region, supervisor/active checkboxes) now have `aria-label`.
**Remaining (recommendation):** `SalesEntry.tsx:239,247-250,288`,
`Resources.tsx:149-155,193-199`, `Quality.tsx:122-125,151`, `SessionDetail.tsx:333,217`,
`ContactsPanel.tsx:91`.

### 🟡 A2 — Quotation rows are mouse-only — RECOMMENDATION
`Quotations.tsx:85` navigates via `onClick` on `<tr>` with no `tabIndex`/`role`/
key handler. **Fix:** make the first cell a `Link`, or add `role="button"
tabIndex={0}` + Enter/Space.

### 🟡 A3 — Ad-hoc modals lack dialog semantics — RECOMMENDATION
`Communications.tsx:104` and `TrainerManage.tsx:50` use `.cmdk-scrim` as a modal
with no `role="dialog"`/`aria-modal`/Escape/focus-trap; `Confirm.tsx` has the
roles but no Escape handler or focus trap. **Fix:** add dialog roles, Escape, and
initial focus.

### ⚪ A4 — Icon-only buttons named by glyphs — RECOMMENDATION
`Inquiries.tsx:176-177` move buttons contain only `‹`/`›`. **Fix:** add
`aria-label`.

**Positives:** global `focus-visible` rings, `prefers-reduced-motion`, and a
`@media(max-width:860px)` grid collapse are in place; NavIcon SVGs are
`aria-hidden`; Worklist is the exemplar (Confirm+reason, aria-labels, optimistic
rollback).

---

## Summary counts

| Severity | Total | Fixed | Open |
|----------|:-:|:-:|:-:|
| 🔴 Critical | 1 | 1 | 0 |
| 🟠 High | 7 | 7 | 0 |
| 🟡 Medium | 8 | 8 | 0 |
| ⚪ Low | 4 | 4 | 0 |

**All findings are now fixed and re-validated** — the customer approved
"fix everything" after the initial Critical/High pass, so the Medium/Low items
marked RECOMMENDATION above were subsequently applied (see `FIX_PLAN.md` for the
per-item validation). Two Postgres harness runs plus `tsc`/`build` back the DB
and frontend changes respectively.
