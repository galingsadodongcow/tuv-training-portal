# 10 — Accessibility audit (WCAG 2.2 AA where practical)

## What was actually tested

**Automated axe-core scan (WCAG 2.0 A + AA) on `/login`: 0 serious or critical
violations.** This runs in CI on every PR and is the only surface that can be
scanned without credentials.

**Every other screen is unscanned.** Statements below are from code inspection.
No screen reader, keyboard walkthrough, zoom test or contrast measurement was
performed on a signed-in page. This is the largest gap in this audit and it is
a *testing* gap, not evidence of a defect.

## Code-level observations (positive)

The codebase follows an explicit accessibility rule set (documented in
CLAUDE.md and visibly enforced):

- Inputs and selects carry a label or `aria-label` — verified by inspection
  across Resources, Admin, Worklist, SavedViews, OwnerAssign.
- Icon-only buttons carry accessible names (`aria-label="Close"`,
  `aria-label={\`Delete view ${name}\`}`).
- Modals/drawers use `role="dialog" aria-modal="true"`, a focus trap
  (`useFocusTrap`) and Escape-to-close.
- Tabs use `role="tablist"` / `role="tab"`.
- The filter summary added this session uses `aria-live="polite"` so filter
  changes are announced.
- Sortable tables and nav were remediated in the earlier hardening pass.
- `aria-pressed` on saved-view chips; `aria-busy` on rows being mutated.

## Findings

**A11Y-1 — WITHDRAWN.** An earlier draft of this audit reported a missing skip
link. That was wrong: `src/components/Shell.tsx` implements one correctly —
`href="#main-content"`, revealed on focus (`top: -48 → 8`), and it moves focus
programmatically to `<main id="main-content" tabIndex={-1}>`. Recorded here
rather than deleted, because the correction is the useful information.

**A11Y-2 (P2, unverified) — status conveyed by pill colour + text.** The text is
present, which satisfies 1.4.1 in principle; **contrast of pill text on tinted
backgrounds was not measured** and `color-mix(... 12% ...)` backgrounds are a
common source of AA failures.

**A11Y-3 (P2, unverified) — the drawer now hosts a full tabbed record.** Focus
management for a *nested* interactive region inside a focus-trapped drawer, and
the interaction between the drawer's Escape handler and a nested confirm dialog,
were not tested. The drawer's `onKeyDown` stops propagation and closes — a
confirm opened inside it may close the drawer instead of the dialog. **Worth a
targeted test.**

**A11Y-4 (P3, unverified) — heading hierarchy across screens** was not audited;
`RecordHeader` emits an `h1` and sections use `.k-label` (a styled div, not a
heading), so section structure may not be exposed to screen readers.

**A11Y-5 (P3) — zoom to 200%** untested.

## Recommended next step

Once a test account exists, extend the existing axe integration to every screen —
the harness already exists (`AxeBuilder` is wired in `e2e/smoke.spec.ts`); it
needs only a signed-in fixture to cover the other 21 screens. This is a
few hours of work and would convert most "unverified" rows above into evidence.
