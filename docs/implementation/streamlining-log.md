# Streamlining log

Implementation-focused record of the simplification work (the "make it lighter / more coherent" directive). One entry per area: previous → problem → decision → result. Not a design essay. Ordered newest-first within each phase.

**Baseline:** `main` after the first pass (`docs/qa/ux-review/`), the second-pass review (`docs/ux-second-pass/`), Phase B (8-role model, money model, Customer 360, handoff, audit), and the frontend increments through PR #80. Constraint this pass: **Supabase MCP is not enabled in the working chat**, so runtime RLS validation and new DB schema (e.g. a real category→subcategory hierarchy) are routed to a Supabase-enabled session; everything logged here is frontend-only unless noted.

---

## Phase 1 — Operations simplification

### S1 — Retire Home into My Work; lighten & reshape the nav
- **Previous:** two top-level action surfaces (**Home** and **My Work**) answering the same "what needs my attention" question, plus a 6-group rail (Sales / Operations / Customers / Oversight / Insights / Admin) where Calendar sat buried under Operations, Fulfillment/Duplicates lived under "Sales", and Courses lived under "Admin". Landing was `/home`.
- **Problem:** competing surfaces and a heavy, database-shaped rail. Home's unique content was already covered elsewhere (role KPI cards → the role-specific Dashboard/Analytics; notifications → the header bell; tasks/approvals → My Work).
- **Decision — Merge + Move + Retire.**
  - **Retire Home.** `/` , login, and Guard now land on **`/my-work`**; the old `/home` route redirects to `/my-work` (kept as a redirect so bookmarks/deep-links survive; `Home.tsx` left in the tree, unreferenced, for a clean revert). Breadcrumb roots repointed Home→My Work across the 5 record screens.
  - **My Work** is now the single action surface and the landing for every role.
  - **Promote Calendar** to a lead item (top, no group) — it is the core Operations tool.
  - **Regroup** into 5 workflow sections (down from 6): **CRM** (Inquiries, Quotations, New order, Orders) · **Customers** (Customers, Organizations) · **Operations** (Operations today, Fulfillment, Trainers & venues, Duplicates, E-learning) · **Oversight** (Approvals, Analytics) · **Admin** (Courses & pricing, Pricing rules, Communications, Annual rollover, Data quality, Users & access, Audit). Fulfillment & Duplicates moved off "Sales"; Analytics moved off "Insights"; Rollover moved to Admin as config.
  - **Relabels:** "New sales order" → "New order"; "Clients" nav label → "Customers" (route stays `/clients`).
- **Result:** the rail is workflow-shaped and one surface shorter; every role lands on its action list. **Role gates are unchanged** (each item keeps its exact `roles` array) — this is structure only, no access change.
- **Files:** `src/lib/roles.ts`, `src/app/page.tsx`, `src/app/(app)/home/page.tsx`, `src/app/login/page.tsx`, `src/components/Guard.tsx`, breadcrumb roots in `OrderDetail/ClientDetail/SessionDetail/QuoteDetail/OrganizationDetail`.
- **Screens removed from nav:** Home (1 top-level surface retired). **Clicks:** the landing is now the action list itself (0 clicks to "what's on my plate" vs. a Home→My Work hop before).

---

### S2 — Calendar drawer: inline session actions
- **Previous:** selecting a session on the calendar opened a read-only drawer (summary + "Open full session →"). Every scheduling change — assign a trainer, set a venue, confirm — meant leaving the calendar for the full session page.
- **Problem:** the calendar wasn't an operating surface; the most frequent Operations actions each cost a full-page navigation.
- **Decision — Simplify (act in place).** The drawer now carries the frequent actions inline, gated to Operations/super_admin (others keep the read-only view; writes are RLS-gated regardless):
  - **Assign / change trainer** and **assign / change venue** — selects backed by `useTrainers`/`useVenues`, writing `schedule.trainer_id`/`venue_id`; after a pick, `checkConflicts` runs best-effort and a `.notice-warn` shows any clash (never blocks).
  - **Confirm session** — a primary button shown only while status is Tentative → sets Confirmed.
  - **Heavy actions routed out** (not reimplemented): "Edit dates / reschedule" → `/session/{id}/edit`; "Cancel session" → `/session/{id}` (the disposition-gated cancel flow).
