# Third-pass execution log

Implementing the `docs/ux-third-pass/` backlog (`10-prioritized-simplification-backlog.md`) in coherent waves. Each wave: capability-preserving (nothing loses access; retired screens redirect and their content stays reachable), tsc + build green, pushed and merged. Backlog item numbers reference `10`.

## Wave 1 — P0 structural quick wins
- **#1 Retire Operations today** — removed from nav; `/operations-today` now redirects to `/my-work` (its 7 aggregator sections were read-only re-presentations of Calendar + My Work + Orders). `OperationsToday.tsx` deleted. Its slices remain reachable: today/this-week via Calendar; sessions/roster/stalled via My Work; e-learning + duplicates keep their own nav items this wave.
- **#10 Approvals off primary nav** — removed the standalone nav item; My Work's "Approvals to decide" queue (→ `/approvals`) is the entry point. `/approvals` route unchanged, so no capability lost (BO/super_admin still decide there; operations never decided — RLS-gated).
- **Retire dead Home** — `Home.tsx` deleted (unreferenced; `/home` already redirects to `/my-work`).
- **Nav effect:** −2 items for the roles that had them (Operations 18→16, and Approvals gone for BO/ops/super_admin nav).
- Files: `src/lib/roles.ts`, `src/app/(app)/operations-today/page.tsx`, deleted `src/screens/{Home,OperationsToday}.tsx`.

## Wave 2 — record trims
- **#19 Resources — drop Trainer-load tab** — 3 tabs → 2 (Trainers, Venues). Its only distinct metric ("delivered") folded into the Trainers row (`Sessions (delivered)` column). `TrainerManage` modal unchanged.
- **#16 Customer 360 — drop Sessions tab** — 6 tabs → 5. The sessions-booked list folds into the Orders tab (they hang off the same orders). `?tab=sessions` no longer exists.
- **#9 Session detail (partial)** — **Feedback tab folded into Activity** (6 → 5 tabs; `?tab=feedback` normalises to `activity`); **GoPill removed from the header** (it duplicated health — Go/No-Go is the reason behind health, already shown in the Go/No-Go panel). Header badges 6 → ~5. *(Carried to a later wave: the 7-button status row → 1 primary + More.)*
- **#20 Relabel** — the order/booking move UI ("Transfer" on Session Orders + Order Lines + the shared `TransferOrder` modal) → **"Move booking"**, so it stops reading as the participant **Transfer** (which stays in the roster).
- Files: `src/screens/{Resources,ClientDetail,SessionDetail,OrderDetail}.tsx`, `src/components/TransferOrder.tsx`.
- *Carried forward:* #17 CourseForm progressive disclosure, session status-row → primary+More.

## Wave 3 — form & action trims
- **#17 Course create — progressive disclosure** — certification, assessment, pass mark, cert validity, seat-cap override, and webshop URL fold behind an **"Advanced"** toggle (open when editing so populated values show; folded for a new course). Essentials up front: title, category/subcategory, training type, learning types + fees. No submit-behaviour change (folded fields keep their defaults).
- **#9 finish — Session status row → one primary + More** — the 7-button operations status strip now shows a single state-appropriate primary (**Confirm session** while Tentative, else **Close session**) plus **More actions** (the raw status overrides, Cancel-with-dispositions, Clone). Session detail is now: 5 tabs, ~5 header badges (was 6), 1 primary status action (was 7 competing buttons).
- Files: `src/screens/{CourseForm,SessionDetail}.tsx`.

## Wave 4 — Inquiries table view
- **#15 Inquiries default table view** — added a **Table / Board** toggle (Table is the default). The table shows the daily-work columns — Customer · Training interest · Owner · Stage · Health · Est. value · Expected close — sorted open-first (stage order) then by expected close, with inline Edit / Advance / Lost / Reopen (canEdit-gated). Kanban board kept as the toggle for pipeline-movement. This makes "who to work / what's overdue" scannable without reading the board.
- **#18 (already satisfied)** — config (Courses/Pricing/Communications/Rollover/Data-quality/Users/Audit) already sits under one **Admin** nav group; no change needed.
- Files: `src/screens/Inquiries.tsx`.

## Wave 5 — Calendar list view
- **#12 (partial) Calendar** — the List view's two split tables (PersCert / Professional Training) collapse into **one combined Sessions table**; the Training-type column already distinguishes them. Removed the `perscert`/`professional` subset derivations. *(Carried: filter-bar reduction 7→4 — deferred with the S6 category-source change so the Category filter reads the hierarchy rather than free-text.)*
- Files: `src/screens/Calendar.tsx`.

## Wave 6 — Sales My Work queues
- **#11 Sales My Work queues** — added two sales-facing action queues to My Work (shown only to sales/sales_manager/coordinator/super_admin; data already RLS-scoped): **Follow-ups due** (open inquiries carrying a lead-health flag — ageing/stalled) and **My quotes** (Draft/Sent, with quote-health). Gives Sales the same "what needs me" completeness Operations has, and makes the eventual Sales nav reduction safe. Additive; nothing removed. *(Carried: a distinct "returned orders" flag needs handoff-return data on the order row — deferred.)*
- Files: `src/screens/MyWork.tsx`.

