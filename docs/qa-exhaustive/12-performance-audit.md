# 12 — Performance audit

Evidence from code and the live database. **No runtime profiling, Lighthouse
run or network waterfall was captured** — all require a signed-in session.

## Already fixed (earlier in this session's history)

- **Dashboard**: replaced many full-table downloads with a single RLS-scoped
  aggregate RPC, `fn_dashboard_metrics(p_year)` — verified live as
  `SECURITY INVOKER` with an empty `search_path`.
- **Schedule year filtering** pushed into Postgres.
- **Report month ranges** computed server-side.
- **Orders / Clients**: server-side paging + filtering, debounced search.
- **Hidden tabs / role-inapplicable panels** no longer fetch (`enabled`).
- **Refetch-on-window-focus disabled** globally.
- **Indexes** added 2026-08-14: partial indexes for active orders by date /
  stage-age / client, order assignments, order lines, participants, inquiries,
  pending approvals, open duplicates, audit timestamps, unread notifications,
  open tasks — plus **5 trigram GIN indexes** for the contains-searches.

## Current findings

**PERF-1 (P2) — unbounded list queries.** ~96 `.select(` calls in
`src/hooks/data.ts`; only ~17 carry `.limit`/`.range`. Several are `select('*')`
over whole views (`v_country_revenue`, `v_trainer_quality`, the four digest
views, `duplicate_candidate`, `calendar_year`).
At today's volume (163 orders, 161 sessions, 28 clients) this is **not a live
problem**. It becomes one at ~10× data. *Fix:* bound the list queries; add
pagination to Resources and the digest surfaces.

**PERF-2 (P2) — client-side filtering on Calendar and Resources.** The full
result set is fetched and filtered in React (`visibleTrainers`,
`visibleVenues`, calendar `base`). Correct at current scale, wrong at scale.

**PERF-3 (P2) — 30 `auth_rls_initplan` warnings.** RLS policies call
`auth.<fn>()` un-wrapped, so they re-evaluate **per row** instead of once per
query. This is a real at-scale cost across `profiles`, `orders`, `participant`,
`notification`, `task` and others. Fix is mechanical —
`(select auth.<fn>())` — but touches ~30 policies where a wrong edit silently
changes access, so it needs the RLS regression suite as a guard.
**Tracked in GitHub issue #171.**

**PERF-4 (P3) — 59 `multiple_permissive_policies` warnings.** Multiple permissive
policies for the same role+action mean Postgres evaluates all of them. Mostly a
consequence of the role-per-policy style; consolidation would help but risks
behaviour change.

**PERF-5 (P3) — 39 unindexed foreign keys.** Should be added *selectively*
based on join/delete patterns, not in bulk — many are low-write reference
tables. Also in issue #171.

**PERF-6 (P3) — the new indexes read as "unused".** Expected: they had no
recorded scans when the advisor ran. Re-check after real traffic before
concluding anything.

**PERF-7 (P3) — no telemetry destination.** Web-vitals and error capture are
implemented but `NEXT_PUBLIC_TELEMETRY_ENDPOINT` is unset, so there is no
production performance data at all. Configuring it is the prerequisite for any
future performance claim.

## Bundle / build

Production build succeeds; 39–44 routes compile. Next.js 16 + React 19 +
Turbopack. **Bundle size was not measured.**
