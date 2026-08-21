# Academy Portal replacement — business requirements

## 1. Document purpose and evidence

This document defines the version 1 business outcomes for a clean replacement of
Academy Portal. It is an analysis deliverable, not an implementation plan. The
current repository was treated as evidence rather than as the target design.

Evidence reviewed included the route and navigation inventory, all current screen
and shared-component names, the central data hook inventory, role gates, Supabase
schema and migrations, RLS and privileged functions, unit and Playwright tests,
the exhaustive QA set, three UX review generations, implementation logs, user
manuals, final UAT, handover, and production-readiness findings.

Evidence is classified as follows:

| Classification | Meaning | Examples used here |
|---|---|---|
| Confirmed business requirement | Needed to perform present-day work | Schedule training; qualify an inquiry; endorse and accept an order; manage a roster |
| Existing implementation decision | One way the current app solves a requirement | 8 roles, 30 screen routes, separate handoff table, global search RPC |
| Historical recommendation | A proposal, not proof of need | SLA escalation ladders, notification automation, saved views |
| Technical safeguard | Must survive even if its implementation changes | Authoritative RLS, atomic handoff, immutable financial history, conflict/capacity enforcement |
| Potentially unnecessary functionality | Does not earn a version 1 place | Command palette, custom saved views, annual rollover, embedded BI, communication templates |

## 2. System purpose

Academy Portal is an internal system of record for selling, scheduling, handing
off, and fulfilling training. It must let Sales and Operations move a customer
need from inquiry to delivered training without duplicate entry or uncertain
ownership. It is not an ERP, accounting platform, marketing automation suite,
learning management system, document repository, or general BI product.

Success means:

1. Operations can maintain the catalogue and resources, schedule safely from a
   calendar, deliver a session, and close its roster.
2. Sales can capture an inquiry once, reuse customer and course information in a
   quotation and order, and hand a complete order to Operations.
3. Every order exposes its owner, current responsible function, and next action.
4. A customer has one authoritative record and commercial/training history.
5. Management sees a concise, read-only operational and commercial overview.
6. Database authorization, auditability, and transactional integrity remain
   effective even when the browser is bypassed.

## 3. Primary users and responsibilities

| User group | Frequent responsibilities | Infrequent or controlled responsibilities |
|---|---|---|
| Sales | Capture/qualify inquiries; maintain customers and contacts; prepare quotes and orders; correct returned orders; endorse complete orders | Reassign team-owned work when granted team scope |
| Operations | Maintain catalogue/resources; create and change sessions; resolve trainer/venue conflicts; accept/return handoffs; manage capacity, roster, attendance, and completion | Correct operational configuration; record receivable references if retained |
| Managers / business owners | Review pipeline, orders, training outlook, revenue/receivable indicators, and risks | Approve exceptional financial or cancellation actions when policy requires |
| Administrators | Provision application profiles and access; correct controlled configuration | Audited repair and exceptional override |
| Auditors | Reconstruct material changes and inspect records | Export a bounded audit result; no business writes |

Trainers and participants are managed records, not portal user roles in version 1.
The current coordinator and sales-manager distinctions describe responsibility or
scope, not necessarily distinct security identities; the architecture resolves
them through scope/capabilities rather than more top-level roles.

## 4. Core workflows

### 4.1 Training setup

Operations maintains a category hierarchy, courses, learning types and standard
prices, trainers and their qualified courses, and venues. Records referenced by
history are deactivated rather than deleted. Sales can read active sellable
catalogue data but cannot alter it.

### 4.2 Training scheduling

Operations creates a session with a course, date/time, learning type, capacity,
trainer, and venue. The system warns before save about overlapping assignments,
venue capacity, or missing resources and prevents confirmed double-bookings.
Operations confirms, changes, cancels, runs, and completes sessions through a
small lifecycle. The calendar is the primary scheduling workspace; session detail
is the place for exceptions, roster, attendance, and completion.

### 4.3 Lead to sale

Sales records an inquiry against an existing customer/contact or creates the
customer inline after duplicate checking. Course interest and ownership persist.
An inquiry can be qualified, won, or lost. A quotation is optional. When used,
accepted quotation header and lines prefill the order. An order may also be
created directly. Upstream identifiers are retained for traceability.

### 4.4 Order handoff

The sales owner prepares an order. Before endorsement, the system checks customer,
owner, at least one active line, course/learning type, seats, price, and a session
for scheduled delivery. Endorsement atomically records who endorsed and when and
makes Operations responsible. Operations atomically accepts it or returns it with
a mandatory correction reason. A returned order goes back to its sales owner.

### 4.5 Training fulfilment

