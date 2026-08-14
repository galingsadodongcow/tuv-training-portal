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
| RLS regression | `rls-regression.yml` — throwaway Postgres, fixture built from real policy migrations, assertions on ownership + RPC locks |
| Migration parity | `migration-parity.yml` — every migration ≥ cutoff must appear in the deployment bundle |
| Static | ESLint `--max-warnings=0`, `tsc --noEmit` |

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

## Constraint to respect

Destructive CRUD tests must **not** run against production. Either stand up a
second Supabase project for CI, or restrict authenticated CI to read-only
assertions. Today only production exists, which is why CRUD automation is
recommended rather than added.
