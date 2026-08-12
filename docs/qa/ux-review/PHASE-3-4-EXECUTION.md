# Phase 3 & 4 execution log

Autonomous execution of **Phase 3 (design system & responsive)** and the safe frontend slice of **Phase 4 (automation)** from the redesign roadmap (`05-quality-automation-design-roadmap.md` §Implementation roadmap). Governing rule, unchanged from the Phase 1–2 pass: **correctness-first and non-destructive** — land every well-bounded, validated, *additive* improvement; defer anything whose blast radius is too large to auto-merge into a live app unsupervised.

**One hard constraint this pass:** the Supabase MCP connection (the live-schema `BEGIN…ROLLBACK` validator every prior DB change in this project relied on) was **unavailable**. So every DB-automation item in Phase 4 — which also *changes live operational behavior* — was deferred rather than auto-merged unvalidated. Everything shipped here is **frontend/CSS only**: no schema change, no migration, no behavior/permission change, `tsc --noEmit` + `next build` both green.

## Shipped — Phase 3 (design system, accessibility & responsive)

| # | Item | What |
|---|---|---|
| **6** | Contrast (WCAG AA) | `--text-faint` darkened `#8f8f8f → #6b6b6b` (~2.9:1 → ~5.3:1 on white); dark-mode value already passed. One token, fixes every `th`/`.fill-label`/`.cmdk-path`/placeholder. |
| **7** | Focus indicators | One shared `:focus-visible` ring (`box-shadow: var(--ring)`) added to `.nav-link`, `.tab`, `.linkbtn`, `.seg-btn`, `.cmdk-item`, `.cal-event`, `.back-link`, and every bare `<button>` — controls that previously had no keyboard-focus style. |
| **8** | Chart data-table alternative | New reusable `ChartTable` + `ChartTableToggle` (`aria-pressed`, `<th scope="col">`, `.scroll-x`). Wired to Dashboard's Recharts charts (booked-revenue, revenue-by-channel) and the funnel (Reports) / NPS (Quality) summaries. Existing `role="img"` charts unchanged. |
| **9** | Status not by color alone | Calendar list rows now render a `▲ At risk` tag whenever a `risk-red`/`risk-amber` bar shows (closing the gap where a far-out amber row had the bar but no text); month-grid events gained a 1-letter status token + `aria-label` so color isn't the only signal. |
| **10** | Currency decision | **Committed to PHP-only + explicit label** (no `currency`/`fx_rate` column — that would be an unvalidated data-model change). `php()` already renders ₱; added an "All amounts in PHP (₱)" caption on Orders and Worklist. |
| **18** | Laptop wide tables | New opt-in `table.sticky-1` utility pins the identifying first column when a wide table scrolls on ≤1200px viewports; applied to Worklist and Orders so rows stay legible while scrolling to the action columns. |
| **25** | Token cleanup (partial) | Hard-coded pill hexes (`.pill-inside` `#7c3aed`, `.pill-field` `#db2777`) tokenized to `--pill-purple`/`--pill-pink`. *(The dark-palette "define once" suggestion was **not** done — the two blocks, `@media prefers-color-scheme` + `[data-theme='dark']`, are both required for the theme toggle to work in each direction; collapsing them would break theming. The `--tr-*` inline-alias migration was left as low-value churn.)* |
| **28** | Required markers + inline errors | SalesEntry now shows `*` (`.req-star`) on genuinely-required fields and per-field `.field-error` messages (+ `.invalid` input state) on submit, in addition to the existing top banner. |
| **29** | Date-range validation | SessionForm blocks submit on any segment whose end precedes its start (inline `.field-error`, `.invalid` input) and soft-warns on out-of-order/overlapping segments. `DateSegments` gained an optional, backward-compatible `errors` prop. |
| **30** | Reference/SAP format check | SalesEntry adds a **non-blocking** format check on the reference/SAP number (`^[A-Za-z0-9-]{3,30}$`) — catches spaces/typos without blocking a legitimate save. |

## Shipped — Phase 4 (safe frontend slice only)

| # | Item | What |
|---|---|---|
| **21** | Inline duplicate warning at source | New RLS-scoped hook `usePossibleDuplicateClients(email)` + a `notice-warn` banner in SalesEntry: when a new-customer email already matches existing client(s), it lists them (linked) and warns "may be a duplicate" — **advisory only, never blocks**. Surfaces the existing `duplicate_candidate` detection at capture time. |

## Deferred (with rationale) — not merged this pass

| Item | Why deferred |
|---|---|
| **#23 Auto inquiry assignment** (round-robin within region) | DB automation that changes *who gets assigned work* — a live behavior/ownership change the roadmap itself flags with load-skew risk. Needs the live-schema validator (MCP down) and sign-off. |
| **#24 Payment-exception flagging** | New DB detection over `payment`/`invoice`; additive but still a migration I can't validate against the live schema right now. |
| **#26 Prep-deadline tasks** (T-14/T-7/T-3) | Extends `fn_generate_worklist_tasks` — a DB generator change; same validation gap. |
| **#27 Escalation ladder** (owner → supervisor → BO) | DB automation + notification routing; behavior change, same validation gap. |
| **Auto status transitions** (Tentative→Confirmed, order→Closed) | Judgment-adjacent automation on live records; explicitly the "automate the paperwork, not the judgment" caution — needs supervised rollout. |
| **#25 dark-palette dedup; `--tr-*` migration** | Dedup would break the theme toggle (see above); the alias migration is churn without user-visible benefit. |
| **#19 icon-only rail (861–1180px)** | A structural layout change to the shared shell with real regression risk on a live app; the `sticky-1` first-column pin delivers the core laptop win at far lower risk. |

**Why the Phase 4 automation is deferred, not dropped:** each item is a DB migration that both (a) changes live operational behavior and (b) cannot be validated against the production schema while the Supabase MCP is disconnected. That is exactly the class the governing rule says to hold for a supervised pass. They should be implemented as validated, idempotent migrations, dry-run against the live schema, applied via `apply-supabase.yml`, and re-checked with the advisors — the same discipline used for the Phase 1 DB work.

## How it was applied

Frontend-only: normal branch → PR → Netlify build. No migration, no `apply-supabase.yml` run this pass.
