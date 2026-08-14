# 11 — Responsive design audit

## Testing status: NOT PERFORMED

The brief asks for verification at 1920×1080, 1440×900, 1366×768, 1280×720,
1024×768, 768×1024, 430×932 and 390×844. **None of these were tested.** Every
screen except `/login` requires authentication, and no test account exists.
Reporting estimated responsive behaviour as if observed would be misleading, so
this file records the design-level evidence only and the plan to close the gap.

## Design-level evidence

- **Tables:** the codebase enforces a `.scroll-x` wrapper on any table that is
  not a direct `.card > table` child, so horizontal overflow is contained rather
  than breaking the page. Applied consistently in the files reviewed.
- **Drawer:** `width: 760px; max-width: 94vw` — collapses correctly on narrow
  viewports by construction. Raised from 500px this session; the tab row inside
  may wrap at small widths (untested).
- **Grids:** most use explicit `gridTemplateColumns: '1fr 1fr'` inline rather
  than `auto-fit`/`minmax`, so they will **not** collapse to one column on
  narrow screens. The profitability grid is the exception
  (`repeat(auto-fit, minmax(120px, 1fr))`) and is the pattern to copy.
  **This is the most likely source of real mobile breakage.**
- **Filter bars** use `flex-wrap: wrap` — should reflow.
- **Nav/Shell:** a mobile behaviour exists in `Shell.tsx` but was not exercised.

## Priority

**RESP-1 (P2, unverified) — fixed two-column grids on record pages** will likely
overflow at ≤768px. Converting `'1fr 1fr'` to
`repeat(auto-fit, minmax(220px, 1fr))` is a low-risk change that would make the
record pages responsive by construction. Recommended as a quick win but **not
applied blind** — it should be verified visually first.

## How to close this gap

Playwright supports viewport projects. Once a signed-in fixture exists, add a
matrix run across the eight target sizes asserting (a) no horizontal document
scroll, (b) primary action visible without scroll, (c) nav reachable. That is
the cheapest way to convert this entire file from "not performed" to evidence.