## Wave 7 — status/health consolidation
- **#4 Status/health consolidation** — the three competing attention vocabularies (session `health`, order `orderState` flags, lead/quote `leadHealth` badges) now collapse onto **one three-level scale — `blocked · risk · ok`** (+ a terminal `done`), defined once in `src/lib/health.ts` (`Signal`, `signalMeta`, `signalFromTone`). `orderState` and `leadHealth` map their raw signals onto that scale instead of each carrying its own pill classes:
  - `leadHealth` badges stopped borrowing **status** pills (`pill-nogo`/`pill-tentative`/`pill-cancelled`) for **health** meaning — Stalled/Expired → `blocked`, Ageing/Expiring → `risk`, Won/Lost/Accepted → `done`.
  - `orderState.flagClass()` maps an order flag's tone onto the scale; `BlockerBar` chips use it (were reusing `pill-nogo`/`pill-tentative`/`pill-webshop`).
  - session `healthMeta` folds **At Risk** and **Needs Attention** onto one `risk` colour (the label still distinguishes them), and **Healthy → ok**.
- **Retired the decorative proximity pills** (Today / This week / Soon) on the Calendar list — `UrgencyPill` removed; the row now shows the plain date plus a muted `in Nd` relative hint (no coloured pill). Calendar's `RiskTag` reads on the shared scale (red bar → `blocked`, amber bar → `risk`) instead of reusing proximity classes.
- **CSS:** consolidated `.health-*` to the single scale (`.health-blocked/.health-risk/.health-ok/.health-done` + dots); deleted `.health-attention`, `.health-healthy`, and the now-unused `.pill-today/.pill-thisweek/.pill-soon`. Every screen inherits the change because the render sites read `.cls` from the source modules — no per-call-site colour logic left. Capability-preserving: every label/flag still shows; only the colour vocabulary is unified, and no cell renders more than one health pill.
- Files: `src/lib/{health,leadHealth,orderState}.ts`, `src/components/BlockerBar.tsx`, `src/screens/Calendar.tsx`, `src/app/globals.css`.

## Wave 8 — Analytics merge
- **#2 Analytics consolidation** — the **five** analytics destinations (Dashboard, Reports, Quality, Data quality, and the `AnalyticsTabs` strip that tied the first three) collapse into **one `/analytics` area** with a single role-scoped tab bar and no second level of tabs. New `src/screens/Analytics.tsx` is the shell; each panel is an existing screen rendered `embedded` (the shell owns the heading + tab strip).
  - **Tabs** (role-scoped, deep-linkable via `?tab=`): **Overview** (all roles — the role dashboards) · **Revenue · Receivables · Certificates · Profitability · Pipeline** (report roles — the old Reports sub-tabs, flattened to the top level) · **Quality** (feedback + trainer scores) · **Data quality** (super_admin). Role→tab visibility mirrors the old route Guards exactly, so nobody gains or loses access; an out-of-role `?tab=` falls back to Overview.
  - **Role dashboards → Overview**; the Reports **Digest** (operational watch-list) folds under Overview for report roles.
  - **Complaints → a record list**, not an analytics tab: extracted to `src/screens/Complaints.tsx` at **`/complaints`** (Guard = the old Quality roles; ops/BO/super_admin manage, management read-only). Reachable from the Quality tab and back.
  - **Routes kept as redirects** for a release: `/dashboard → /analytics`, `/reports → /analytics?tab=revenue`, `/quality → /analytics?tab=quality`, `/data-quality → /analytics?tab=data`. Dashboard KPI cards repointed from `/reports`·`/data-quality` to the matching `/analytics?tab=…`.
  - **Nav:** the single "Analytics" item now points to `/analytics`; the standalone **Data quality** Admin item is retired (super_admin reaches it as the Data quality tab). `AnalyticsTabs.tsx` deleted.
- Files: `src/screens/{Analytics,Complaints,Dashboard,Reports,Quality,DataQuality}.tsx`, `src/app/(app)/{analytics,complaints,dashboard,reports,quality,data-quality}/page.tsx`, `src/lib/roles.ts`; deleted `src/components/AnalyticsTabs.tsx`.

## Wave 9 — Organizations → Customer 360
- **#6 Organizations → Customer 360** — the standalone Organizations book folds into the customer record.
  - **Customer 360 Overview** gains **Related accounts**: the parent organization plus the sibling customers under it (`useOrgClients(client.org_id)`, self excluded), each linking to its customer record, with a **"Manage organization ›"** link to the org record. The existing editable Organization field stays; **org creation folds in** as an inline **"+ New"** (create org + group this customer), gated to the old Organizations-screen creators (super_admin / owning sales).
  - **Nav:** the **Organizations** item is removed from the Customers group. `Organizations.tsx` (list) deleted; `/organizations` now **redirects to `/clients`**.
  - **Org record kept, off-nav:** `/organizations/[id]` (`OrganizationDetail`) stays reachable from a customer to manage members, attributes, and files — so no org-admin capability is lost (there is no Admin › Reference data home yet; redirecting the record would have dropped org files/edit/membership). Its crumbs/back now point to Customers.
  - `organization` table + RLS untouched; app still uses the `org_id` column (the `organization_id` canonical/`org_id` mirror sync trigger from the phase-B migration bridges it).
- Files: `src/screens/{ClientDetail,OrganizationDetail}.tsx`, `src/lib/roles.ts`, `src/app/(app)/organizations/page.tsx`; deleted `src/screens/Organizations.tsx`.
