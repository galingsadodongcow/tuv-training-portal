# Simulation Log

## Environment

The production database is Supabase (unreachable from this session), so Phase 1
ran against a **local Postgres 16 instance** loaded with:

1. Supabase scaffolding stubs (roles `anon`/`authenticated`/`service_role`,
   `auth.uid()` reading the `request.jwt.claim.sub` GUC, `auth.users`, minimal
   `storage`), so RLS is enforceable.
2. `supabase/schema.sql` (base schema; the reconstruction omits trailing `;` on
   functions and uses mixed CRLF — normalized for the harness only).
3. All fifteen migrations `20260808150000` … `20260808290000`.
4. `supabase/seed/rebuild_2026_full.sql`.
5. Four identities: one `profiles` row per role; `sales` linked to salesperson
   S-01 (Team A / Luzon). Salespeople S-01, S-02 on Team A; S-03 on Team B.

Role impersonation per statement:
`set role authenticated; select set_config('request.jwt.claim.sub','<user_id>',true);`

**Limitation:** the reconstructed `schema.sql` lacks `audit_log` and a few
digest views, so `fn_audit_search` and those views could not be exercised here;
they exist in the real DB. Live UI rendering was not possible — UI/UX/a11y were
audited from source (see `QA_AUDIT_REPORT.md`).

## Load result

| Step | Result |
|------|--------|
| Schema load | OK (25 fns, 13 triggers; 5 view-ordering artifacts, not seed-relevant) |
| 15 migrations | OK apart from 2 `audit_log` artifacts (missing table in reconstruction) |
| Seed (`ON_ERROR_STOP=1`) | **exit 0** |
| Row counts | courses 26, schedules 56, orders 58, order_lines 58, participants 6, invoices 50, payments 45, discount_rules 3, quotes 2, contacts 16, feedback 66, complaints 3, session_trainer 4, comms_log 3, attachments 3 |
| Views | `v_order_ar` 58 (17 with balance), `v_session_pnl` 56 (all margins), `fn_nps_summary` NPS=14 content=4.33, `fn_funnel` inq=9 won=1 lost=1 quotes=2 accepted=1 |

## Phase-1 lifecycle checks (data/RLS layer)

### System / triggers (happy path)
| # | Action | Expected | Actual | Result |
|---|--------|----------|--------|--------|
| 1 | Seed each session's fill from a real order line | booked == Σ live line seats | consistent across all 56 sessions | PASS |
| 2 | Record payment → AR recompute | order `payment_status` recomputed | **initially 42804 crash**, fixed by enum cast, then recomputes | PASS (after fix) |
| 3 | Issue certificate on completed session | cert rows + expiry set | participants updated with score/result/cert_expiry | PASS |

### Denied-action attempts (RLS enforcement)
| # | Role | Action | Expected | Actual | Result |
|---|------|--------|----------|--------|--------|
| 4 | sales | insert `discount_rule` | DENY | `new row violates row-level security policy` | PASS |
| 5 | sales | insert `payment` | DENY | RLS violation | PASS |
| 6 | sales | update `complaint.status` | DENY | `UPDATE 0` (row invisible to USING) | PASS |
| 7 | sales | insert `quote` | ALLOW | **`permission denied for sequence quote_seq`** → fixed by GRANT → INSERT ok | PASS (after fix) |
| 8 | sales | insert `contact` | ALLOW | INSERT 0 1 | PASS |
| 9 | ops | insert `discount_rule` | ALLOW | INSERT 0 1 | PASS |
| 10 | ops | update `complaint` | ALLOW | UPDATE 1 | PASS |

### Order-visibility scoping (the phase-L feature)
| # | Role | Query | Before fix | After fix (`enable RLS` + child scoping) | Expected |
|---|------|-------|-----------|-------------------------------------------|----------|
| 11 | sales (Team A) | `count(*) from orders` | 58 (ALL — scoping inert) | **28** (Team A only) | Team A subset |
| 12 | sales | `count(*) from participant` | 6 (all PII) | **3** | only visible orders |
| 13 | sales | `count(*) from order_line` | 58 | **28** | scoped |
| 14 | sales | `count(*) from invoice` | 50 | **23** | scoped |
| 15 | sales | `count(*) from payment` | 45 | **23** | scoped |

Distribution check: order_assignment → Team A 28, Team B 14, unassigned 16.
The scoped sales user sees exactly Team A's 28 and none of the other 30 — correct.

## Cross-role workflow (spot check)
- Sales creates inquiry → converts to order (own) → operations picks up in
  fulfillment queue → schedules/staffs → completes → certificate issued →
  feedback captured → AR invoice/payment → business_owner sees it in reports.
  Each stage's row is visible to the next role per the matrix. PASS at the data
  layer; UI handoff verified by reading the screens (no live render).

## Fixes validated by re-running the affected checks
- Check 2 (payment_status enum cast) — re-ran, recompute succeeds.
- Check 7 (quote_seq grant) — re-ran, quote insert succeeds.
- Checks 11–15 (orders RLS enable + `fn_can_see_order` child scoping) — re-ran,
  counts drop to the scoped subset.