- **Result:** trainer/venue/confirm happen without leaving the calendar. `useSchedules` now also selects `trainer_id`/`venue_id` so the drawer can pre-select. **Clicks:** assign a trainer went from ~4 (open session → edit → pick → save → back) to 1 in the drawer.
- **Files:** `src/screens/Calendar.tsx`, `src/hooks/data.ts` (added `trainer_id`/`venue_id` to `useSchedules`).

### S4 — Session detail: fold Notes into Activity
- **Previous:** the session record carried **seven tabs** — Overview · Orders · Participants · **Notes** · Files · Feedback · **History** — where the History timeline already merged note events (`noteEvents(notes.data)`), so every note rendered in **two** places (the Notes thread and the History timeline).
- **Problem:** a redundant tab and duplicated content. "Notes" was really just the composer plus a note-only view of the same events History already showed.
- **Decision — Merge.** Notes + History collapse into one **"Activity"** tab: the note composer sits on top, the full timeline (notes, approvals, tasks, notifications, audit) below it. The tab count drops **7 → 6**. Old deep-links survive — `?tab=notes` and `?tab=history` both normalise to `activity`. The tab shows the note count (`Activity (n)`) so the thread is still discoverable at a glance.
- **Result:** one fewer tab, and notes live in a single place instead of two. The overview (header + badges + fill/fee/trainer/venue/owners + P&L + Go/No-Go + forecast + status actions) is unchanged — the attention/summary surface was already right; this pass only trimmed the redundant tab.
- **Files:** `src/screens/SessionDetail.tsx` (tab normalisation, merged Activity block, removed the separate Notes/History blocks).

### S3 — Leaner session creation (progressive disclosure)
- **Previous:** the New-session form showed all 11 inputs at once — course, learning type, fee, dates, min pax, max pax, sales owner, trainer, venue, status, private-run — even though only a course and a date block are actually needed to schedule a run, and every other field already has a working default.
- **Problem:** a wall of fields on the most common creation path, most of which the operator leaves at their default. It reads as "all of this is required," and the trainer/venue pickers duplicate the assign-in-place actions S2 added to the calendar drawer (so they no longer need to be set at creation).
- **Decision — Simplify (progressive disclosure).** The form now leads with the three essentials — **Course · Learning type · Dates** — and folds the rest behind a **"More options"** disclosure with a one-line summary of the defaults it hides (pax `MIN_PAX`–course-max, fee from catalog, status Tentative, trainer & venue assignable from the calendar). Nothing changed about what gets submitted: pax still seed from the course on pick, blanks still resolve to the course/`MIN_PAX` defaults, status still defaults Tentative. The disclosure starts **open when editing or cloning** so a deliberate change never hides a field, and closed for a brand-new session.
- **Result:** creating a session is a 3-field task by default (course, type, dates) instead of an 11-field one; the optional/assign-later details are one click away and clearly labelled as defaulted. No new required fields, no behaviour change to the double-booking check or the pax/status guards.
- **Files:** `src/screens/SessionForm.tsx` (`showMore` state + folded advanced grid).

### S5 — Participant lifecycle (retire hard delete; add transfer)
- **Previous:** RosterPanel could add/import/mark attendance/issue certs and **hard-delete** a participant (destroying attendance/assessment/cert history).
- **Problem:** a hard delete on an operational, audit-relevant record — contradicts the app's soft-delete stance and is a PII/history hazard. No way to move a participant to another session short of delete + re-add.
- **Decision — Rebuild (non-destructive lifecycle).** Most landed with PR #80's `participant.status` migration: soft-remove (`fn_remove_participant` → status `Removed`, history preserved) already replaced the hard delete, and `fn_session_roster` already hides removed rows. **This entry adds the missing transfer UI:** a per-row **Transfer** action (Operations/Coordinator/super_admin) opening a picker of other sessions of the same course (`useSessionsForCourse`, current session excluded) + optional reason → `fn_transfer_participant`; invalidates roster + fill counts. Substitute = soft-remove + add (existing paths).
- **Result:** the participant lifecycle is fully non-destructive (Active → Removed / Transferred), matching the delete-review policy. The `Participants` delete-review item is closed.
- **Files:** `src/components/RosterPanel.tsx` (transfer UI). DB (`fn_remove_participant`/`fn_transfer_participant`/`participant.status`, `fn_session_roster` hides removed) shipped in PR #80.

