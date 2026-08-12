# Third-pass execution log

Implementing the `docs/ux-third-pass/` backlog (`10-prioritized-simplification-backlog.md`) in coherent waves. Each wave: capability-preserving (nothing loses access; retired screens redirect and their content stays reachable), tsc + build green, pushed and merged. Backlog item numbers reference `10`.

## Wave 1 — P0 structural quick wins
- **#1 Retire Operations today** — removed from nav; `/operations-today` now redirects to `/my-work` (its 7 aggregator sections were read-only re-presentations of Calendar + My Work + Orders). `OperationsToday.tsx` deleted. Its slices remain reachable: today/this-week via Calendar; sessions/roster/stalled via My Work; e-learning + duplicates keep their own nav items this wave.
- **#10 Approvals off primary nav** — removed the standalone nav item; My Work's "Approvals to decide" queue (→ `/approvals`) is the entry point. `/approvals` route unchanged, so no capability lost (BO/super_admin still decide there; operations never decided — RLS-gated).
- **Retire dead Home** — `Home.tsx` deleted (unreferenced; `/home` already redirects to `/my-work`).
- **Nav effect:** −2 items for the roles that had them (Operations 18→16, and Approvals gone for BO/ops/super_admin nav).
- Files: `src/lib/roles.ts`, `src/app/(app)/operations-today/page.tsx`, deleted `src/screens/{Home,OperationsToday}.tsx`.
