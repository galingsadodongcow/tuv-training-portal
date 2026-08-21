# 18 — Automated test coverage

## Added in this audit

`e2e/smoke.spec.ts` expanded from **8 → 40 tests**, all credential-free:

- **22 auth-gate tests** — every route that renders a screen must send a
  signed-out visitor to `/login`. Previously only 5 routes were covered, so a
  route added without a Guard would not have been caught.
- **13 legacy-redirect tests** — every consolidated legacy URL must still
  resolve (`status < 400`) and remain gated. This protects the third-pass IA
  consolidation from silent rot.
- **2 resilience tests** — an unknown route must not 500; a malformed record id
  (`/session/not-a-real-uuid`) must fail closed at the auth gate **with no
  unhandled client exception** (asserted via `pageerror`).
- **3 pre-existing** — login renders, axe WCAG A/AA scan, root resolves.

Result: **40 passed** against a local production build (13.4s).

## Existing coverage

| Layer | Coverage |
|---|---|
| Unit (Vitest) | 3 files / 7 tests — URL param state, order-state logic, attention scale |
| E2E public (Playwright) | 40 tests (above) |
| E2E authenticated | **Harness exists, inert** — `auth.setup.ts` + `authenticated.spec.ts` activate only when `E2E_USER_EMAIL`/`PASSWORD` are set |
| Accessibility | axe WCAG 2.0 A/AA on `/login` only |
| RLS regression | `rls-regression.yml` — throwaway Postgres, fixture built from real policy migrations. **Extended 2026-08-14: 9 → 20 assertions**, now covering the delegation matrix, order-creation authority and cost/margin masking (see below) |
| Migration parity | `migration-parity.yml` — every migration ≥ cutoff must appear in the deployment bundle |
| Static | ESLint `--max-warnings=0`, `tsc --noEmit` |

## RLS suite extension (2026-08-14)

The boundary checks that were run by hand against the live database during the
audit are now codified, so they cannot regress silently. Assertions **J–T**:

| ID | Guards |
|---|---|
| J | A supervisor may grant `sales` and nothing else |
| K | Supervisor scope: own-team rep yes; other team, self and operations no |
| L | Escalation — supervisor cannot grant `super_admin` |
| M | Oversight ring-fence — operations cannot act on business_owner or super_admin, keeps sales |
| N | Operations cannot grant `business_owner` (matrix is downward-only) |
| O | A supervisor's team is forced server-side on roster writes |
| P | `business_owner` cannot create an order (`42501`) |
| Q | `sales_manager` can (reaches validation `22004`, not the role check) |
| R | A sales rep sees revenue but **no cost and no margin** |
| S | Operations still gets the full P&L — proves R is a gate, not a broken view |
| T | Rate columns not directly readable; safe columns still are |

The fixture grew skeletons for `trainer`, `venue`, `session_trainer`,
`order_line`, the costing columns on `schedule`, all eight `user_role` values and
the three order enums, and now `\i`s four more real migrations
(`20260814060000/070000/080000/090000`).

**Mutation-tested, not just green.** Breaking `fn_cost_visible()` to return true
fires `REGRESSION R`; widening the grant matrix fires `REGRESSION J`. In both
cases psql exits **3**, so CI fails — verified, because an assertion that passes
for the wrong reason is worse than no assertion.

Why this suite rather than authenticated browser tests: it exercises the
*authoritative* layer (RLS + the SECURITY DEFINER RPCs), it can test **write**
paths safely on a disposable database, and it needs **no credentials** — where a
signed-in Playwright suite would require a standing production account and still
could not write.

## The gap

**Everything behind login is untested.** 22 screens, all CRUD, all filters, all
role behaviour in the browser. The harness is built and CI-wired; it needs one
least-privileged account.

## Recommended next tests (once IMM-2 lands)

Priority order, highest value first:

1. **Role fixtures** — `loginAs('operations'|'sales'|'sales_manager'|'auditor')`
   using storage-state reuse.
2. **Role × route matrix** — each role lands on its home; nav-excluded routes
   bounce; no role sees another's data.
3. **Filter/sort/search matrix** (§35 of the brief) — single filters, combined,
   search+filter, sort+filter, clear-one, clear-all, URL persistence, no-result,
   invalid values, and **date boundary/timezone** (the highest-value untested
   area — see FS-6).
4. **Core CRUD happy paths** against a **non-production** database.
5. **axe on all 22 screens** — reuses the existing `AxeBuilder` wiring.
6. **Viewport matrix** across the 8 target sizes.

## Constraint to respect — decided

Destructive CRUD tests must **not** run against production.

**Decision (owner, 2026-08-14): there will be no second Supabase project for
staging.** Production is the only database and will remain so.

Consequences, which follow directly and should not be re-litigated later:

1. **Authenticated CI must be strictly read-only.** The test account gets a
   least-privileged role and the specs assert *rendering, navigation, role
   scoping and filter behaviour* — never create/update/delete.
2. **Item 4 of the list above (core CRUD happy paths) is off the table** as
   automation. CRUD correctness stays covered by the RLS regression suite
   (which builds its own throwaway Postgres in CI) plus manual verification.
3. **The RLS regression workflow becomes more important, not less** — it is now
   the only place where write paths are exercised automatically. Extend it
   rather than the browser suite when a write rule changes.
4. Any future migration remains a production change on first application, so the
   throwaway-Postgres validation step used for the 2026-08-14 migrations should
   stay standard practice.
