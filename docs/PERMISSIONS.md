# Permissions

Database RLS is authoritative. `Own/team` means the profile owns the row or has
the administrator-controlled Sales Supervisor scope. `Safe read` excludes sensitive cost,
rate, access, audit payload, and unnecessary participant/contact fields.

| Resource/action | Administrator | Operations | Sales | Manager | Auditor |
|---|---|---|---|---|---|
| Own profile | Read | Read | Read | Read | Read |
| Users/roles/scopes | CRUD + audited | — | — | Read own | Read safe identity |
| Categories/courses/prices | CRUD | CRUD | Read active | Read | Read |
| Trainers/qualifications/venues | CRUD | CRUD | Safe read | Safe read | Safe read |
| Rooms/trainer blackouts | CRUD | CRUD | Rooms safe read; no blackout read | Blackout/room read | Blackout/room read |
| Sessions | Repair/CRUD | CRUD/lifecycle | Read | Read | Read |
| Public inventory/reservations | Repair/CRUD | CRUD/allocate | Select published + own/team reservations | Read | Read |
| Schedule blocks and Go/No-Go | Override, audited | CRUD/decide | Read | Read | Read |
| Participants/attendance/assessment | Repair/CRUD | CRUD | Own/team delivery read | Masked read | Masked read |
| Certificate issue/revoke | Issue/revoke | Issue | Read own/team | Read status | Read status |
| Customers/contacts | Repair/CRUD | Fulfilment-context read | Own/team CRUD + dedupe search | Read | Masked read |
| Inquiries | Repair/CRUD | — | Own/team CRUD | Read | Read |
| Quotes/lines | Repair/CRUD | — | Own/team CRUD/issue/convert; Supervisor approves >10% discounts | Read | Read |
| Orders/lines before handoff | Repair/CRUD | Read pending | Own/team CRUD/send | Read | Read |
| Accept/return order | Override, audited | Execute | — | — | — |
| Orders after acceptance | Repair | Operational update | Own/team commercial read | Read | Read |
| Complete/cancel session | Override, audited | Execute | — | Optional approval only | — |
| Audit events | Read/export | Own action receipt | Own action receipt | Summary | Read/export |
| Sensitive rate/margin | Only if required | Only if required | Never | Approved summary only | Policy-specific |

Management Reporting is read-only. Administrator, Manager, Auditor, and Operations
can open it; Sales can open the team-scoped report only when the Sales Supervisor
flag is enabled. Supabase RLS continues to determine which commercial, delivery,
participant, and audit records each viewer contributes to the calculations.

## Policy rules

1. Missing or inactive profiles receive no business access.
2. Anonymous users receive no table or function access.
3. Manager and Auditor have no ordinary insert, update, or delete policy.
4. Sales cannot change ownership to escape scope; update policies repeat scope in `WITH CHECK`.
5. Operations cannot edit commercial snapshot amounts unless an explicit action permits it.
6. Privileged functions validate the caller internally even when execution is granted.
7. Application users receive no hard-delete privilege on retained business records.
8. Access changes, overrides, returns, cancellations, removals, and sensitive corrections are audited.

## Current slice

The database now enforces the complete catalogue, commercial, delivery, and participant permissions. Individual
Sales users see only their commercial portfolio; the Sales Supervisor sees the team
and can decide another owner’s high-discount quotation. Operations sees orders only
once sent for handoff, then controls sessions and participants through validated
functions. Manager and Auditor are read-only and participant contact/employee fields
are masked at the database listing boundary. Anonymous and inactive users have no
business access. The UI mirrors these boundaries in Sales, Customers, My Work,
Training Delivery, Participants, Overview, Administration, and the Administrator/Auditor-only Audit workspace.
Sales can select published public inventory but cannot mutate delivery; Operations owns
publication, schedule blocks, reservations/roster allocation, and Go/No-Go. A named
Operations target (or Administrator override) is required to accept/return a handoff.
