# 20 — Production readiness

## Score: 72 / 100 · Target for general deployment: 85

| Dimension | Score | Reasoning |
|---|---:|---|
| Functional completeness | 78 | Core flows exist end to end; trainer self-service absent by design; quote→order manual |
| Reliability | 80 | Build/lint/type/unit/E2E all green; 0 orphans; no runtime error data (no telemetry) |
| Business-process alignment | 70 | Handoff modelled well but preconditions unenforced; 24.5% of orders unowned |
| Role / permission accuracy | 65 | RLS scoping is correct almost everywhere — but P&L and rates leak to all roles; 5 unguarded screens |
| Data integrity | 88 | Flawless referential integrity, real constraints, audit trail; minor staging-table gaps |
| Operations usability | 76 | Best-served role; missing recurring/duplicate/competency-in-picker |
| Sales usability | 62 | Unowned backlog, manual quote re-entry, split commercial context |
| General UX | 74 | Strong IA and consistent primitives; no result counts, no unsaved-changes guard |
| UI consistency | 80 | Tokenised system, shared primitives; inline styles and mixed pill vocabulary |
| Accessibility | 60 | Login clean and CI-scanned; **21 screens never scanned** — a testing gap, not proven defects |
| Responsive design | 55 | **Not tested at all**; fixed 2-col grids are a likely breakage |
| Performance | 75 | Dashboard RPC, indexes, paging done; unbounded tail queries; 30 RLS initplan warnings |
| Error handling | 78 | Consistent `ErrorNote`/toast/confirm, graceful degradation on missing columns; failure paths untested |
| Maintainability | 85 | Clear conventions, documented decisions, migrations disciplined, RLS regression suite |
| Automated test coverage | 45 | 40 public E2E + 7 unit + RLS suite; **zero authenticated coverage** |

**Weighted overall: 72.**

## Is it ready for real employee use?

**Yes for a controlled pilot** with operations and a small sales group, provided
IMM-1 (cost exposure) is decided and fixed first.

**Not yet for unrestricted deployment**, for three reasons — in order:

1. **A confirmed data-exposure defect.** Every authenticated role can read
   company-wide margin and individual trainer day rates. This is a decision
   plus a small change, not a large project.
2. **No authenticated test coverage.** 22 screens and every CRUD path have never
   been exercised by an automated test or, in this audit, by any signed-in
   session. The risk is unknown rather than known-bad — but unknown is not a
   basis for company-wide rollout.
3. **Operational data is not yet fit for daily use.** A quarter of orders have
   no owner, 6 live sessions have no trainer, 5 of 7 salespeople cannot log in,
   and the team structure is a single flat team.

None of these is architectural. The foundations — data model, RLS design,
workflow RPCs, migration discipline, IA — are sound and, in several respects,
better than typical.

## Path to 85

| Action | Moves | Δ |
|---|---|---|
| Fix cost/margin exposure (IMM-1) | Role accuracy 65→85 | +3 |
| Test account + authenticated E2E running (IMM-2) | Coverage 45→70 | +4 |
| Owner defaults + endorse blocker (IMM-3/4) | Process 70→85, Sales 62→75 | +3 |
| axe + viewport matrix on all screens | A11y 60→75, Responsive 55→75 | +3 |
| Guards on the 5 unguarded screens | Role accuracy +, UX + | +1 |

That reaches ~86 without any of the larger enhancements (recurring sessions,
quote conversion, trainer self-service), which are value-adds rather than
readiness blockers.

## Risks to carry

- **Production is the only database — and this is now a settled decision**
  (owner, 2026-08-14: no second Supabase project). Two consequences to carry
  permanently rather than revisit: every DB change is a production change on
  first application, and no destructive automated test can ever run. Mitigations
  in use: validate each migration against a throwaway PostgreSQL first (as was
  done for the 2026-08-14 migrations, which caught a real off-by-one), keep
  authenticated CI strictly read-only, and treat the RLS regression suite — which
  builds its own disposable database — as the home for write-path testing.
- **No production error visibility** until telemetry is pointed somewhere.
- **Repo ↔ ledger version drift** persists by design of the apply path (DQ-8).