---

## Phase 2 — Sales / CRM simplification

### CRM1 — Leaner inquiry capture (progressive disclosure)
- **Previous:** the "New inquiry" form (inline on the pipeline board) showed **all 11 fields at once** — company, contact, email, phone, course, offering, estimated pax, estimated value, win probability, expected close, source (plus salesperson for admins) — though only **company** is required to log a lead.
- **Problem:** logging an inbound lead should take seconds, but the form presented a full qualification questionnaire up front. Most of those fields (value, probability, expected close, source, pax) are deal-*sizing* data that gets filled in as the lead is worked, not at first contact.
- **Decision — Simplify (progressive disclosure), mirroring S3.** The form now leads with the essentials — **Company · Contact · Email · Course of interest** (+ Salesperson for admins) — and folds the deal-sizing fields (phone, offering, pax, value, probability, expected close, source) behind an **"Add deal details"** toggle. `offering_type` keeps its `Public` default; every folded field was already optional in `createInquiry`, so nothing about validation or submit changed. The disclosure resets when the form closes or a lead is saved.
- **Result:** capturing a lead is a 4-field task (company + contact + email + course) instead of 11; qualification data is one click away when the rep is ready for it. No new required fields.
- **Files:** `src/screens/Inquiries.tsx` (`dealDetails` state + folded qualification grid).
- **Also reviewed, no change needed:** `Quotations.tsx` (create form already 2–3 fields), `SalesEntry.tsx` (already a clean card-per-section flow with staged validation).

---

## Phase 2 (DB) — done in a Supabase-enabled session

### S6 — Real Category → Subcategory hierarchy (retire free-text `course.category`)
- **Previous:** `course.category` was a free-text field with a datalist of previously-typed values — no structure, easy to drift ("OSH" vs "Occupational Health and Safety"), and no subcategory concept.
- **Decision — Rebuild (DB hierarchy).** New `category` (name unique, sort, active) and `subcategory` (category_id FK, name, sort, active; unique per category) tables + `course.subcategory_id` FK. `course.category` is **kept for now** (dropped later once nothing reads it). Backfill turns every distinct `course.category` into a category with a default **'General'** subcategory and links each course to it. Course management now offers **dependent Category → Subcategory selects**, and keeps `course.category` in sync with the chosen category name during the transition.
- **RLS:** both tables read-all-authenticated, write **super_admin / operations** only (matrix Categories row) — verified by role simulation on the live DB.
- **Degradation:** `useCategoryTree` returns `[]` if the tables aren't live yet (okOr swallows the missing-object error) and the form falls back to the free-text field; the save strips `subcategory_id` on a `42703`. So the frontend works before *and* after the migration lands.
- **Migration:** `supabase/migrations/20260812220000_s6_category_hierarchy.sql` (idempotent; validated on a throwaway PG17 — backfill + double-apply).
- **Files:** the migration; `src/hooks/data.ts` (`useCategoryTree`); `src/screens/CourseForm.tsx` (dependent selects + fallback).

### Phase 2 — Full CRUD/RLS validation for all 8 roles
- **What:** simulated every role (`BEGIN … set request.jwt.claims + SET LOCAL role authenticated … ROLLBACK`) against the **live** DB and probed each entity/RPC. Filled the authoritative **RLS** column in `role-crud-matrix.md` PASS/FAIL. RLS is **enabled on all 52 tables**. Highest-risk checks all PASS: **management + auditor are read-only** (denied on every table *and* every SECURITY DEFINER RPC), the sales payment_status/sap guard fires (42501), refund/void are BO/super_admin-only, coordinator intake + operations Accept/Return authority hold, payments are un-deletable.
- **Divergences found & fixed at the DB** (RLS is authoritative; the customer-entity write policies predated Phase B): coordinator/operations/business_owner could not write clients/contacts/organizations the matrix grants them, and two least-privilege **holes** let read-only roles write (contacts of *unowned* clients; quotes via `created_by = self`). Fixed in `supabase/migrations/20260812210000_rls_customer_authority.sql` and re-verified live-in-rollback.
- **Deliverable:** see `role-crud-matrix.md` (RLS column filled; findings section).
