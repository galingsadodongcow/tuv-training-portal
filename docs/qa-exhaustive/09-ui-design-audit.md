# 09 — UI / visual design audit

**Method:** CSS token and component inspection. **No visual regression testing,
screenshot diffing or rendered-contrast measurement was performed** — that needs
a signed-in browser. Contrast ratios below are *not* measured.

## System

`src/app/globals.css` defines a token set (`--accent`, `--border`, `--bg-subtle`,
`--text-muted`, `--danger`, `--radius-*`, `--shadow-*`, `--ease`) and the app
was rebranded around TÜV Rheinland blue (`#166`). Components consistently use
tokens rather than literals — spot-checked across the files touched this session.

## Findings

**UI-1 (P3) — inline `style={{…}}` is pervasive.** Screens set spacing, widths
and grid templates inline (e.g. `gridTemplateColumns: '1fr 1fr'`,
`marginBottom: 16`). It is consistent in practice but bypasses the token scale,
so spacing drifts by hand rather than by system.
*Fix:* a small spacing/grid utility set; migrate opportunistically.

**UI-2 (P3) — two "pill" vocabularies.** `pill pill-webshop`, `pill-inside`,
`pill-inhouse`, `pill-cancelled` are semantic-by-name in some places and
decorative in others (`pill-webshop` is used for a trainer *type*). A reader
cannot infer meaning from the class.
*Fix:* rename to tone-based (`pill-neutral/info/warn/danger`) and keep semantics
in the label.

**UI-3 (P3) — status colour is doing semantic work.** Health and status pills
carry meaning largely through colour plus a word; the word is present (good),
so this is a lower risk than usual — but see `10-accessibility-audit.md`.

**UI-4 (P4) — density is fixed.** `data-density="comfortable"` is stamped on
`<html>` but there is no user control. Operations working a 161-row calendar
would benefit from a compact mode.

**UI-5 (P4) — drawer width is now 760px** (raised from 500px this session to fit
the shared session record). Below ~800px viewports it falls back to `94vw`,
which is correct, but the tab row inside will wrap *(not verified)*.

## Consistency table

| Aspect | State |
|---|---|
| Typography | ✅ Geist, single scale |
| Buttons | ✅ `btn`, `btn-sm`, `btn-ghost`, `linkbtn` |
| Cards | ✅ `card`, `card-pad` |
| Tables | ✅ consistent; `.scroll-x` applied per QA rule |
| Modals/drawers | ✅ `role="dialog" aria-modal`, focus trap, Escape |
| Toasts | ✅ single `useToast` |
| Confirms | ✅ single `useConfirm` |
| Empty states | ⚠️ present, mostly generic |
| Loading | ✅ `Spinner`, `TableSkeleton` |
| Error | ✅ `ErrorNote` used consistently |
