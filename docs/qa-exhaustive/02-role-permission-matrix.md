# 02 — Role / permission matrix

Two layers, and they do not agree everywhere. **RLS + the `SECURITY DEFINER`
RPCs are authoritative**; the nav list and route Guards are cosmetic.

Method: policies read from `pg_policies` on the live database, then verified by
impersonating each role (`set local role authenticated` +
`request.jwt.claims`) and counting what that role can actually read.

## Evidence — what each role can actually read (live, production)

Row counts returned to the role, against totals as owner:

| Table / view | Owner | **sales** | Notes |
|---|---|---|---|
| `orders` | 163 | **123** | scoped ✅ own + team |
| `v_order_ar` (receivables) | 163 | **123** | follows order scope ✅ |
| `client` | 28 | **28** | all — shared customer book |
| `schedule` | 161 | **161** | intentional (calendar = source of truth) ✅ |
| `payment` | — | 94 | follows order scope |
| `profiles` | 6 | **1** | self only ✅ |
| `audit_log` | 7,546 | **0** | correctly blocked ✅ |
| **`v_session_pnl`** | 161 | **161** | ❌ **all sessions' cost + margin** |
| **`trainer.daily_rate`** | 6 | **6** | ❌ **all trainer day rates** |

The two ❌ rows are finding **P0-1** (see `00-executive-summary.md` and
`13-data-integrity-audit.md`). Everything else scopes correctly.

## Matrix — screen × role

`V` view · `C` create · `E` edit · `D` delete/cancel · `A` approve ·
`As` assign · `X` export · `—` no access · `(n)` nav-hidden but route-reachable

| Screen | super_admin | operations | business_owner | sales | coordinator | sales_manager | management | auditor |
|---|---|---|---|---|---|---|---|---|
| My Work | V As | V As | V | V As* | V As | V As | V | V |
| Calendar | V C E D | V C E D | V | V | V C‡ | V C‡ | V | V |
| CRM | V C E | V C E | V | V C* | V C | V | (V) | (V) |
| Customers | V C E | (V) | V C E | V C E | V C E | V C E | V | — |
| Order detail | V E As | V E As | V E As | V E* | V E As | V As | (V) | (V) |
| Session detail | V E D | V E D | V | V | V | V | V | V |
| Session new/edit | V C E | V C E | — | — | — | — | — | — |
| Training catalogue | V C E D | V C E D | V | V | V | V | V | — |
| Trainers & venues | V C E D | V C E D | V | — | — | — | V | — |
| Sales entry | V C | — | — | V C | V C | V C‡ | — | — |
| Analytics | V X (8 tabs) | V X (7) | V X (7) | (V overview) | (V overview) | V X (7) | V X (7) | (V overview) |
| Financial | V X | V X | V X | — | — | — | V X | — |
| Team | V | — | — | — | — | V | — | — |
| Approvals | V A | V A | V A | — | — | — | — | — |
| Complaints | V C E | V C E | V C E | — | — | — | V | — |
| Duplicates | V A | V A | — | — | V A | — | — | — |
| Pricing rules | V C E D | V C E D | V C E D | — | — | — | — | — |
| Communications | V C | V C | — | — | — | — | — | — |
| Rollover | V C | V C | — | — | — | — | — | — |
| Users & access | V C E | V C E† | — | — | — | V C E† | — | — |
| Audit log | V X | — | — | — | — | — | — | V X |
| Search | V | V | V | V | V | V | V | V |

\* Sales writes are channel-restricted (`p_orders_sales_i`: Inside Sales /
Field Sales only) and payment status / SAP number are trigger-blocked.
‡ Added this session: `coordinator` and `sales_manager` may now book.
† Scoped by the delegation matrix below — not full access.

## Delegation matrix (`fn_member_grantable_roles`) — verified live

| Delegator | May grant | May manage | Verified |
|---|---|---|---|
| `super_admin` | all 8 roles | everyone except self | ✅ sees all 6 users |
| `operations` | sales, coordinator, sales_manager | everyone except super_admin **and oversight roles** | ✅ sees 3, BO hidden |
| sales supervisor | sales | own-team sales reps only | ✅ team forced server-side |
| all others | nothing | nobody | ✅ empty array |

Invariants confirmed by live probe: self-promotion denied; escalation to
`super_admin` denied; cross-team access denied; `business_owner` refused to
operations; supervisor's team forced on insert (asked for `Marketing`, stored
`Sales`).

## RBAC findings

**RBAC-1 (P0) — cost/margin/trainer rates readable by all roles.** Covered above.
The UI gate on the Profitability tab is cosmetic.

**RBAC-2 (P2) — nav and route Guard disagree on 5 screens.** `/crm`,
`/clients`, `/clients/[id]`, `/orders/[id]`, `/session/[id]` have no Guard, so
`management` and `auditor` (whose nav omits CRM) can deep-link in. Data is
correctly scoped by RLS, so this is a consistency/UX defect, not a breach.
Fix: add Guards matching the nav lists (**NEXT-4**).

**RBAC-3 (P2) — `client` is readable by every authenticated role including
`auditor`.** 28 of 28 rows to a sales rep. This may well be intended (a shared
customer book), but it is *not* stated anywhere, and it is the one place where
"sales sees everything" is true. Decide and document.

**RBAC-4 (P3) — `operations` has no nav entry for Customers** yet can reach
`/clients` and holds no write policy there (`business_owner_client_update`
covers BO). An ops user who deep-links gets a read-only-in-practice screen with
edit affordances that will fail. Low impact, easy fix.

**RBAC-5 (P3, resolved this session)** — supervisors held DB capability that the
UI gate blocked. Fixed by unifying on `sales_manager`.

**RBAC-6 (info) — `fn_create_order` is the true gate for order creation**, not
RLS. Documented here because two prior reviews (including an earlier pass in
this session) reasoned from `pg_policies` and drew the wrong conclusion about
`sales_manager`.

## Not verified

- API-level authorisation was tested via direct SQL as each role, which is
  equivalent for PostgREST. **Raw HTTP calls with a forged JWT were not
  attempted** — out of scope for a production system.
- Button-level affordance checks ("does a button appear for an action the user
  cannot perform") were done by reading role checks in the screens, **not by
  observing the rendered UI**, because no signed-in session was available.
