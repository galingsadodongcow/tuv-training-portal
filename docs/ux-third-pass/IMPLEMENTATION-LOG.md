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

## Wave 10 — CRM workspace
- **#7 CRM workspace** — the four commercial nav items (Inquiries, Quotations, New order, Orders) collapse into **one `/crm` area** with role-scoped tabs, mirroring the Analytics shell. New `src/screens/CRM.tsx`; each panel is an existing screen rendered `embedded` (the shell owns the heading + one tab strip).
  - **Tabs** (role-scoped, deep-linkable via `?tab=`): **Pipeline** (Inquiries — pipeline roles) · **Quotes** (Quotations — the old quote roles) · **Orders** (all roles). Visibility mirrors the old route Guards; default = the first tab the role can see.
  - **New order is an action, not a tab** — a "+ New order" button in the CRM header and on the **customer record** (gated to super_admin/sales/coordinator). The create form keeps its own `/sales-entry` route (off-nav); its `quote`/`schedule`/`client` deep-link params are untouched.
  - **Nav:** the four CRM items become one **CRM** entry. Old list routes redirect into the shell: `/inquiries → /crm?tab=pipeline`, `/quotations → /crm?tab=quotes`, `/orders → /crm?tab=orders` (the orders stub **forwards** `q`/`stage`/`pay` so drill-throughs keep working). Record routes `/orders/[id]` and `/quotations/[id]` are unchanged.
  - **Inbound links repointed** to the tabs (Dashboard cards, My Work, Command palette, Notifications, Quote record crumbs) so common navigation avoids a redirect hop; the redirects remain the safety net for the rest.
  - Orders keeps its own `q`/`stage`/`pay` URL params, which coexist with the shell's `?tab=` (its `setParam` preserves `tab`; the shell starts a tab clean on switch).
- Files: `src/screens/{CRM,Inquiries,Quotations,Orders,ClientDetail,QuoteDetail}.tsx`, `src/components/{CommandPalette,NotificationCenter}.tsx`, `src/screens/{Dashboard,MyWork}.tsx`, `src/lib/roles.ts`, `src/app/(app)/{crm,inquiries,quotations,orders}/page.tsx`.

