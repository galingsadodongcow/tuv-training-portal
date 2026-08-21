# 03 — Operations simplification

Target: **one training-management workspace** = My Work · Calendar · Training · Resources (+ Orders where delivery requires). Three surfaces own three questions:
- **My Work** → what needs action?
- **Calendar** → when does training happen?
- **Session detail** → complete state of this training.

Everything else must justify its place against those three.

## 1. RETIRE Operations today (P0)
`OperationsToday.tsx` is a **pure read-only aggregator** with 7 sections and no actions of its own — every row links out. Each section re-presents a surface that already exists:

| Ops-today section | Already lives in |
|---|---|
| Today / This week | Calendar Day/Week/List |
| At risk | Calendar risk tag + session health |
| Roster gaps | Session detail Participants / My Work |
| Stalled orders | Orders (stage filter) + My Work |
| E-learning waiting | E-learning screen / My Work |
| Decisions | Approvals / My Work |

**Action:** delete the route + nav item. The two genuinely useful slices (today's sessions, this week's risk) belong on **Calendar** (default to a "This week" list) and **My Work** (sessions-needing-attention already exists there). No new build — both targets already render this data.

## 2. Calendar = the scheduling center (P1)
Already strong: 4 views, drawer with inline trainer/venue/confirm. Simplify:
- **Trim the filter bar** from 7 controls. Year is almost always "current" → move to a small selector, not a primary filter. Category filter should read the S6 hierarchy (currently free-text). Keep search + Status + Learning type.
- **List view = 10 columns** split across two tables (PersCert / Professional). Cut to the operational 7: Date, Course, Status, Health, Trainer, Venue, Fill. Move Channels/Go/Fee into the drawer.
- **Make the drawer the default detail** (progressive: cell → drawer → full session only when needed). The drawer already carries assign trainer/venue + confirm; add "review participants" (count + link) so readiness is visible without opening the full page.
- Absorb Ops-today's "today/this week" as the Calendar landing.

## 3. Training Catalogue (P1) — merge Courses + Categories
Course = reusable product; Category/Subcategory = taxonomy, not a destination. Today Categories/Subcategories are correctly **not** separate nav (they live in CourseForm) — keep that. Consolidate the **Courses** screen and CourseForm into one **Training** area:
- List (directory pattern) with the catalogue; row → **edit drawer** for fees + defaults (the Courses inline fee grid and CourseForm fee rows are the *same* edit — unify them).
- **Finish S6 adoption** so Calendar/Reports filter on the hierarchy, then the free-text `course.category` retires (see `docs/final-uat/08`).

## 4. Session detail — trim to header + attention + summary + ≤5 tabs (P2)
Currently 6 tabs (Overview, Orders, Participants, Files, Feedback, Activity) + a 7-button status row + 6 header badges.
- **Header (5s scan):** Course · Date · Status · Health · Owner · one primary action (context: Confirm / Close).
- **Attention band:** the Go/No-Go blockers (already computed) as a single band, not a panel competing with badges.
- **Summary:** Trainer · Venue · Fill · Readiness in one row.
- **Tabs → 5:** Overview, Participants, Orders, Files, Activity. **Fold Feedback into Activity** (or Overview summary) — it's low-frequency and post-session. 
- **Status row (7 buttons):** one primary (Confirm or Close by state) + Cancel/Clone under **More**. The Tentative/Confirmed/Running/Completed button strip should be a single status control, not four buttons.
- **Reduce header badges 6 → 3:** Status, Health, and one context pill (Private/Locked). Fill is a bar, not a badge.

## 5. Resources — keep together, drop the Load tab (P2)
Trainers + Venues in one screen is correct (Resources concept). The third **Trainer load** tab duplicates the Sessions/Next columns already in the Trainers tab → fold the one extra metric (training days delivered) into the Trainers row and remove the tab. Keep list + edit-drawer; the TrainerManage modal (competencies + blackout) is appropriate as a drawer.

## 6. Participant transfer — one surface (P2)
Transfer exists in RosterPanel, Session Orders tab, and Order Lines tab. Participants are managed **in the session** (RosterPanel) — keep transfer there. The Orders/Lines "transfer" is really *move a booking's seats*, a different concept; relabel it "Move booking" so it stops reading as the same action, or route both through the session roster.

## 7. Duplicates + E-learning — fold out of primary nav (P2)
Both are ops *exceptions*, not daily destinations:
- **Duplicates** (RARE) → a My Work exception card ("N possible duplicate orders") opening the resolve UI in a drawer.
- **E-learning access** (OCCASIONAL) → an **Orders saved view** ("Awaiting e-learning access") — it's an order-fulfillment queue, so it belongs with Orders, not as its own module.

## Operations end-state
Nav: **My Work · Calendar · Training · Resources · Orders · Analytics** (6). A normal day: open My Work (exceptions) → Calendar (schedule, assign, confirm in the drawer) → Session detail only for delivery/roster. No Operations-today, no standalone Fulfillment/Duplicates/E-learning hops.
