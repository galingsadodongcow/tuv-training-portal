# Third-pass simplification — handoff

**Status:** the third-pass backlog is **effectively complete**. All P0/P1 structural
items, the P3 table/density polish, and the #23 DB retirement are **merged and live
on `main`**. Two threads remain open on purpose (see "What's left"), both because
they need a product decision or a human preview rather than more implementation.

Read `README.md`, `10-prioritized-simplification-backlog.md`, and
`IMPLEMENTATION-LOG.md` (the full wave-by-wave record, waves 1–15) first. Repo
`galingsadodongcow/tuv-training-portal`, base `main`. Read `CLAUDE.md`. Supabase MCP
is available for DB work.

## Done + merged (do NOT redo)

**First session (waves 1–6):** #1 retire Operations today · #3 Data-quality already
super_admin-only · #9 Session detail (tabs 6→5, badges, status→1+More) · #10 Approvals
off nav · #11 Sales My Work queues · #12 Calendar list one-table · #15 Inquiries table
view · #16 Customer 360 tab drop · #17 Course progressive form · #18 Admin grouping ·
#19 Resources Load tab · #20 Move-booking relabel · dead `Home.tsx`/`OperationsToday.tsx`
deleted.

**This session (waves 7–15, PRs #100–#109, all merged):**
- **#4 Status/health consolidation** (wave 7, PR #100) — one `blocked·risk·ok` (+`done`)
  scale in `src/lib/health.ts`; `orderState`/`leadHealth` map onto it; decorative
  proximity pills (Today/This week/Soon) retired. No cell shows >1 health pill.
- **#2 Analytics merge** (wave 8, PR #101) — five destinations → one `/analytics` shell
  (`src/screens/Analytics.tsx`) with role-scoped tabs (Overview · Revenue · Receivables ·
  Certificates · Profitability · Pipeline · Quality · Data quality). Complaints extracted
  to `/complaints` (record list). `/dashboard`,`/reports`,`/quality`,`/data-quality`
  redirect in. `AnalyticsTabs.tsx` deleted.
- **#6 Organizations → Customer 360** (wave 9, PR #102) — "Related accounts" + inline org
  create/assign on the customer record; Organizations off nav; `/organizations` (list)
  redirects to `/clients`; the org record `/organizations/[id]` stays reachable off-nav.
- **#7 CRM workspace** (wave 10, PR #103) — Inquiries+Quotations+New order+Orders → one
  `/crm` (`src/screens/CRM.tsx`) with Pipeline · Quotes · Orders tabs; "New order" is an
  action (CRM header + customer record); old list routes redirect in (the `/orders` stub
  forwards `q`/`stage`/`pay`).
- **#5 Fulfillment → Orders saved view** (wave 11, PR #104) — Worklist folded into the CRM
  Orders tab as the "Needs fulfillment" saved view (`?queue=fulfillment`); `/worklist`
  redirects in, forwarding `who`/`view`/`stage`.
- **#14 Duplicates + E-learning** (wave 12, PR #105) — Duplicates → a My Work exception
  (resolve on `/duplicates`, off-nav); E-learning → the CRM Orders "Awaiting e-learning"
  saved view (`?queue=elearning`, gated); both off nav.
- **#13 Training Catalogue** (wave 13, PR #106) — Courses + course form → one directory +
  edit-drawer; the two `course_fee` editors unified into one path; `/course/new` &
  `/course/[id]/edit` redirect into `/courses?new`/`?edit=`.
- **#22 + #21 (partial)** (wave 15, PR #108) — table default sort / keyboard-reachable
  primary row actions (Clients, Courses, Calendar list, E-learning); one card-in-card fix
  (FeedbackPanel).
- **#23 Retire `course.category`** (wave 14, PRs #107 + #109) — app reads the S6
  category→subcategory hierarchy everywhere (`withCategory` in `data.ts`); migration
  `20260812230000_s6_retire_course_category.sql` recreates `v_order_fact` (preserving
  `security_invoker=true`) and drops the column. **Applied to the live DB and verified**
  (column gone; view intact; 13 categories resolve; both advisors clean — no new finding
  for `v_order_fact`). The apply bundle was synced to match (PR #109).

**Nav impact of the folds** (visible items/role): Ops 18→10, Sales 10→5, Coordinator
13→5, Sales-manager 9→5, Management 11→6, Auditor 10→6, Business-owner 12→7,
Super-admin 21→12.

## What's left (2 threads — both need a decision, not just code)

### #8 Per-role nav redesign — the safe portion is already delivered; the rest is BLOCKED
The folds above already cut nav to at/near the `02-role-navigation.md` targets for most
roles. The **remaining** target cuts each require a **net-new destination that does not
exist**, so finishing #8 is a product decision, not a subtraction:
- **Auditor → `Audit · Search`** needs a **global Search** screen. (Note: a
  `fn_global_search(p_q)` RPC exists in the DB, but there is no UI for it — building that
  UI would unlock the auditor target.)
- **Sales-manager → `… · Team`** needs a **Team** queue screen (pipeline + unassigned +
  overdue + workload + reassign).
- **Management → `Overview · … · Financial`** needs an **Overview** KPI landing and a
  **Financial** (receivables + revenue) destination.
- A read-only **Training** catalogue entry for sales/ops (the current `/courses` is the
  admin edit screen, gated to super_admin/operations).

Guardrail tension: this pass is **subtraction-only**, and this app has **no global
search fallback**, so dropping the remaining items from nav without building these
destinations would *remove practical access*, not just prominence. Decide whether to
build the destinations (then trimming nav is safe) before touching `src/lib/roles.ts`.

### #21 Visual-weight — remainder deferred for a previewed pass
Done: FeedbackPanel card-in-card. **Remaining, want eyes on the deploy preview** (they
restyle live daily-use forms/records):
- `ReceivablePanel` (`:131/143/207`) and `ContactsPanel` (`:68`) sub-form cards double-box
  inside the detail-screen card wrappers (`OrderDetail:347`, `ClientDetail:323`) — de-card
  the sub-forms (→ `record-section`/bordered) or drop the outer wrapper.
- Stacked-card merges on the ClientDetail (`:181`+`:197`) and OrderDetail (`:310`) overviews
  — merge into one card with `record-section` dividers (the SessionDetail pattern is the
  model). Also worth standardizing: ClientDetail uses `RecordSection > .card` while
  OrderDetail uses `.card > RecordSection`.

## Working method (as used this session)
Per item: fresh branch off latest `main` → implement **capability-preserving** (nothing
loses access; retired screens redirect and their content stays reachable) →
`git checkout -- tsconfig.tsbuildinfo` → `npx tsc --noEmit` → `npm run build` (both must
pass) → commit (trailer `Co-Authored-By: Claude <noreply@anthropic.com>`) → push → draft
PR → deploy-preview goes green → merge. Append a wave entry to `IMPLEMENTATION-LOG.md`.
DB items: verify against the **live DB** first (repo↔DB drift), write an idempotent
migration, apply it, then re-run advisors and sync the `supabase/bundles/` bundle.

## Guardrails
- No new business capability — subtraction/consolidation only. (This is exactly why #8's
  remainder is blocked: it needs new destinations.)
- Retired screens keep a redirect route for one release (as `/home` and
  `/operations-today` do). Many now do: `/dashboard`,`/reports`,`/quality`,`/data-quality`,
  `/organizations`,`/inquiries`,`/quotations`,`/orders`,`/worklist`,`/elearning`,
  `/course/new`,`/course/[id]/edit`.
- RLS/RPCs are untouched by the UI waves. The one DB change (#23) only recreated a view
  (invoker semantics preserved) and dropped a now-unused column.
- Metrics targets: `docs/ux-third-pass/11-simplification-metrics.md`.
