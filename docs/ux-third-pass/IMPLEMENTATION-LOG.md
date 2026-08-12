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
