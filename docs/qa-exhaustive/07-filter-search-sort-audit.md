# 07 — Filter, search, sort and table audit

**Testing limitation.** Filter behaviour could not be exercised in a signed-in
browser. Findings below come from reading the filter implementations, the URL
state helper, the data hooks and the SQL they generate. Behavioural claims that
were not executed are marked *(not verified)*.

## Architecture — what is genuinely good

- **Filter state lives in the URL** on every filterable surface, so views are
  shareable, reloadable and back/forward-navigable. This is the right design.
- **`src/lib/urlParams.ts`** applies multiple param changes atomically, so two
  filter changes from one interaction cannot clobber each other. Unit-tested.
- **Saved views** capture exactly the surface's `paramKeys`, and role defaults
  are seeded server-side and RLS-scoped.
- **Server-side paging + debounced search** on Orders and Clients.

## Surfaces and their filters

| Surface | Filter params |
|---|---|
| Calendar | `cal, month, year, status, category, lt, q, sort, dir` |
| CRM · Orders | `q, stage, pay, sort, dir` |
| My Work | `who, view, stage` |

## Findings

**FS-1 (P2) — filtering is split between client and server, inconsistently.**
Orders/Clients filter and page in Postgres; Calendar and Resources filter in
React over a full fetch (`visibleTrainers`/`visibleVenues` are `.filter()` over
the whole array). At 161 sessions and 7 trainers this is correct and fast; it
becomes wrong at scale. Document the threshold rather than pre-optimising.

**FS-2 (P2) — no result count is displayed** on the filtered surfaces (the
Resources screen shows a "hidden" count, added this session; others do not).
Users cannot tell whether a filter matched 3 rows or 300.
*Fix:* show "N of M" beside the filter summary.

**FS-3 (P2, partially fixed) — active filters were invisible.** Resolved this
session on saved-view surfaces: an active-filter summary row now names each
active filter and allows removing it individually plus "Clear all". Surfaces
without `SavedViews` (Resources, Approvals, Complaints) still have no summary.

**FS-4 (P3) — sort has no null policy.** `.order()` calls mostly omit
`nullsFirst`, so null-heavy columns (e.g. `next_session`, `sap_order_no`) sort
inconsistently between ascending and descending. One call
(`v_trainer_quality`) does set it correctly — that pattern should be applied
generally.

**FS-5 (P3) — search is contains-match, case-insensitive, via trigram indexes**
(`idx_client_*_trgm`, `idx_orders_*_trgm` added 2026-08-14). Leading-wildcard
search is therefore indexed, which is the correct design. **Not verified:**
behaviour with leading/trailing spaces, unicode, and very long inputs.

**FS-6 (P3) — date filters.** Schedule year filtering is pushed into Postgres
(`extract(year from ...)`), and report ranges are computed server-side. Boundary
inclusivity (both endpoints) and timezone handling around Asia/Manila
month-ends were **not verified** — this needs a signed-in test and is the single
highest-value filter test to write once credentials exist.

**FS-7 (P4) — no Advanced Filters grouping.** Calendar exposes 9 params at once.
Once result counts exist, the less-used ones (`lt`, `category`) could collapse.

## Tables

Reviewed in code: `.scroll-x` wrappers are applied where a table is not a direct
`.card > table` child (a QA rule the codebase follows), status uses pills, and
row actions are consistent. **Column widths, truncation, sticky headers and
mobile behaviour were not verified.**

**FS-8 (P3) — bulk actions exist only in My Work.** Orders and Resources have no
multi-select, so a coordinator reassigning ten orders must do it one at a time
unless they go through My Work.