## Wave 11 — Fulfillment → Orders saved view
- **#5 Fulfillment → Orders saved view** — the standalone Fulfillment queue (Worklist) folds into the **CRM Orders tab** as a **"Needs fulfillment"** saved view, beside "All orders".
  - The CRM Orders tab now carries a saved-view sub-toggle (`?queue=fulfillment`, distinct from the shell's `?tab` so the queue keeps its own `who`/`view`/`stage` params): **All orders** renders the orders book, **Needs fulfillment** renders the full Worklist queue (advance / assign / bulk controls) `embedded`.
  - **Nav:** the **Fulfillment** item is removed from the Operations group. `/worklist` now **redirects** to `/crm?tab=orders&queue=fulfillment`, **forwarding** the queue's `who`/`view`/`stage` filters so every drill-through (Dashboard/DataQuality `/worklist?who=…&view=…`) lands on the right filtered queue in one hop.
  - Capability-preserving: same queue, same controls, same role gating (management/auditor stay read-only via Worklist's existing `canAct`; RLS authoritative). My Work's "orders needing attention" queue already existed and is untouched.
- Files: `src/screens/{CRM,Worklist}.tsx`, `src/lib/roles.ts`, `src/app/(app)/worklist/page.tsx`.

## Wave 12 — Duplicates + E-learning → exceptions / views
- **#14 Duplicates + E-learning off nav** — both standalone modules move to where the work already lives, and their nav items go. Entry points are surfaced in the same change so nothing is orphaned.
  - **Duplicates → a My Work exception.** My Work gains a **"Possible duplicate orders"** section (count + candidate pairs + match basis) for the roles that resolve them (super_admin/operations/coordinator); each row links to **`/duplicates`** (kept, off-nav) to reconcile. Dashboard/DataQuality duplicate cards still point at `/duplicates`.
  - **E-learning → a CRM Orders saved view.** The Orders tab gains an **"Awaiting e-learning"** saved view (`?queue=elearning`, shown only to the e-learning roles) that renders the E-learning grant screen `embedded`. `/elearning` **redirects** to `/crm?tab=orders&queue=elearning`.
  - **Nav:** the **Duplicates** and **E-learning access** items are removed from the Operations group.
  - Capability-preserving: same screens, same grant/merge actions, same role gating (the e-learning saved view is gated to the old `/elearning` roles; RLS authoritative).
- Files: `src/screens/{MyWork,Elearning,CRM}.tsx`, `src/lib/roles.ts`, `src/app/(app)/elearning/page.tsx`.

## Wave 13 — Training Catalogue
- **#13 Training Catalogue** — the Courses screen and the course form merge into **one directory + edit-drawer**, unifying the **two `course_fee` editors** into a single path.
  - **Directory** (`Courses.tsx`): a clean course list — Course · Type · a read-only fee per learning type. The **inline fee-grid editor was removed** (it was one of the two duplicate `course_fee` upsert/delete paths). A row (or "+ New course") opens a **right-side edit-drawer** hosting the course form; the form is now the *only* place fees are edited.
  - **Drawer**: reuses the house `.drawer-scrim`/`.drawer` pattern (role=dialog, Escape / scrim to close). `CourseForm` gained `{ courseId, onDone }` props — when hosted, it renders bare (the drawer owns the chrome) and save/cancel just close the drawer; standalone rendering is preserved.
  - **Routes**: `/course/new` → `/courses?new`, `/course/[id]/edit` → `/courses?edit=<id>` (redirects; the drawer is deep-linkable). Calendar's "New course"/"Course" edit links resolve through these. Nav item relabelled **Training catalogue**.
  - Capability-preserving: same fields, same category/hierarchy handling, same create/edit, same fee upsert-then-delete-removed logic — now in one editor. (The old inline "confirm before clearing a price" gate is superseded by unchecking a learning type in the form.)
- Files: `src/screens/{Courses,CourseForm}.tsx`, `src/lib/roles.ts`, `src/app/(app)/course/new/page.tsx`, `src/app/(app)/course/[id]/edit/page.tsx`.

## Wave 14 — Finish S6 adoption + retire course.category (DB) — DRAFT for review
- **#23 Retire free-text `course.category`** — the app now reads the category name from the **S6 category → subcategory hierarchy** everywhere, and a migration drops the redundant free-text column. **Left as a draft PR for review; the migration is NOT applied to the live DB** (apply via `apply-supabase.yml` after review, then re-simulate RLS + re-run advisors).
  - **Live-DB verification before writing anything:** all 26 active courses carry `subcategory_id`; the hierarchy-derived category name equals the old free-text `course.category` for **26/26 courses and 163/163 `v_order_fact` rows (zero mismatches)**. The only DB dependency on the column is the `v_order_fact` view (no functions, matviews, generated columns, or indexes).
  - **App**: `data.ts` `useCourses`/`useSchedules` join `subcategory → category` and a `withCategory` helper maps the name onto `course.category` (+ `course.subcategory`) so call sites are unchanged; `useSchedule` drops the field (its consumer doesn't show it). Calendar surfaces subcategory in the drawer + list and its category filter reads the hierarchy-sourced value; `CourseForm` stops writing the free-text column (the subcategory is the source of truth). A legacy free-text fallback remains for pre-S6 DBs.
  - **Migration** (`20260812230000_s6_retire_course_category.sql`): recreates `v_order_fact` sourcing `category` from the hierarchy (**preserving `security_invoker=true`** — a plain replace would drop it and bypass RLS), then `drop column if exists course.category`. Idempotent.
- Files: `src/hooks/data.ts`, `src/screens/{Calendar,CourseForm}.tsx`, `supabase/migrations/20260812230000_s6_retire_course_category.sql`.

## Wave 15 — table defaults + density polish (P3)
- **#22 Uniform table default sort + primary row action** (targeted, low-risk):
  - **Clients** — added an explicit default sort (`company` asc) to the already-sortable, already-clickable table.
  - **Courses (Training catalogue)** and **Calendar list rows** — the rows opened on mouse click only; added `role="button"` + `tabIndex` + Enter/Space keyboard handlers (matching the Orders/Clients gold pattern) so the primary row action is keyboard-reachable.
  - **E-learning** — the order id in both tables is now a link to the order record (the primary drill), instead of plain text.
  - Verified the rest already conform: Orders/Quotations rows are keyboard-clickable with sensible default order (`created_at desc`); Reports/aggregates are pre-sorted in their memos; Admin/Duplicates/Pricing/Communications/MyWork tables are inline-edit grids, symmetric-choice, or curated worklists where a single row action is intentionally absent.
- **#21 Visual-weight (partial)** — fixed the self-contained card-in-card in **FeedbackPanel** (the "Record a response" form was a `.card` nested inside the panel's `.card`; now a `.record-section` divider, matching the SessionDetail "one card, dividers" DEN1 pattern). *Deferred for a previewed pass:* the ReceivablePanel/ContactsPanel sub-form double-boxes and the stacked-card merges on ClientDetail/OrderDetail overviews — restyling live daily-use forms/records is better judged with eyes on the preview.
- Files: `src/screens/{Clients,Courses,Calendar,Elearning}.tsx`, `src/components/FeedbackPanel.tsx`.

## Wave 16 — Global Search destination (#8, build phase)
- **#8 build — Global Search.** The first of the net-new destinations that unblock the remaining per-role nav cuts (this session is the explicit opt-in to *build* them; the nav trim itself lands in a later wave). The auditor target (`Audit · Search`) and the app's lack of any global-search fallback both need a permanent search home.
  - **New `/search` screen** (`src/screens/Search.tsx`): a full-page record search driven by the **existing** `fn_global_search(p_q)` RPC (SECURITY DEFINER, already deployed — only the UI was missing). Debounced, two-character minimum, deep-linkable via `?q=` (shareable, survives refresh), with loading / empty / error states. Hits are grouped by kind (Order · Customer · Participant · Session · Organization · Inquiry) and each links to its record route; the DB still scopes what a user can actually open.
  - **Shared kind config** (`src/lib/search.ts`): the record-kind → label/href/roles map plus a `visibleHits(hits, role)` filter, extracted so the ⌘K **CommandPalette** and the `/search` screen share one source of truth. CommandPalette refactored to consume it (behaviour unchanged).
  - **Route + Guard** (`src/app/(app)/search/page.tsx`): available to every authenticated role (the palette already gave everyone search); nav prominence for the auditor comes in the nav-trim wave. No new tables/RPCs; RLS + the RPC's own auth guard remain authoritative.
- Files: `src/lib/search.ts` (new), `src/screens/Search.tsx` (new), `src/app/(app)/search/page.tsx` (new), `src/components/CommandPalette.tsx`.

## Wave 17 — Team queue destination (#8, build phase)
- **#8 build — Team (sales manager).** The manager-specific queue that the `02-role-navigation.md` target (`… · Team`) calls for — the work that was scattered across Fulfillment + Orders + the pipeline, gathered into one destination so those items can leave the manager's nav.
  - **New `/team` screen** (`src/screens/Team.tsx`): a role shell with three tabs, each reusing an existing screen `embedded` (no new data paths):
    - **Workload** — a roll-up of the open fulfillment queue by owner (open orders · stalled >14d · value per rep, plus an Unassigned row and four summary tiles). Computed client-side from `useFulfillmentQueue` (the same RLS-scoped queue the Queue tab reads), so a manager sees the load distribution before rebalancing.
    - **Queue** — the fulfillment queue (`Worklist embedded`), which already carries **unassigned** (Claim queue), **overdue** (stalled / SLA), and **reassign** (the per-row owner select + bulk assign).
    - **Pipeline** — the lead pipeline (`Inquiries embedded`).
  - **Route + Guard** (`src/app/(app)/team/page.tsx`): `sales_manager` + `super_admin`. RLS already scopes every underlying query to the manager's team/region — no new access is granted, no new tables/RPCs.
- Files: `src/screens/Team.tsx` (new), `src/app/(app)/team/page.tsx` (new).

## Wave 18 — Overview + Financial destinations (#8, build phase)
- **#8 build — Management Overview + Financial.** The two net-new destinations the `02-role-navigation.md` management target (`Overview · Customers · Training · Financial · Analytics`) needs. Both reuse existing screens `embedded`, so there is one implementation of each surfaced as a first-class destination.
  - **`/overview`** (`src/screens/Overview.tsx`) — the KPI landing that replaces "My Work" for a role with no task queue. Renders the role-scoped `Dashboard embedded` (booked/delivered revenue, pipeline, conversion, AR, session health, exceptions; every tile a drill-through). Guard: `management` + `super_admin`.
  - **`/financial`** (`src/screens/Financial.tsx`) — receivables + revenue in one place, a small two-view strip (`Receivables` default · `Revenue`, deep-linkable via `?view=`) each rendering `Reports embedded section=…`. Guard: `management` + `business_owner` + `operations` + `super_admin` (the roles that already see the financial reports; RLS authoritative and these views are read-only for them).
  - No new tables/RPCs; both are compositions of screens/hooks that already exist. Whether Overview becomes management's *default landing* (vs. My Work) is a routing decision deferred to the nav-trim wave.
- Files: `src/screens/Overview.tsx` (new), `src/screens/Financial.tsx` (new), `src/app/(app)/overview/page.tsx` (new), `src/app/(app)/financial/page.tsx` (new).

## Wave 19 — Training read-only catalogue (#8, build phase)
- **#8 build — read-only Training.** The `02-role-navigation.md` targets give **sales / operations / management** a "Training" catalogue entry, but the existing `/courses` is the **admin edit screen** (gated super_admin/operations). This adds a read-only entry without widening that screen's write access.
  - **`Courses` gains a `readOnly` prop** — same directory (course · type · fee per learning type), but with the create/edit affordances removed: no "+ New course", no edit-drawer, non-interactive rows, and a subtitle that points sessions/dates to the Calendar. One screen implementation, two modes.
  - **`/training`** (`src/app/(app)/training/page.tsx`) renders `Courses readOnly` behind a broad read Guard (super_admin, operations, sales, coordinator, sales_manager, business_owner, management — every non-auditor role that may quote or deliver training). `/courses` is unchanged (still the edit screen, super_admin/operations).
  - **RLS is authoritative**: `readOnly` only removes UI affordances; the catalogue fee/course tables already deny writes to these roles at the DB. No new tables/RPCs. (Reuses `useCourses`/`useCourseFees`, whose `withCategory` mapping keeps the retired `course.category` column out of play.)
- Files: `src/screens/Courses.tsx`, `src/app/(app)/training/page.tsx` (new).

## Wave 20 — Per-role nav trim (#8, finish)
- **#8 finish — trim `roles.ts` to the `02-role-navigation.md` targets.** Now that the destinations the remaining cuts depended on exist (waves 16–19), the nav is trimmed to each role's target. **Depends on the destination PRs (#111–#114); merge those first.** Route Guards are untouched — nothing loses *authority*, only nav *prominence*; RLS stays authoritative.
  - **Result per role** (visible primary items): **operations** My Work · Calendar · CRM · Training · Trainers&venues · Analytics + Admin(Pricing/Communications/Rollover); **coordinator** My Work · Calendar · CRM · Customers; **sales** My Work · CRM · Customers · Training; **sales_manager** My Work · CRM · Customers · Team · Analytics; **management** Overview · Customers · Training · Financial · Analytics; **auditor** Search · Audit; **super_admin** My Work · Calendar · CRM · Customers · Training · Trainers&venues · Analytics + Admin + Audit; **business_owner** unchanged (no target defined).
  - **Two mutually-exclusive homes** beyond My Work: **Overview** (management — no task queue) and **Search** (auditor). A new `homePathForRole()` routes the root (`/`), the post-login redirect, and Guard's unauthorized bounce to the right home per role (management → `/overview`, auditor → `/audit`, else `/my-work`). Root `page.tsx` is now a role-aware client redirect.
  - **Training** is two entries sharing the label: read-only `/training` (sales, management) and the edit `/courses` (super_admin, operations) — disjoint roles, so each role sees exactly one. **Admin** stays a grouped section (Pricing/Communications/Rollover/Users) so the config screens (no search fallback) aren't stranded — per the confirmed product decision.
  - **Reachability preserved:** dropped items keep their routes + Guards; a role reaches them via record links, the ⌘K palette / `/search`, or Overview drill-through. New nav icons: `search`, `team`, `financial`.
- Files: `src/lib/roles.ts`, `src/components/{Guard,NavIcon}.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`.

## Wave 21 — Visual-weight remainder (#21)
- **#21 finish — card-in-card + stacked overview cards.** The remainder deferred from wave 15 for a previewed pass, following the SessionDetail "one card + `record-section` dividers" model (DEN1).
  - **New `.subform` utility** (`globals.css`) — a soft-bordered inset (no elevation), lighter than a `.card`, for the inline pop-open forms that live inside a record card. Applied to the double-boxing sub-forms: **ReceivablePanel** (record-payment, add-invoice, refund) and **ContactsPanel** (add-contact). They no longer render a full card inside the detail-screen card wrapper.
  - **OrderDetail overview** — the three stacked cards (Fulfillment · Endorsement · Details) collapse into **one `.card card-pad` with `record-section` dividers**. A small `ovSection` helper renders the first *visible* section flush (its title as a plain `k-label`) and the rest with a divider, since which section is first depends on the role's gates.
  - **ClientDetail overview** — the always-visible KPI card and the overview-tab details grid merge into **one overview-tab card** (Summary grid → `Details` section → `Related accounts` section), matching the SessionDetail pattern; Related accounts is de-carded into a `record-section` (its table wrapped in `.scroll-x`) so the overview is one card, not stacked/nested cards. **Behaviour note for review:** the customer KPI grid now lives in the overview tab rather than always-on above the tabs — the header badges still carry owner/overdue/archived on every tab. Standardises ClientDetail's overview to the `.card > RecordSection` convention (matching OrderDetail).
  - Capability-preserving: no logic, gating, or data changed — only the wrapping/markup. RLS untouched.
- Files: `src/app/globals.css`, `src/components/{ReceivablePanel,ContactsPanel}.tsx`, `src/screens/{OrderDetail,ClientDetail}.tsx`.
