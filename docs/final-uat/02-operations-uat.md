# 02 — Training Operations UAT

Method: workflow trace through the actual screens/hooks on `main` (this session has no authenticated browser; live role testing is in the Supabase session per `01`). Verdicts: OK / FIX / SIMPLIFY.

## Verdict: Operations feels like a coherent scheduling system. ✅

| Scenario | Verdict | Evidence |
|---|---|---|
| **A — Course + Category/Subcategory** | OK (transitional) | `CourseForm.tsx` has Category→Subcategory dependent selects (`:138-145`) from `useCategoryTree()`; graceful degradation to free-text when tables absent (`hasTree`, 42703 strip-retry). *Note:* `subcategory_id` is write-only; Calendar/Reports still key on the free-text `course.category` mirror (kept in sync). S6 adoption is a working bridge, not yet complete — see `08`. |
| **B — Create session** | OK | `SessionForm.tsx` progressive disclosure: only **2 required** (Course + one date block); learning type/pax/fee/status/trainer/venue all default and fold under "More options". Feels like scheduling, not a DB form. |
| **C — Trainer management + conflict** | OK | Trainer assign from Calendar drawer (`Calendar.tsx:234`); `checkConflicts` shows a non-blocking `.notice-warn`. Resources screen edit gated to operations/super_admin. |
| **D — Venue management** | OK | Venue assign inline; virtual sessions aren't forced into a physical-venue model (venue optional). |
| **E — Participant lifecycle** | OK + FIXED | `RosterPanel.tsx`: add, CSV import (preview + dedupe), transfer (`fn_transfer_participant`), soft-remove (`fn_remove_participant`, history preserved), attendance, certificate. **Hard-delete fully gone.** *Fixed this pass:* add/import/remove now invalidate `session_health`/`open_schedules`/`digest` so health + roster-gap surfaces refresh (previously only `roster`). |
| **F — Session readiness / health** | OK | Health is single-source: DB view `v_session_health` via `useSessionHealth()` → `healthMeta()`; the **health pill is identical** on Calendar, My Work, Operations today, Session detail. |
| **G — Daily management** | OK | My Work = action queues (tasks, approvals, orders/sessions needing attention, SLA); Calendar = when. Clean split. |

## Notes (not blockers)
- **Two secondary risk computations** coexist with the health pill: Calendar `riskClass()` (local min/booked/days) renders a separate "▲ At risk" tag, and Operations today's "At risk" section uses `useDigest()` (a different RPC definition). Neither is wrong, but a session can show health `Healthy` and still get the risk tag — worth reconciling to one definition. Deferred (`08`).
- **My Work ↔ Operations today** overlap: both render open-session-attention and pending-approvals queues (different slicing of the same data). Candidate for a future consolidation; not duplication users must understand today. Deferred (`08`).
- **Calendar** has all four views (Month/Week/Day/List) implemented — no missing view to build (UAT §29 resolved: keep).

## Operations success test (UAT §43) — passes in code
My Work → Calendar → (Course + Category/Subcategory) → Session (2 fields) → assign Trainer/Venue from drawer → readiness via health pill → add/import participants → resolve risks → attendance → close → certificates. No step requires understanding tables or juggling competing surfaces.
