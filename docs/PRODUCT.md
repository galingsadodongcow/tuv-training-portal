# Product definition

## Purpose and evidence

Academy Portal is the internal system of record for selling, scheduling, handing
off, and fulfilling training. It is not an ERP, general CRM, BI suite, LMS,
workflow builder, or accounting system.

The reference repository was inspected at commit
`b35dd075248e56933e95abed8ecefe2a52f4b2b1` (2026-08-22). It contains 44 route
files, eight roles, 69 migrations, roughly 5,030 migration SQL lines, a 61 KB
shared data hook, dozens of tables/views/functions, and five test files. Its code,
historical migrations, and routes are not copied. Confirmed business workflows,
security boundaries, and integrity safeguards are retained.

## Users and responsibilities

| User | Frequent responsibility | Authority that matters |
|---|---|---|
| Sales | Customers, inquiries, quotes, orders, follow-up, handoff preparation | Own records; optional team scope |
| Operations | Catalogue, resources, calendar, handoff decisions, roster, delivery | All operational records and required commercial context |
| Manager | Business oversight and rare explicit approvals | Read all approved summaries; no ordinary business writes |
| Administrator | User access, configuration, controlled repair | Audited elevated access |
| Auditor | Reconstruct material actions | Read-only, with sensitive fields limited |

Coordinator is a Sales responsibility, Sales Manager is Sales with team scope,
Business Owner and Management map to Manager, and Super Admin maps to
Administrator. Trainers and participants are records, not portal roles.

The delivered Sales Supervisor scope provides team visibility and approval of
discounts above 10%. A quotation owner cannot approve their own discount.

## Version 1 workflows

### Training catalogue

Operations maintains a two-level category hierarchy, courses, allowed learning
types and standard prices, trainers and course qualifications, and venues.
Referenced records are deactivated instead of deleted. Sales reads active
sellable catalogue data.

### Scheduling and delivery

Operations creates a session from an accepted order line, selecting interval,
qualified trainer, compatible venue, and capacity. The database rechecks trainer
and venue conflicts, qualification, dates, ordered headcount, and capacity. Session
lifecycle is Scheduled, Open, In Progress, Completed, or Cancelled. Registration,
confirmation, automatic waitlist promotion, course-preserving transfer, attendance,
assessment, and certificate control live on the session record.

The Training Calendar is the primary delivery workspace. It provides Monday-first
month and week views plus a monthly list, with trainer, venue, and status filters.
Capacity states distinguish open, full, and waitlisted sessions, and every calendar
entry opens the authoritative session record.

### Lead to order

Sales searches for a customer before creating one, records an inquiry and next
action, optionally creates a quote, and converts the inquiry or accepted quote
to an order without re-entering customer, owner, course, quantity, or pricing.
Commercial line snapshots do not change when catalogue data changes later.

### Sales-to-Operations handoff

Sales prepares an order and selects **Send to Operations**. A database transaction
locks and validates the order, then records actor/time and makes Operations
responsible. Operations accepts or returns it with a required correction reason.
Returned work is derived into the Sales owner's My Work queue; there is no second
task or notification record to reconcile.

### Customer 360

One customer record contains contacts, inquiries, quotes, orders, and training
history. There is no parallel organization directory. Duplicate prevention is
performed before creation; controlled merge remains an administrator repair.

## Business rules

1. A category name is unique among siblings and the UI supports at most two levels.
2. Course code is stable and unique. Course duration/capacity are positive.
3. One current standard price exists per course, modality, and currency.
4. Confirmed or running sessions cannot overlap for the same trainer or physical venue.
5. A physical venue is required for classroom/onsite delivery and must fit capacity.
6. Active participants cannot exceed session capacity. Participant history is soft-removed.
7. Inquiry lifecycle is New, Qualified, Quoted, Won, or Lost; loss requires a reason.
8. Quote lifecycle is Draft, Sent, Accepted, Declined, or Expired.
9. Order lifecycle is Draft, Ready for Handoff, With Operations, Fulfilment, Completed, or Cancelled.
10. Attention is derived only as OK, Risk, or Blocked with explicit reasons; it is not stored as a second lifecycle.
11. Order endorsement requires customer, owner, at least one valid line, seats, price, modality, and session when scheduled delivery requires it.
12. Sensitive cost, rate, margin, access, and audit data is protected by database authorization, not browser hiding.
13. Completed/cancelled sessions and commercial history are not destructively deleted.
14. Material access, handoff, cancellation, participant-removal, and financial changes are audited.

