# Role and permission matrix

## v2.5 capability additions

- **Administrator:** manages all new resources/workflows and can view the audit workspace.
- **Operations:** manages public/private/internal sessions, schedule blocks, rooms, trainer blackouts, Go/No-Go, reservations and participant allocation.
- **Sales:** views published/closed public inventory, selects delivery intent, reserves seats through accepted quotations and chooses a named Operations target; no delivery mutations.
- **Sales Supervisor:** retains Sales rights plus the existing scoped discount/reporting authority.
- **Manager:** read-only public/internal delivery and reports; no audit workspace or mutations.
- **Auditor:** read-only delivery evidence and audit workspace; no commercial or operational mutations.

Database RLS and private function checks remain authoritative; hiding an action in the UI is never the permission boundary.

## Role rationalization

| Legacy role | Primary business outcome | Target mapping | Decision |
|---|---|---|---|
| Super Admin | Global configuration, access, audit, override | Administrator | Rename/simplify. |
| Operations | Catalogue, resources, scheduling, delivery | Operations | Keep. |
| Business Owner | Approvals, money, oversight | Manager plus scoped approval capabilities | Do not create a broad role until finance/cancel approvals are confirmed. |
| Sales | Own commercial records | Sales | Keep with ownership RLS. |
| Coordinator | Intake/order preparation across commercial records | Sales capability set | Merge; split only if segregation-of-duties evidence requires it. |
| Sales Manager | Team visibility/reassignment/selling | Sales + `is_sales_supervisor` | Implemented as scope, not a sixth role. |
| Management | Read-only operational/financial oversight | Manager | Keep, currently read-only. |
| Auditor | Audit/search read-only | Auditor | Keep. |
| Trainer | Not an authenticated legacy role; trainer is a resource | No login role in P0 | Do not invent portal access. Consider later participant/trainer self-service separately. |

## Target permission matrix

Legend: **M** manage, **A** approve, **O** own/team scope, **V** view, **—** denied. “Current” notes reflect code and RLS today; recommended additions are marked `*`.

| Capability | Administrator | Operations | Sales | Sales Supervisor | Manager | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| View active catalogue/resources | M | M | V | V | V | V |
| Create/edit/archive courses/categories/prices | M | M | — | — | — | — |
| Create/edit/archive trainers/qualifications/venues | M | M | — | — | — | — |
| View training calendar | V | V | O | O/team | V | V |
| Create/reschedule/cancel sessions | M | M | — | — | — | — |
| Assign trainer/venue | M | M | — | — | — | — |
| Register/transfer/cancel participants | M | M | — | — | — | — |
| Record attendance/assessment | M | M | — | — | — | — |
| Issue certificates | M | M | — | — | — | — |
| Revoke certificates | M | — | — | — | — | — |
| View participant identity | V | V | O | O/team | masked | masked |
| Create customers/contacts | M | — | O | O/team | — | — |
| View customers/contacts | V | V | O | O/team | V | V |
| Create/qualify inquiries | M | — | O | O/team | — | — |
| Create/edit/send quotations | M | — | O | O/team | — | — |
| Approve exceptional discount | A | — | — | A | — | — |
| Convert accepted quote to order | M | — | O | O/team | — | — |
| Send order to Operations | M | — | O | O/team | — | — |
| Accept/return/start/complete handoff | M | M | — | — | — | — |
| View management reports | V | delivery scope | — | team scope | V | V |
| View audit history | V* | — | — | — | — | V* |
| Export scoped operational data | V | V | O | O/team | V | V |
| Manage profiles/roles/activation | M | — | — | — | — | — |
| Preview another role's navigation | M | — | — | — | — | — |
| Restore archived master/customer record | M | M for training; — for customers | O for customers* | team* | — | — |
| Delete business records | Avoid; deactivate/archive | Avoid; deactivate/archive | Avoid; archive where allowed | Same | — | — |

## Record-scope rules

1. Sales sees and writes records it owns. Sales Supervisor can see/manage Sales-team records under the current single-supervisor model.
2. Operations cannot see pre-handoff inquiries/quotes/orders. It sees orders from `pending_operations` onward and related delivery records.
3. Manager and Auditor can read commercial and delivery facts but cannot mutate them.
4. Manager/Auditor participant contact and employee identifiers are masked by `list_participants()`.
5. Catalogue rows are visible when active to all roles; Administrator/Operations can see inactive rows.
6. Audit events are visible only to Administrator/Auditor by RLS.
7. File and export endpoints must repeat the same profile/RLS checks; an unlinked URL is not authorization.

## Action-level decisions

| Action | Rule |
|---|---|
| Delete | Prefer deactivate/archive. Hard delete only transient draft lines and only before downstream use. |
| Approve | Approver must hold capability; record actor/time/reason; prevent self-approval if the business requires four-eyes control. |
| Assign | Validate active/qualified/available resource and conflict inside one transaction. |
| Schedule/reschedule | Administrator/Operations only; enforce time, capacity and conflicts in database. |
| Cancel | Administrator/Operations only today; require reason. Approval threshold remains an open P0/P1 decision. |
| Duplicate | No generic duplicate button until copied fields and downstream exclusions are defined. |
| Export | Server-generated, current RLS scope, escaped CSV, auditable for sensitive exports. |
| Import | Preview/validate first; bounded size; atomic or explicit partial-results report. |
| Archive/restore | Preserve history; block restore when unique keys or active conflicts exist. |
| Manage users | Administrator only in current target. Creating the Auth identity requires a separate controlled server capability. |

## Enforcement architecture

The navigation matrix is a usability layer. Enforcement remains: explicit grants → forced RLS → server action capability check → database transition prerequisites. Tests must assert both allowed and denied cases for every mutation; checking only that a menu item is hidden is insufficient.