Operations reviews upcoming sessions and attention conditions: missing trainer,
missing venue, resource conflict, capacity risk, incomplete handoff, or roster
work. It manages participant identity, attendance, and active/removed state,
then completes a session only after required checks. Historical attendance and
participant rows are not hard-deleted.

### 4.6 Customer management

Users search before creating a customer. One customer record contains its
details, active and historical contacts, inquiries, quotations, orders, and
delivered/upcoming training. A duplicate candidate blocks or explicitly warns;
merging is an administrator repair, not a routine parallel workspace.

### 4.7 Management oversight

Managers receive a compact, read-only overview of pipeline value, order volume,
upcoming training, delivered/booked revenue indicators, receivable indicators
when retained, and counts of operational risks. Metrics link to the relevant
Sales, Calendar, or Customer view; there is no report-builder or separate BI
navigation tree.

## 5. Business rules

### Catalogue and scheduling

1. Category names are unique among siblings; one hierarchy supports category and
   subcategory without separate behavior.
2. A course has a stable code, title, active flag, default duration/capacity, and
   one or more allowed learning-type prices.
3. A session belongs to exactly one course and has one delivery interval and one
   learning type. Multiple date segments and recurring sessions are deferred.
4. Confirmed/running sessions cannot overlap for the same trainer or physical
   venue. Draft sessions may be saved with an explicit `Risk` warning.
5. Physical venue capacity cannot be less than session capacity. Online delivery
   does not require a venue but may require joining instructions.
6. Active participants may not exceed capacity. Overflow is corrected before
   confirmation or represented outside version 1; automatic waitlist promotion
   is not required.
7. Session lifecycle is `Draft → Confirmed → Running → Completed`, with
   `Cancelled` as a terminal branch. Completed/cancelled records are immutable
   except for audited administrator repair.

### Commercial

8. An inquiry has one customer, owner, interest, and stage. Version 1 stages are
   `New`, `Qualified`, `Won`, and `Lost`; loss requires a reason.
9. A quote has one customer and owner and lines with immutable commercial
   snapshots. Its lifecycle is `Draft → Sent → Accepted/Declined/Expired`.
10. An order has one customer, sales owner, one or more lines, and a responsibility
    of `Sales` or `Operations`. The business lifecycle is `Draft → Ready for
    handoff → In fulfilment → Completed`, with `Cancelled` as an exception.
11. Handoff state is expressed by endorsement, acceptance, and return facts on
    the order; it is not an independent workflow users must reconcile.
12. Order lines retain course title/type/price snapshots so later catalogue edits
    do not rewrite commercial history.
13. Scheduled order lines identify their session before endorsement. E-learning
    is out of scope as a managed fulfilment workflow; if sold, it is represented
    only as an unscheduled learning type after product-owner confirmation.
14. The order owner is mandatory before endorsement. Current responsibility is
    derived from handoff facts and never inferred from a dashboard.

### Customers, participants, and finance

15. A normalized company name plus email/domain warning is used before customer
    creation. Final duplicate policy requires product-owner confirmation.
16. Contacts and participants are deactivated/removed, not deleted when they have
    history. A participant email must be unique within an active session roster.
17. Attendance is `Not recorded`, `Present`, or `Absent`; certificate and
    assessment workflows are deferred unless confirmed as essential for launch.
18. If payment/receivable references remain in scope, payments are append-only;
    corrections use an audited reversal/void action, never deletion or silent
    amount edits. Academy Portal does not calculate a general ledger.

### Shared status and attention

19. Stored statuses represent business lifecycle only. Human attention is derived
    as `OK`, `Risk`, or `Blocked`, with explicit reasons. No additional health,
    priority, traffic-light, score, or badge vocabulary is introduced.
20. Dates, ownership, missing required data, resource conflicts, and capacity
    produce attention reasons through queries; derived attention is not copied
    into a status table.

## 6. Required records and ownership

| Record | Accountable owner | Required minimum at creation | Retention rule |
|---|---|---|---|
| Course | Operations | Code, title, category, duration, active learning type | Deactivate |
| Trainer | Operations | Name, active state | Deactivate |
| Venue | Operations | Name, type, capacity where physical | Deactivate |
| Session | Operations creator/assignee | Course, learning type, start/end, capacity | Cancel; never delete after booking |
| Customer | Sales owner or shared commercial pool | Name; dedupe key evidence | Archive/merge by controlled repair |
| Contact | Customer context | Name and at least one contact method | Deactivate |
| Inquiry | Sales owner | Customer, interest, owner | Retain loss reason |
| Quote | Sales owner | Customer, validity, at least one line before send | Retain commercial snapshots |
| Order | Sales owner until accepted; Operations thereafter | Customer, owner, line(s) before handoff | Cancel; retain handoff facts |
| Participant | Operations through session | Session, name, stable contact identifier | Soft-remove |
| Payment/reference | Authorized finance/ops user | Order, amount/reference/date | Append-only/reversal |
| Audit event | System | Actor, action, entity, time, material change/reason | Immutable |

