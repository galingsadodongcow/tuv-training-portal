# 14 — Information architecture review

## Verdict: the current IA is good. Do not rebuild it.

The third-pass consolidation folded 13 routes into 4 hubs (My Work, Calendar,
CRM, Analytics) while keeping every legacy URL alive as a redirect. Each daily
role sees 4–6 primary nav items, configuration sits in one "Admin" group, and
each role has exactly one home. That is a better starting point than most
systems reach, and the redirects are now regression-tested.

Recommendations below are refinements, not a redesign.

## Current nav by role

| Role | Nav items |
|---|---|
| operations | My Work · Calendar · CRM · Training · Trainers & venues · Analytics · Admin group |
| sales | My Work · Calendar · CRM · Customers |
| sales_manager | My Work · Calendar · CRM · Customers · Team · Analytics · Admin |
| coordinator | My Work · Calendar · CRM · Customers |
| business_owner | My Work · Calendar · CRM · Customers · Trainers & venues · Analytics · Pricing |
| management | Overview · Calendar · Customers · Financial · Analytics |
| auditor | Search · Calendar · Audit log |
| super_admin | everything |

## Findings

**IA-1 (P2) — nav and route Guards disagree on 5 screens** (see RBAC-2). The
nav is the design intent; the Guards should match it.

**IA-2 (P2) — "Training" means two different routes.** `/training` (read-only)
and `/courses` (editable) share the label, mutually exclusive by role. Defensible,
but a super_admin sees only `/courses` and may not realise `/training` exists.
*Fix:* one route with role-conditional editing, as the course edit-drawer
already demonstrates.

**IA-3 (P3) — "Trainers and venues" is the only two-noun nav item.** Consider
"Resources" (matches the route) or split once trainer self-service exists.

**IA-4 (P3) — Analytics has 8 tabs**, of which a given role sees 1–8. For sales
and coordinator it is a single-tab screen not in their nav — reachable only by
deep link. Either give them the nav entry or Guard the route.

**IA-5 (P3) — Admin group holds unlike things.** Pricing rules, Communications,
Annual rollover and Users & access are grouped by "who can see them" rather than
by what they are. Acceptable at this size.

**IA-6 (P4) — no breadcrumb on hub screens.** Record pages have them
(`RecordHeader crumbs`), hubs do not — fine, but drill-through from Overview
into an unguarded record leaves no trail back to Overview.

## Recommended (small) changes

1. Add Guards matching nav (IA-1) — removes the deep-link inconsistency.
2. Merge `/training` and `/courses` into one role-aware route (IA-2).
3. Give sales/coordinator either the Analytics nav item or an explicit block.
4. Keep everything else.
