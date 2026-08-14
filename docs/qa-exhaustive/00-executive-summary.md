# Executive summary — production-readiness audit

**Date:** 2026-08-14 · **Target:** https://tuv-training-portal.netlify.app ·
**Commit:** `d5600e6` (main) · **Supabase:** `ruwuqzwtwngpcauzbrqj`

## Scope limitation — read this first

**No authenticated browser testing was possible.** There is no test account, and
the E2E credential secrets were removed earlier today at the owner's direction.
The only database is production, so per the audit brief's own rule (§37),
destructive and authenticated testing was replaced with:

- **code-level analysis** of every route, screen, hook and policy, and
- **database-level role simulation** — impersonating each role against the live
  database (`set local role authenticated` + a `request.jwt.claims` sub) and
  reading what that role can actually see.

That second technique is stronger than clicking through the UI for
authorisation questions, because **RLS is the real authority** in this app (the
browser holds only the anon key). It is weaker for interaction questions —
click counts, focus order, hover states, responsive breakpoints and visual
regressions were **not** empirically verified and are marked as such throughout.
Any statement in this audit that is not backed by evidence is labelled
*(not verified)*. Nothing here is reported as tested that was not tested.

## Verdict

**Conditionally ready for a controlled pilot; not ready for unrestricted
company-wide deployment.**

The engineering foundations are genuinely strong — cleaner than most systems at
this stage. Referential integrity is perfect (0 orphans across every foreign-key
path), all 30 reporting views correctly enforce RLS, production dependencies
carry 0 known vulnerabilities, and lint/typecheck/unit/build/E2E all pass. The
data model and the workflow engine are sound.

What blocks unrestricted deployment is **one confirmed data-exposure defect**,
a **large untested surface**, and **operational data that is not yet fit for
daily use**.

## Production-readiness score: **72 / 100**

Full breakdown in `20-production-readiness.md`. Target for general deployment: **85**.

## The single most serious finding

**P0-1 — Commercial cost and margin data is readable by every authenticated
role, including Sales.**

Simulating the Sales account against production, a sales rep can read:

| What | Value visible to Sales |
|---|---|
| Sessions in `v_session_pnl` | **161 of 161** (all) |
| Total revenue | ₱31,094,000 |
| Trainer cost | ₱3,792,000 |
| Venue cost | ₱4,500,000 |
| **Total margin** | **₱21,907,500** |
| Individual trainer daily rates | **all 6 trainers**, up to ₱12,000/day |

The UI gates the Profitability tab to management/business_owner/operations —
but that gate is cosmetic. `v_session_pnl` is `security_invoker`, and its inputs
(`schedule`, `trainer.daily_rate`, `venue.day_rate`) are readable by every
authenticated user, so the view returns everything to anyone who queries the API
directly. Trainer daily rates are effectively **individual compensation data**.

This is exactly the class of defect CLAUDE.md warns about: *"A UI-only block
with a permissive DB policy is a bug."*

**Not fixed in this pass — deliberately.** Restricting cost visibility changes a
business rule (who may see margin), so per the brief's §41 it is documented for
decision rather than changed unilaterally. Recommended fix in
`13-data-integrity-audit.md` and backlog item **IMM-1**.

## Which role experiences the most friction

**Sales.** Three compounding reasons:

1. **40 of 163 orders (24.5%) have no owner.** Sales cannot reliably answer
   "what is mine?" — the queue is a quarter unattributed.
2. Sales is the role most often *reaching* for screens its nav hides (`/crm` is
   in nav, but Analytics/Financial are not) — the commercial picture is split.
3. Sales has the narrowest write authority (`p_orders_sales_i` restricts even
   the channel), so it hits permission walls most often.

Operations is the best-served role. Auditor and Management are thin but coherent.

## Business workflow with the most serious problems

**Order ownership and the Sales → Operations handoff.** The handoff *mechanism*
is well built (endorse / accept / return-for-correction, completeness checks,
audit trail). The problem is upstream: a quarter of orders never get an owner,
so there is no accountable person to endorse them. The system models the
handoff correctly but does not enforce the precondition.

## Top blockers before wider deployment

| # | Finding | Sev | Evidence |
|---|---|---|---|
| 1 | Cost/margin/trainer rates readable by all roles | **P0** | Live simulation, §above |
| 2 | No authenticated automated test coverage at all | **P1** | 0 signed-in tests exist |
| 3 | 40/163 orders unowned | **P1** | Live query |
| 4 | No test account → no repeatable QA of any signed-in screen | **P1** | — |
| 5 | 6 live sessions with no trainer assigned | **P2** | Live query |
| 6 | Only 1 supervisor exists; team structure is a single flat `Sales` team | **P2** | Live query |
| 7 | 5 of 7 salespeople have no portal login | **P2** | Live query |
| 8 | ~96 data-layer selects, only ~17 bounded by limit/range | **P2** | `src/hooks/data.ts` |
| 9 | Terminology split: "Customer" (7) vs "Client" (3) in UI labels | **P3** | grep of screens |
| 10 | Leaked-password protection disabled in Supabase Auth | **P3** | Security advisor |

## What should be redesigned rather than patched

- **Cost visibility** — needs a deliberate model (column-level restriction or a
  role-scoped P&L RPC), not a patch.
- **Team structure** — one flat team with one supervisor makes the whole
  delegation feature inert-by-shape. Worth designing before more roles are added.
- Everything else in this audit is patchable; the information architecture is
  already good (the third-pass consolidation genuinely worked — see
  `14-recommended-information-architecture.md`).

## Recommended sequence

1. **Decide and fix cost visibility** (IMM-1) — the only item that should block a pilot.
2. **Create a least-privileged test account**, restore E2E secrets, and let the
   authenticated Playwright suite (already built and wired) start running.
   Scope it **read-only**: there is no staging database and, by decision, there
   will not be one, so signed-in automation must never write.
3. **Assign owners to the 40 unowned orders**; add a completeness rule that an
   order cannot be endorsed without one.
4. Staff the 6 unstaffed live sessions.
5. Then iterate on the UX backlog in `16-prioritized-backlog.md`.

## What is genuinely good

Worth stating plainly, because an audit that lists only faults misleads:

- **Referential integrity: flawless.** 0 orphaned order→client, order_line→order
  or participant→schedule rows; 0 orders without a client; 0 clients without email.
- **All 30 views are `security_invoker`** — no view bypasses RLS.
- **0 production dependency vulnerabilities.**
- **Every one of 22 screen routes correctly gates a signed-out visitor** (proven
  by the expanded E2E suite added in this pass: 8 → 40 tests).
- The **third-pass IA consolidation** (folding 13 legacy routes into 4 hubs) is
  well executed, and all 13 legacy URLs still resolve — now regression-tested.
