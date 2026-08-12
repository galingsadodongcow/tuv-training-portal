# 07 — Fixes applied during this UAT

All frontend-only, no schema change. `tsc --noEmit` clean, `npm run build` compiles. Scope kept to §38 (small/medium corrections, clear intent, no new product concept, no risky migration, permissions preserved).

| # | Fix | Files | Why |
|---|---|---|---|
| 1 | **Read-only roles no longer see Inquiry write controls** — write surface gated to `super_admin/coordinator/sales/sales_manager` | `src/screens/Inquiries.tsx` | management/auditor (and the board's ungated state) exposed New-inquiry + stage move/lost/reopen the RLS rejects (UAT §22–23). |
| 2 | **Inquiry Edit surface added** — qualify a lead (contact, phone, course, offering, pax, value, probability, close, source) after lean capture | `src/screens/Inquiries.tsx` | CRM1's lean capture assumed qualification could be added later, but there was no edit surface — leads logged lean could never be qualified and the weighted pipeline stayed blank. Same missing-column strip-and-retry; RLS-governed. |
| 3 | **Worklist advance + selection controls gated** to exclude management/auditor (`canAct`) | `src/screens/Worklist.tsx` | Per-row + bulk stage-advance and the row checkboxes were ungated; read-only roles saw actions the RLS rejects. Read-only users now see the next stage as static text. |
| 4 | **OrderDetail comment composer hidden** from management/auditor | `src/screens/OrderDetail.tsx` | `order_note` insert is a write the two read-only roles can't perform. |
| 5 | **AttachmentsPanel uploader hidden** from management/auditor | `src/components/AttachmentsPanel.tsx` | File upload is a write; shared across session/order/client Files tabs. |
| 6 | **RosterPanel invalidation widened** — add/import/remove now invalidate `session_health`/`open_schedules`/`digest` (not just `roster`) | `src/components/RosterPanel.tsx` | After adding/importing/removing names, session health + roster-gap surfaces didn't refresh until a manual refetch. Transfer already did this. |

## Nature of the fixes
- 1, 3, 4, 5 only **remove** controls from roles the RLS already rejects — they align the UI to authoritative RLS with zero over-grant and **no dependency on the pending migration**.
- 2 and 6 are behaviour corrections closing gaps the streamlining work exposed.

## Explicitly NOT changed here
- Coordinator UI **under-grants** (quote/contact/set-org) — those *add* controls and depend on `20260812210000` being live; widening now would recreate a UI↔RLS mismatch. Deferred to after the migration applies (`08`).
- Search ordering / category search, MyWork sales queues, S6 adoption completion, screen-weight compaction, perf indexing — all deferred (`08`) as either DB work or capability additions beyond a correction pass.