## Information architecture

| Area | Purpose |
|---|---|
| My Work | Only records that require the current user's action |
| Training Delivery | Primary Operations scheduling calendar and session workspace |
| Participants | Searchable cross-session registry; mutations remain on the session roster |
| Sales | Pipeline, Quotes, and Orders views; creation is contextual |
| Customers | Directory and authoritative Customer 360 |
| Administration | Catalogue, trainers, venues, users, permissions |
| Overview | Read-only replacement for My Work for Manager/Auditor |

## Existing-to-new mapping

| Existing | Decision | New destination | Reason |
|---|---|---|---|
| My Work | Keep | My Work | Core action queue |
| Operations Today | Merge | My Work + Training Delivery | Duplicate aggregator |
| Worklist | Merge | My Work + Sales/Orders | Duplicate operational queue |
| Dashboard/Home | Merge | My Work or Overview | One role-appropriate start |
| Calendar | Keep | Training Delivery | Primary Operations workspace |
| Session create/edit/detail | Simplify | Delivery calendar + Session | Fewer route transitions |
| Training/Courses/Pricing | Merge | Administration | One low-frequency setup area |
| Resources | Merge | Administration + Training Delivery | Resources are setup and assignments |
| CRM/Inquiries/Quotations/Orders/Sales Entry | Merge | Sales | One commercial workspace |
| Clients + Organizations | Merge | Customers | One company model |
| Participants | Simplify | Participant registry + Session roster | Global search with contextual operations |
| Team | Merge | My Work + Sales scope | Scope is not a module |
| Approvals | Remove as module | Entity actions | No generic approval engine |
| Reports/Analytics/Financial | Simplify | Overview + workflow filters | Avoid embedded BI/ERP |
| Data Quality/Duplicates | Remove as modules | Constraints + create-time warnings | Prevention, not a workbench |
| Search/command palette/recent searches | Remove | Contextual search | Explicitly unnecessary |
| Communications/notifications/SLA tasks | Remove | Derived My Work | Avoid synchronized duplicate state |
| E-learning | Defer | None in launch | Portal is not an LMS |
| Quality/feedback/complaints | Defer | None in launch | Not in the approved workflow spine |
| Certificates/assessments | Keep focused | Session participant outcome | Eligibility and issuance are auditable |
| Rollover/calendar year | Remove | Date filters | No copied annual configuration |
| Saved views/themes/density | Remove | Fixed useful defaults | Personalization has no v1 outcome |
| Attachments | Defer | External link if required | Storage/security cost unproven |
| Legacy redirects/fallbacks | Remove | None | Greenfield has one schema and route set |

## Version 1 scope

Included: authentication/access, catalogue/resources, Training Delivery/session safety,
customers/contacts, inquiries, quotes, orders, handoff, My Work, roster,
waitlist/transfer, attendance, assessment, certificate control, completion,
Customer 360, essential Overview, and audit.

Excluded unless separately approved: receivables/payments, trainer rates/margin,
certificate document rendering, cancellation approval, e-learning provisioning,
attachments, outbound email, advanced reporting, automation, recurring or
multi-segment sessions, drag-and-drop scheduling, and full historical
data migration.

## Current delivery boundary

The complete 17-table v1 workflow is live in `academy_v2`. Conspicuously labeled
sample records demonstrate commercial queues plus an open onsite session with a
full roster and waitlist. Training Delivery and Participant Operations are now
integrated with accepted order lines, My Work, Overview, and immutable audit events.

## Decisions still requiring the product owner

1. Whether receivable/payment references belong in launch and which system owns them.
2. Whether confirmed-session cancellation needs manager approval or only an audited reason.
3. Whether customer duplicates are blocked or warned for explicit confirmation.
4. Whether Operations sees all customer history or fulfilment-related context only.
5. Whether trainer rates or margin are required anywhere.
6. Whether legacy data is selectively migrated or retained read-only in the old portal.
