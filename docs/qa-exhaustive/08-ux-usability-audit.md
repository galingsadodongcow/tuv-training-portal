# 08 — UX and usability audit

Assessed from code, information architecture and business flow. Interaction
timing, focus behaviour and visual hierarchy were **not** verified in a
signed-in browser.

## What works

- **One home per role** (`homePathForRole`) — no ambiguity about where to start.
- **Third-pass consolidation** folded 13 routes into 4 hubs and kept every old
  URL alive. Genuinely reduces navigation depth.
- **Destructive actions go through a promise-based confirm** with optional/required
  reason, and the reason is written to the audit trail. This is better than most
  systems achieve.
- **Record pages share primitives** (`RecordHeader`, `RecordTabs`, `KeyVal`).
- **Shared components now back the two places that had drifted** — session
  drawer vs page, and owner assignment in queue vs record (both fixed this session).

## Findings

**UX-1 (P1) — the queue's default state is a 40-order unowned backlog.**
A new user's first impression of My Work is a pile with no owner. Ownership
should default to the creator.

**UX-2 (P2) — no result counts** anywhere (see FS-2). Users cannot judge whether
a filter worked.

**UX-3 (P2) — blocked fields look editable.** Sales sees payment status and SAP
number as fields; a database trigger rejects the write. The screen comments say
they are shown read-only, but the affordance is still a form control *(not
verified visually)*. Rule: if the DB will reject it, don't render an input.

**UX-4 (P2) — no unsaved-changes warning** on the long forms (session,
course, sales entry). A mis-click on the nav loses the entry *(not verified)*.

**UX-5 (P2) — no draft/autosave** on Sales entry, which is the longest form and
the one most likely to be interrupted.

**UX-6 (P3) — success feedback is toast-only.** Toasts are consistent, but a
long list operation gives no persistent record of what changed.

**UX-7 (P3) — Undo is never offered.** Several reversible actions (assign,
unassign, waitlist/promote) use a confirm dialog where an undo toast would be
faster and less interruptive.

**UX-8 (P3) — no "forgot password"** on login; the only route is an admin.

**UX-9 (P3) — empty states are present but generic.** `Empty`/`.empty` render a
sentence; few offer the next action ("No trainers yet. Add your first below."
does — that is the pattern to copy).

**UX-10 (P4) — the ⌘K palette is the only fast path** and is not discoverable
from the UI (no visible hint).

## Click-cost estimates *(structural estimate, not measured)*

| Task | Screens | Est. clicks | Optimised |
|---|---|---|---|
| Schedule one session | 2 | ~14 | 1 (drawer quick-create) → ~8 |
| Schedule 12 monthly runs | 2 × 12 | ~168 | recurring → ~16 |
| Create order from an accepted quote | 3 | ~20 | convert action → ~6 |
| Assign an order owner | was 2 (queue only) | — | now 1, in place ✅ |
| Open a session's roster from calendar | was 3 (drawer→page→tab) | — | now 1 ✅ |

The two ✅ rows were fixed earlier in this session; the top three are the
remaining prize and are quantified in `15-future-state-workflows.md`.
