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

## Planned next entries (this phase)
- S2 — Calendar drawer: inline session actions (assign/change trainer & venue, confirm, reschedule, cancel) without full-page navigation.
- S3 — Create-session workflow: progressive disclosure; course-derived defaults confirmed (min/max already default from course); reduce required-at-creation fields.
- S4 — Session detail: tighten to the standard header + attention + summary + minimal tabs (already tabbed via REC-standard; audit tab count).
- S5 — Participants: lifecycle (soft-cancel / transfer / substitute) on the new `participant.status` column instead of hard delete.
- S6 — Categories/subcategories: **DB-dependent** (today `course.category` is free-text; a real hierarchy needs tables + RLS) → Supabase session; meanwhile keep category as a managed free-text list in Course management.

## Deferred to a Supabase-enabled session (DB/RLS)
- Category → subcategory hierarchy (new tables, RLS, migrate `course.category`).
- Runtime CRUD/RLS validation for every role (the "RLS validated" column in `role-crud-matrix.md`).
- Any write-path/permission change surfaced during CRUD review.
