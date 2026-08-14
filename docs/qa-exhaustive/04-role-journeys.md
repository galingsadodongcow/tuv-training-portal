# 04 — Role journey reports

Journeys are reconstructed from code, nav definitions and live data. Click
counts are **estimates from the route/component structure**, not stopwatch
measurements — no signed-in session was available.

---

## Operations
**Responsibilities:** schedule sessions, staff them, run delivery, close out.
**Home:** `/my-work`. **Nav:** My Work, Calendar, CRM, Training, Trainers &
venues, Analytics, Admin group.

**Current flow (schedule a session):** Calendar → New session → form (course,
dates, modality, trainer, venue, pax) → save → back to calendar → open drawer to
verify. Roughly 2 screens, ~12–18 fields.

**Pain points**
1. No recurring sessions — a monthly course is created one at a time.
2. No duplicate-from-drawer; Clone lives only on the full record.
3. Trainer/venue pickers do not show utilisation or competency, so the
   conflict warning arrives *after* assignment.
4. 6 live sessions currently have no trainer and nothing forces resolution.

**Recommended:** calendar-first workspace with recurring + duplicate, and
competency/utilisation shown *in* the picker. See `15-future-state-workflows.md`.

**Top 5:** recurring sessions · duplicate in drawer · trainer competency in
picker · unstaffed-session worklist item · inline edit on Resources.

---

## Sales
**Responsibilities:** pipeline, quotes, orders, handoff to Operations.
**Home:** `/my-work`. **Nav:** My Work, Calendar (new), CRM, Customers.

**Current flow (new order):** CRM → find/create customer → Sales entry → pick
session → lines → save → order record → assign owner → endorse.

**Pain points**
1. **40 of 163 orders have no owner** — "what is mine?" is unanswerable.
2. Channel restriction (`Inside Sales`/`Field Sales`) is enforced only at save
   time; the UI does not pre-filter the channel list *(not verified)*.
3. Sales cannot see Analytics/Financial in nav, so commercial context is split
   between CRM and screens they cannot reach.
4. Payment status and SAP number are visibly present but trigger-blocked.

**Top 5:** fix unowned backlog · require owner before endorse · pre-filter
channel by role · a "my numbers" panel in CRM · clearer read-only styling on
blocked fields.

---

## Sales supervisor (`sales_manager`)
**Responsibilities:** team workload, coaching, own selling.
**Now:** can sell (added this session) *and* manage own-team reps.
**Blocked by data:** one flat `Sales` team, so `/team` and `/admin` show one rep.
**Top 3:** design a real team structure · team-scoped pipeline targets ·
reassignment directly from `/team`.

---

## Coordinator
**Responsibilities:** order intake, duplicates, fulfilment.
**Nav:** My Work, Calendar, CRM, Customers. Can create orders (any channel) and
resolve duplicates.
**Observation:** the coordinator is the *least* documented role but holds broad
intake authority — worth an explicit definition. **Priority P3.**

---

## Business owner
**Responsibilities:** oversight, approvals, forecasting, pricing.
**Now protected:** only a super_admin may change a BO's role (fixed this session).
**Constraint:** view-only on the calendar by decision — cannot edit sessions.
**Top 3:** approvals digest · forecast vs actual on one screen · export.

---

## Management
**Home:** `/overview`. Read-only oversight + Financial + Analytics.
**Gap:** no nav entry for CRM/Customers detail, yet drill-through from Overview
lands on unguarded routes — works, but by accident rather than design.

---

## Auditor
**Home:** `/audit`. Nav: Search + Audit log only.
**Verified:** reads 0 rows from `orders`-scoped data it should not see; audit_log
is its own surface.
**Gap:** auditor can deep-link to `/crm` and `/session/[id]` (RBAC-2).

---

## Trainer — **not a system role**
There is **no trainer login**; trainers are a managed resource. The brief's
trainer journey (view assignments, confirm availability, take attendance)
**cannot be performed by trainers today** — Operations does it on their behalf.

This is a legitimate design choice, but it is the single largest *functional*
gap versus the brief's expectations. If trainer self-service is wanted it is a
new role, new RLS scope, new screens and an invite flow — a project, not a fix.
**Documented as a product decision, not a defect.**
