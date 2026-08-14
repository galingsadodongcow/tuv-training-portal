# 19 — Test execution results

Run against commit `d5600e6` on a local production build, plus read-only queries
against the live Supabase project `ruwuqzwtwngpcauzbrqj`.

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Lint | `eslint . --max-warnings=0` | ✅ PASS — 0 warnings |
| Typecheck | `tsc --noEmit` | ✅ PASS |
| Unit | `npm test` | ✅ PASS — 3 files, 7 tests |
| Build | `npm run build` | ✅ PASS |
| E2E (expanded) | `npm run test:e2e` | ✅ **PASS — 40/40** (was 8) |
| Dependency audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Migration parity | CI logic, run locally | ✅ PASS |
| RLS regression | `rls-regression.yml` | ✅ PASS (CI, PR #173) |

### E2E breakdown (40 passed, 13.4s)
- 3 public-surface (render, axe WCAG A/AA, root)
- 22 auth-gate (every screen route bounces a signed-out visitor)
- 13 legacy-redirect (resolve + stay gated)
- 2 resilience (unknown route, malformed id → no client exception)

## Live database verification (read-only)

| Check | Result |
|---|---|
| Views enforcing RLS | ✅ **30/30 `security_invoker = true`** |
| Referential integrity | ✅ 0 orphans (order→client, line→order, participant→schedule) |
| Orders with no client | ✅ 0 |
| Customers with no email | ✅ 0 |
| Sales role scoping — orders | ✅ 123/163 |
| Sales role scoping — receivables | ✅ 123 |
| Sales role scoping — profiles | ✅ 1 (self) |
| Sales role scoping — audit_log | ✅ 0 |
| **Sales role — session P&L** | ❌ **161/161, ₱21.9M margin visible** |
| **Sales role — trainer day rates** | ❌ **6/6 visible** |
| Orders with no owner | ⚠️ **40/163 (24.5%)** |
| Live sessions with no trainer | ⚠️ 6 |
| Live sessions with no venue | ✅ 0 |

## Delegation matrix verification (live simulation)

| Scenario | Expected | Result |
|---|---|---|
| Supervisor grants `super_admin` | deny | ✅ `42501` |
| Supervisor self-promotes | deny | ✅ denied (self-management blocked) |
| Supervisor manages other team | deny | ✅ denied |
| Supervisor grants `sales` on own team | allow | ✅ |
| Supervisor add-member forcing team | own team | ✅ asked `Marketing`, stored `Sales` |
| Operations grants `business_owner` | deny | ✅ `42501` |
| Operations manages a super_admin | deny | ✅ false |
| Operations manages a business_owner | deny (after fix) | ✅ BO removed from list |
| Super_admin sees everyone | allow | ✅ 6 users |
| Sales_manager creates an order | allow (after fix) | ✅ reached validation, not role check |
| Business_owner creates an order | deny | ✅ `42501` |

## NOT executed — and why

| Area | Reason |
|---|---|
| Any signed-in screen | No test account exists |
| All CRUD via UI | Same; and production is the only DB (§37) |
| Filters / sort / search behaviour | Requires sign-in |
| Date-boundary + timezone filters | Requires sign-in — **highest-value untested area** |
| Responsive at 8 viewports | Requires sign-in |
| axe on the other 21 screens | Requires sign-in |
| Keyboard / screen-reader walkthrough | Requires sign-in |
| Network failure / timeout / token expiry | Requires sign-in |
| Multi-tab and double-submit | Requires sign-in |
| Load / volume testing | Would write to production |

No result in this audit is reported from an untested path.