## 7. Required approvals

Version 1 does **not** need a generic approval engine. The only proven approvals
are explicit controlled operations:

- Operations accepting or returning an endorsed order (mandatory two-sided
  handoff, not managerial approval).
- Manager/business-owner authorization for void/refund or exceptional financial
  correction, if finance is retained.
- Session cancellation approval is a product-owner decision; if required it will
  be a focused cancellation transaction, not an `approvals` table.
- Administrator override of a failed handoff completeness check requires a reason
  and is audited; normal users cannot override.

## 8. Required reports

1. Sales pipeline by stage, owner, expected value, and expected close date.
2. Orders by responsibility, lifecycle, owner, and date.
3. Upcoming training with capacity, participant count, trainer/venue readiness,
   and explicit attention reasons.
4. Booked and delivered revenue indicators based on order lines, with date and
   owner filters.
5. Receivable balance/reference list only if product ownership confirms Academy
   Portal remains the authoritative operational source.
6. Bounded audit export for administrators/auditors.

These are filtered operational views over source records, not duplicated report
tables or a user-defined reporting system.

## 9. Required integrations

- Supabase Auth for browser authentication.
- Supabase Postgres/PostgREST for authoritative data and RLS.
- Netlify remains an acceptable deployment target.
- CSV export is sufficient for management extracts.
- SAP order/receivable identifiers may be stored as external references; there
  is no SAP integration in version 1 without an approved interface contract.
- Email, scheduled digests, web shop, LMS/e-learning provisioning, telemetry
  endpoints, and background cron are not required for version 1.

## 10. Required audit and security controls

1. Every exposed business table has RLS enabled and deny-by-default role/scope
   policies. UI hiding is never treated as authorization.
2. Sales sees and writes its own records; team-wide visibility is an explicit
   scope granted to a sales lead, not a new role. Operations sees operational
   records and accepted commercial context. Management/auditor are read-only.
3. Privileged functions revoke execution from `public` and `anon`, set a fixed
   `search_path`, validate role and record scope internally, and are limited to
   genuine multi-row or privilege-sensitive transactions.
4. Financial amounts, trainer costs, and margin are restricted independently of
   navigation. Sensitive cost fields are not selectable by ordinary Sales users.
5. Material state changes capture actor/time and reason where exceptional.
6. Handoffs, payment corrections, participant removal, session cancellation,
   access changes, and administrator overrides are auditable.
7. Foreign keys, uniqueness, check constraints, transaction boundaries, and
   concurrency checks protect invariants; application validation improves UX but
   is not the only protection.
8. Authorization regression tests simulate at least two differently scoped Sales
   users plus Operations, Manager, Auditor, anonymous, and administrator.

## 11. Out of scope for version 1

- Saved views, command palette, recent searches, preferences, density controls,
  custom dashboards, and theme engine.
- Separate Operations Today, Worklist, Team, Approvals, Quality, Data Quality,
  Duplicates, Financial, Reports, Analytics, Search, and Communications modules.
- Advanced notifications, email templates, reminders, SLA/escalation engine,
  cron hygiene/digests, and background jobs.
- Recurring or multi-segment scheduling, drag-and-drop, automatic waitlist
  promotion, complex trainer availability, and co-trainer modeling.
- E-learning provisioning, certificates, assessments, feedback/NPS, complaints,
  attachments, annual rollover, pricing-rule engine, profitability workbench,
  forecast-vs-actual, country analytics, and organization hierarchy.
- ERP/accounting replacement, invoice generation, credit notes, taxation,
  generalized refunds, and general ledger behavior.
- Compatibility redirects, legacy schema fallbacks, migration strip-and-retry,
  and support for more than one clean replacement schema.

## 12. Product-owner decisions still required

1. Is receivable/payment tracking required in launch, and which external system
   is authoritative?
2. Is manager approval required to cancel a confirmed session, or is an audited
   Operations cancellation with reason sufficient?
3. Are certificates and assessment results essential fulfilment outcomes for
   version 1, or can launch stop at attendance/session completion?
4. Must one order support multiple sessions/courses (recommended: yes), and can a
   line remain unscheduled at endorsement for any learning type?
5. What constitutes a duplicate customer: exact email/domain, normalized legal
   name, or a warning with user confirmation?
6. Do Operations users need to see all customer history, or only customer/order
   context relevant to fulfilment?
7. Are trainer rates and session margin required anywhere in the replacement?
8. Is historical data migrated wholesale, selectively, or retained read-only in
   the old application?
