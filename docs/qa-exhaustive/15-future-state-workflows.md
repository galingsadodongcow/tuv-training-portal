# 15 — Future-state workflow recommendations

Each recommendation names the friction it removes and the measurable change.
Estimates are structural (screens/fields counted from the code), not stopwatch
measurements.

## 1. Operations: recurring sessions

**Now:** a monthly course = 12 separate creations. ~2 screens × 12, ~168 clicks.
**Proposed:** a repeat rule on the session form (frequency, count/until,
skip-holidays) creating N linked sessions in one submit.
**Change:** ~168 clicks → ~16. **Effort:** M. **Risk:** low — additive.

## 2. Operations: duplicate from the calendar drawer

**Now:** Clone exists only on the full session record (drawer → page → More
actions → Clone).
**Proposed:** "Duplicate" in the drawer, opening a pre-filled quick-create.
**Change:** 3 navigations → 1. **Effort:** S.

## 3. Operations: competency and utilisation *in* the picker

**Now:** the trainer select lists name + type. A conflict warning appears only
*after* assignment (`fn_find_conflicts` runs post-write).
**Proposed:** annotate each option with "qualified ✓ / not qualified" (from
`trainer_course`) and current load (`v_trainer_load`), and grey out
already-booked trainers for those dates.
**Change:** removes the assign→warn→reassign loop. **Effort:** M.
**Note:** `fn_find_conflicts` already exists and takes candidate ids — the data
is there; only the pre-flight call is missing.

## 4. Sales: convert quote → order

**Now:** an accepted quote is re-typed into Sales entry (~20 clicks, every line
re-entered).
**Proposed:** "Convert to order" on the quote record, seeding `fn_create_order`
from `quote_line` (which already carries `course_id`).
**Change:** ~20 clicks → ~6, and eliminates a transcription error class.
**Effort:** M.

## 5. Sales: ownership by default

**Now:** 40/163 orders unowned.
**Proposed:** when the creator holds a selling role, default
`order_assignment.sales_id` to their `sales_id`; add an owner blocker to
`fn_order_completeness` so an unowned order cannot be endorsed.
**Change:** the unowned backlog stops growing; the handoff gains a real
precondition. **Effort:** S. **Risk:** low.

## 6. Sales: next action on inquiries

**Proposed:** `inquiry.next_action_at` + owner, with a My Work item when due.
**Change:** converts the Pipeline tab from a list into a queue. **Effort:** S–M.

## 7. Cost visibility model (prerequisite: a decision)

**Proposed:** `fn_session_pnl_scoped()` — `security definer`, checks
`fn_role_reads_all()`, returns margin only to management/BO/operations/super_admin
and revenue-only rows to everyone else. Screens keep their current shape.
**Effort:** S. **Risk:** medium — it changes who sees what, so it needs sign-off.

## 8. Trainer self-service (project, not a fix)

Adding a `trainer` role means: new enum value, RLS scope keyed on
`session_trainer`, an invite flow, and 2–3 new screens (my sessions, confirm
availability, attendance). **Effort:** L. Only worth doing if trainers are
expected to interact with the system at all — today they are not.

## Recommended Operations workspace (consolidated view)

Calendar-first, with the drawer as the primary work surface:
month/week/list + filters → drawer showing the full record (**done**) → inline
trainer/venue assign with competency (**#3**) → duplicate (**#2**) → recurring
(**#1**). No page navigation for the common day.

## Recommended Sales workspace

CRM with Pipeline · Quotes · Orders (**done**) + convert-to-order (**#4**) +
next-action queue (**#6**) + ownership defaults (**#5**). The remaining gap is
that Sales cannot see its own numbers without Analytics access — a small
"my pipeline / my revenue" panel inside CRM would close it without granting the
Analytics route.
