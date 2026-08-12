# Third-pass simplification — handoff for a fresh session

Execution of `docs/ux-third-pass/` paused after 12 of 23 backlog items. This file is the worklist for the remaining 11 — the large, interdependent rewrites that need a fresh context to build and preview properly. Read `README.md`, `10-prioritized-simplification-backlog.md`, and `IMPLEMENTATION-LOG.md` (waves 1–6) first.

Repo `galingsadodongcow/tuv-training-portal`, base `main`. Read `CLAUDE.md`. Supabase MCP is available in this workspace for the DB item.

## Done + merged (do NOT redo)
#1 retire Operations today · #3 Data-quality already super_admin-only · #9 Session detail (tabs 6→5, badges, status→1+More) · #10 Approvals off nav · #11 Sales My Work queues · #12 Calendar list one-table (filter reduction still pending) · #15 Inquiries table view · #16 Customer 360 tab drop · #17 Course progressive form · #18 Admin grouping · #19 Resources Load tab · #20 Move-booking relabel · dead `Home.tsx`/`OperationsToday.tsx` deleted.

## Working method (unchanged)
Per item: fresh branch off latest `main` → implement **capability-preserving** (nothing loses access; retired screens redirect and their content stays reachable) → `git checkout -- tsconfig.tsbuildinfo` → `npx tsc --noEmit` → `npm run build` (both must pass) → commit (trailer `Co-Authored-By: Claude <noreply@anthropic.com>`) → push → draft PR → **preview each large rewrite before merge** (the earlier session auto-merged the safe tier; these want eyes). Append a wave entry to `IMPLEMENTATION-LOG.md`.

## Remaining 11 — build in THIS ORDER (consolidations before nav cuts)

### 1. #4 Status/health consolidation (do FIRST — later screens inherit it)
Collapse the **three** attention vocabularies into one `{ok|risk|blocked}` scale reused everywhere.
- Files: `src/lib/{orderState,health,leadHealth}.ts` (+ `globals.css` pill classes, ~14 `pill-*`). `orderState` flags and `leadHealth` become *inputs* that map onto the one `health` scale, not separate pill systems.
- Cap each record at **Status + Health + owner**; retire decorative proximity pills (Today/This week/Soon) → plain date + health colour.
- ~34 files reference pills — change the source modules + a shared mapping, not every call site by hand where avoidable. Verify no cell shows >1 health pill.

### 2. #2 Analytics merge
Dashboard + Reports (6 tabs) + Quality (3 tabs) + Data-quality → **one Analytics area**, role-scoped tabs (Overview · Revenue · Receivables · Certificates · Profitability · Quality). Role dashboards become the "Overview" tab. Complaints (Quality) → a record list, not an analytics tab. Keep all routes as redirects for a release. `AnalyticsTabs.tsx` already ties these — extend it into the single shell.

### 3. #6 Organizations → Customer 360
Fold `Organizations` + `OrganizationDetail` into the customer record: parent/child grouping on Customer 360 Overview + a "Related accounts" list. Remove Organizations from nav; org bulk admin → Admin › Reference data. `organization` table stays in the DB. Redirect `/organizations*`.

### 4. #7 CRM workspace
Inquiries + Quotations + New order + (my) Orders → one **CRM** destination with views/tabs (Pipeline · Quotes · Orders). "New quote/New order" become actions inside CRM + from a customer. Keep record routes; consolidate the nav entry.

### 5. #5 Fulfillment → Orders saved view
Port Worklist's advance/assign/bulk controls onto an Orders **saved view** ("Needs fulfillment"). Remove Fulfillment from nav; redirect `/worklist` → `/orders?view=fulfillment`. My Work "orders needing attention" already exists.

### 6. #14 Duplicates + E-learning → exceptions/views
Duplicates → a My Work exception card → resolve drawer. E-learning → an Orders saved view ("Awaiting e-learning access"). Remove both from nav; keep routes. Surface the entry points BEFORE removing nav so nothing is orphaned.

### 7. #8 Per-role nav redesign (LAST of the structural items — depends on 2–6)
Cut nav to the `02-role-navigation.md` targets (Ops 18→6, Sales 10→4, Auditor 10→2, Management 11→5, etc.). Only safe once #2/#6/#7/#5/#14 have folded their destinations. `src/lib/roles.ts` — preserve each surviving item's role array; reduce prominence, don't remove access.

### 8. #13 Training Catalogue
Courses screen + CourseForm fee editing → one directory + edit-drawer (unify the two fee-edit paths). Contained to Courses/CourseForm.

### 9. #23 Finish S6 adoption + retire `course.category` (DB — Supabase)
Point Calendar filters + Reports at the `category`/`subcategory` tables (currently free-text `course.category`), surface subcategory, THEN drop `course.category` in a migration once nothing reads it. Also finishes #12's Calendar filter reduction (Category filter reads the hierarchy). Apply via `.github/workflows/apply-supabase.yml`, re-simulate RLS, re-run advisors.

### 10–11. Polish
#21 visual-weight pass (fewer nested cards on Overviews — extend DEN1). #22 uniform table default sort + primary row action.

## Guardrails
- No new business capability — subtraction/consolidation only.
- Retired screens keep a redirect route for one release (as `/home` and `/operations-today` do).
- RLS/RPCs/tables are untouched — this is UI. The customer-authority + S6 migrations are already live (see `docs/final-uat/`).
- Metrics targets to hit: `docs/ux-third-pass/11-simplification-metrics.md`.
