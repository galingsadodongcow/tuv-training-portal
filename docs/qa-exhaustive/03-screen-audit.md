# 03 — Screen-by-screen audit

**Method note.** Functional status below is derived from code inspection and
database-level role simulation. Interaction details (click counts, focus order,
hover/responsive behaviour) were **not** empirically verified — no signed-in
browser session was available. Items depending on that are marked *(not
verified)*.

Every route that renders a screen is listed. Screens are not skipped for
similarity.

---

## Login — `/login`
**Roles:** public · **Purpose:** authenticate.
**Functional:** ✅ Verified in-browser. Renders, labelled inputs, working
sign-in button. **Axe WCAG 2.0 A/AA scan: 0 serious/critical violations.**
**Issues:** improved failure messaging landed earlier this session. No
"forgot password" affordance — users must contact an admin. Leaked-password
protection is **disabled** in Supabase Auth (advisor WARN).
**Priority:** P3 (password reset), P3 (enable HIBP check).

## My Work — `/my-work` (Worklist)
**Roles:** all 8 · **Purpose:** the single action surface / fulfilment queue.
**Functional:** ✅ code-sound. Owner scope (mine / claim queue / everyone),
stage advance, bulk assignment, SLA flags, saved views.
**Business issue:** the "Claim queue" is 40 orders deep (24.5% of all orders
unowned) — the queue's default state is a backlog nobody owns.
**UX:** bulk assign exists here and only here; the per-row picker is now shared
with the order record (fixed this session).
**Priority:** P1 (unowned backlog), P3 (surface count in nav badge).

## Calendar — `/calendar`
**Roles:** all 8 (nav opened this session) · **Purpose:** source of truth for
what is sold and delivered.
**Functional:** ✅ month/week/list views, filters, saved views, session drawer
with inline trainer/venue assign + conflict preview (`fn_find_conflicts`).
**Fixed this session:** drawer now renders the full tabbed session record
(shared `SessionRecord`), width 500→760px.
**Gaps:** no drag-and-drop reschedule; no recurring-session creation; no
session duplication from the drawer (Clone exists only on the full record).
**Priority:** P2 (recurring + duplicate), P4 (drag-drop).

## CRM — `/crm`
**Roles:** 6 in nav; **no route Guard** · **Purpose:** Pipeline · Quotes · Orders.
**Functional:** ✅ consolidation of 5 legacy routes; server-side paging and
debounced search on Orders.
**Permission issue:** RBAC-2 — management/auditor can deep-link in.
**UX:** tabs carry their own saved views; `?tab=` deep-links work.
**Priority:** P2 (add Guard).

## Customers — `/clients`, `/clients/[id]`
**Roles:** 6 in nav; **no route Guard** · **Purpose:** customer book + Customer 360.
**Functional:** ✅ server-side paging + debounced search.
**Permission issue:** RBAC-3 — every role reads all 28 customers; operations has
no nav entry but can reach it (RBAC-4).
**Data:** 0 customers missing an email — good hygiene.
**Priority:** P2.

## Order detail — `/orders/[id]`
**Roles:** all (no Guard) · **Purpose:** the order record.
**Functional:** ✅ tabs, blocker bar, completeness check, endorse/accept/return,
receivables panel, attachments, activity timeline, line transfer.
**Fixed this session:** owner is now assignable here (was display-only).
**Business issue:** an order can reach endorsement with no owner — completeness
does not require one.
**Priority:** P1 (require owner before endorse).

## Session detail — `/session/[id]`
**Roles:** all (no Guard) · **Purpose:** the session record.
**Functional:** ✅ Overview / Orders / Participants / Files / Activity, Go-No-Go
panel, profitability block, forecast (BO), close/cancel/clone.
**Permission issue:** the Profitability block renders for any role that reaches
the page — the data behind it is unrestricted (P0-1).
**Priority:** P0 (cost visibility), P2 (Guard).

## Session new / edit — `/session/new`, `/session/[id]/edit`
**Roles:** super_admin, operations · **Functional:** ✅ guarded, conflict checks,
date segments, pax enforcement via `fn_enforce_pax`.
**Open decision:** two draft pax migrations exist (`option_a_course_derived`,
`option_b_per_session`); exactly one should be applied and neither is.
**Priority:** P2 (resolve the pax decision).

## Training catalogue — `/courses` (edit) and `/training` (read-only)
**Roles:** super_admin+operations edit; 7 roles read.
**Functional:** ✅ course create/edit unified into a drawer (#13); legacy
`/course/new` and `/course/[id]/edit` redirect in with `?edit=`.
**UX:** good — this is the pattern other areas should copy.
**Priority:** —

## Trainers & venues — `/resources`
**Roles:** super_admin, operations (edit); business_owner, management (read).
**Fixed this session:** codes auto-generate (`TR-nn`/`VN-nn`), search +
active-only filter added, venue code column added.
**Remaining gaps:** no inline edit (only Deactivate); no utilisation or
double-booking warning on the row; trainer↔course competency not shown before
booking; no merge-duplicate.
**Data:** 6 live sessions have no trainer.
**Priority:** P2 (inline edit, conflict warning).

## Analytics — `/analytics`
**Roles:** 5 in nav; **no route Guard**, tabs gated in-screen.
**Functional:** ✅ 8 tabs (Overview, Revenue, Receivables, Certificates,
Profitability, Pipeline, Quality, Data quality) with a safe fallback for a tab
the role cannot see.
**Permission issue:** the *tab* is hidden but the *data* is not (P0-1).
**Priority:** P0.

## Financial — `/financial`
**Roles:** management, business_owner, operations, super_admin. Guarded ✅.
**Functional:** ✅ reuses report data.
**Priority:** —

## Team — `/team`
**Roles:** sales_manager, super_admin · **Purpose:** workload/queue/pipeline.
**Business issue:** with one flat `Sales` team and a single supervisor, this
screen shows one manageable rep. Inert by data shape, not by code.
**Priority:** P2.

## Approvals / Complaints / Duplicates / Pricing / Communications / Rollover
All guarded correctly and code-sound. Duplicates has 0 open candidates live.
Pricing, Communications and Rollover are low-frequency admin surfaces —
appropriate that they sit under the Admin nav group.
**Priority:** —

## Users & access — `/admin`
**Roles:** super_admin, operations, sales_manager (opened this session).
**Functional:** ✅ verified live by simulation — ops sees 3 manageable users,
super_admin sees all 6, supervisor sees own-team reps.
**Constraint:** accounts cannot be created in-app (anon key cannot call the Auth
admin API); people must sign in once first. 5 of 7 salespeople have no login.
**Priority:** P2 (invite flow via edge function).

## Audit log — `/audit`
**Roles:** super_admin, auditor. Guarded ✅. 7,546 rows live; sales reads 0 ✅.
**Priority:** —

## Search — `/search`
**Roles:** any authenticated (`<Guard>` with no roles).
**Functional:** ✅ `fn_global_search`; stale-response race fixed earlier.
**Priority:** —

## Sales entry — `/sales-entry`
**Roles:** super_admin, sales, sales_manager, coordinator (widened this session).
**Functional:** ✅ single `fn_create_order` RPC — no direct table writes.
**Priority:** —
