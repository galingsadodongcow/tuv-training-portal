# Legacy Academy Portal functional inventory

## v2.5 disposition update

The inventory remains the evidence baseline. The following formerly open high-value outcomes are now migrated into v2: public/private/internal offerings, sellable public schedules, commercial seat reservations, configurable minimum-pax Go/No-Go, split/multi-day schedule blocks, trainer blackout periods, venue rooms, room/trainer/venue conflicts, named Operations handoff, responsive navigation and audit visibility. Communication automation remains intentionally held. Exact implementation locations and behavior differences are in `13-migration-log.md`.

## Method and confidence

Inventory sources were the legacy route and screen code, role navigation, the large shared data-hook contract, 69 SQL migration files, 52 live legacy tables, 30 views, function signatures, manuals, workflow/status dictionaries, QA evidence, and the public live login shell. Authenticated live screens could not be exercised because no authenticated legacy session was available. Rows marked **source+DB** have high structural confidence; interaction polish remains to be revalidated with a credentialed UAT account.

Each row compresses the requested inventory fields as follows: **purpose/role/entry**, **data/actions/rules/state**, **dependencies/permissions/notifications/errors/edges**, and **implementation/recommendation/priority**.

## Foundation and navigation

| Capability | Purpose, roles and entry | Data, actions and rules | Dependencies, errors and edge cases | Legacy implementation → recommended target | Disposition |
|---|---|---|---|---|---|
| Authentication | Secure entry for all roles; `/login` and root redirect | Email/password, session lookup, profile/role lookup; inactive/missing profile denied | Supabase Auth; expired session, invalid credentials, missing profile | Client AuthProvider and role guard → keep SSR auth/profile fail-closed; add credentialed E2E | KEEP BUT REDESIGN, P0 |
| Role navigation | Reduce each role to relevant work; shell/sidebar/mobile drawer | Eight role labels, route allow-list, role home; hidden UI is not authority | RLS; unauthorized route, stale role | Hard-coded NAV plus Guard → centralized capability map plus DB RLS; retain role preview | MERGE, P0 |
| My Work | Give operational roles one action queue; `/my-work` | Tasks, handoffs, overdue leads, readiness, approvals; act/drill through | Orders, tasks, alerts; empty/stale/ownerless work | Large client view aggregating hooks → derived server queue from domain state, not generic task duplication | KEEP BUT REDESIGN, P0 |
| Global search | Find orders, sessions, customers, participants; command palette and `/search` | Free text, result type, record link; role-scoped results | Search RPC/trigram; short queries, no result, unauthorized result | Public RPC and command palette → server endpoint over indexed entities, audit-safe snippets | KEEP BUT REDESIGN, P1 |
| Saved views | Preserve frequent filters on dense worklists | User-owned name/filter payload; save/apply/delete/default | `saved_view`; invalid/outdated filters | JSON filter records → typed per-list views after list pattern exists | SIMPLIFY, P2 |
| In-app notifications | Bring SLA, handoff and business events to owner | Read/unread, event link, mark read | notification table and event functions; duplicates/no target | DB-generated notification center → retain only actionable in-app events; email held | KEEP BUT REDESIGN, P2 |

## Catalogue, training operations and resources

| Capability | Purpose, roles and entry | Data, actions and rules | Dependencies, errors and edge cases | Legacy implementation → recommended target | Disposition |
|---|---|---|---|---|---|
| Category/subcategory | Organize offerings; Admin/Operations `/courses` | Two-level hierarchy, active state; create/edit/deactivate | Course references; cycles/depth/duplicate sibling | Separate category/subcategory tables → one self-referencing `categories` table already implemented | MERGED/IMPROVED, P0 |
| Course catalogue | Define sellable training; Ops/Admin edit, Sales/Management read | Code, title, category, modality/pricing, duration, capacity, certification fields | Fees/categories; duplicate code, inactive references | Large course screen/table → focused course entity with advanced metadata added only as needed | KEEP BUT REDESIGN, P0 |
| Course fees/pricing | Standard price by delivery mode/country/date | Amount/currency/effective state; price lookup and discount rules | Quotes, discount rules; overlapping active prices | `course_fee` + pricing rules → `course_prices`, then add scoped price rules only when quoting evidence requires | MERGE, P0/P1 |
| Session creation | Convert sale into delivery; Ops calendar/session form | Course/order line, dates/segments, capacity, owner, notes; create/edit/duplicate | Accepted handoff/order; invalid dates, inactive resource | `schedule` with many fields and date segments → transactional session creation from accepted order line | KEEP BUT REDESIGN, P0 |
| Multi-day schedule blocks | Represent daily delivery across non-continuous dates | Date segments, start/end per block, timezone | Trainer/venue availability; overnight false conflicts, DST/timezone | JSON/date segment helpers → normalized `session_schedule_blocks` if domain confirmation supports it | KEEP BUT REDESIGN, P0 decision |
| Session lifecycle | Control readiness/run/close/cancel | Tentative/confirmed/running/completed/cancelled; prerequisites and reason gates | Roster, assignments, approvals, close check | Multiple status/go-state functions → one explicit state machine with readiness facts | KEEP BUT REDESIGN, P0 |
| Go/No-Go and cancel approval | Prevent uneconomic/uncontrolled delivery decisions | Minimum participants, proposal, approval/rejection, override reason | Approval, costs, roster; race at deadline | Generic approval and readiness views → focused cancellation/exception policy after business owner decision | KEEP BUT REDESIGN, P1 pending decision |
| Trainer directory | Treat trainer as schedulable resource | Code/name/contact/type/status/rates/history/documents | Qualifications, schedules; duplicates/inactive trainer | Rich trainer table/resources screen → trainer resource aggregate; keep auth separate | KEEP BUT REDESIGN, P0 |
| Trainer qualification | Prevent unqualified assignment | Course eligibility, expiry, evidence/status | Course/trainer; expired/missing qualification | `trainer_course` + eligibility checks → current `trainer_courses`, extend evidence later | KEEP/IMPROVED, P0 |
| Trainer availability | Respect working availability and blackouts | Available/unavailable intervals and notes; add/remove exception | Assignments/timezone; overlap, partial availability | `trainer_availability` + conflict RPC → normalized exceptions inside session transaction | KEEP BUT REDESIGN, P0 |
| Co-trainers | Support more than one trainer per session | Primary/support role and assignment history | Qualifications/conflicts | `session_trainer` plus schedule trainer → assignment join table only if real sessions require it | KEEP BUT REDESIGN, P1 |
| Venue directory | Model physical/virtual delivery locations | Code/name/address/capacity/type/status/cost | Sessions; inactive/over-capacity | Flat venue resource → current venue plus room/equipment/hybrid extensions when verified | KEEP BUT REDESIGN, P0 |
| Room/equipment | Reserve a capacity-constrained room and required equipment | Room capacity/equipment; reserve/release | Venue/session; room conflict | Implied by venue model, not fully normalized | NEW CAPABILITY REQUIRED, P1 |
| Conflict detection | Prevent trainer/venue double booking and invalid capacity | Candidate interval/resources; reject overlaps; list conflicts | Session status and qualification; concurrent writes | RPC conflict search plus UI warning → enforce in DB transaction/exclusion constraints and preview in UI | KEEP/IMPROVED, P0 |
| Calendar | Shared scheduling source; all roles `/calendar` | Month/week/day/list; filters for course, trainer, venue, status, type/country; open/edit | Sessions/resources; timezone, multi-day, no data | 687-line client calendar and nine filters → reusable server-filtered calendar, progressive filters | KEEP BUT REDESIGN, P0 |
| Drag/drop and recurrence | Reduce repetitive rescheduling/creation | Drag event, series rule, scope one/all | Conflict transaction; accidental bulk changes | Not implemented in legacy despite requested review | NEW CAPABILITY, P2 |

## Participants, delivery closure and quality

| Capability | Purpose, roles and entry | Data, actions and rules | Dependencies, errors and edge cases | Legacy implementation → recommended target | Disposition |
|---|---|---|---|---|---|
| Participant roster | Know who attends each session | Name/contact/reference/status; add/import/remove/transfer | Customer/session/capacity; duplicate email, full session | Participant table and roster RPCs → current participant aggregate and scoped listing | KEEP/IMPROVED, P0 |
| Capacity and waitlist | Avoid overbooking while retaining demand | Active seats, waitlist order; auto-promote on cancellation/transfer | Session capacity; concurrent registration | Functions and SLA view → one locked transaction; current implementation meets core rule | KEEP/IMPROVED, P0 |
| CSV participant import | Reduce roster entry work | File headers/rows, validation preview, commit valid rows | Session and duplicate rules; partial invalid file | Import utility plus exceptions → current preview/action; add atomic/batched mode and report | KEEP BUT REDESIGN, P1 |
| Attendance | Record delivery outcome | Present/partial/absent, minutes, completion | Running/completed session; minutes exceed duration | Attendance/cert functions → current transactional outcome action | KEEP/IMPROVED, P0 |
| Assessment | Record pass/fail/not-required and score | Status, score, eligibility | Course rules/session; absent cannot pass | Participant assessment columns → current validation, add course-specific pass thresholds only if needed | KEEP/IMPROVED, P0 |
| Certificates | Issue, verify, export and revoke evidence | Number, issued/revoked timestamps/actors/reason, PDF | Completed session and eligible outcome; duplicates/revocation | RPC and verification → current immutable issuance/revocation and PDF; add public verification only with privacy design | KEEP/IMPROVED, P0/P1 |
| Attachments/documents | Keep evidence with records | File metadata/type/path; upload/view/archive | Storage and retention; invalid file/malware/orphan | Attachment table/storage paths → defer until retention/access/virus-scanning policy exists | KEEP BUT REDESIGN, P2 |
| Session notes/history | Preserve operational context | Note, author, time, record events | Session/order; sensitive content | Separate notes + audit | MERGE notes with structured activity; P1 |
| Feedback/NPS | Measure training quality | Rating, comments, response, session/trainer | Completed session; duplicate response | Feedback table/views/quality dashboards → lightweight survey intake after communications hold | KEEP BUT REDESIGN, P2 |
| Complaints | Track service recovery | Severity/status/owner/resolution | Customer/session/order; overdue/unowned | Complaint screen/table | KEEP BUT REDESIGN, P2 |

## CRM and commercial workflow

| Capability | Purpose, roles and entry | Data, actions and rules | Dependencies, errors and edge cases | Legacy implementation → recommended target | Disposition |
|---|---|---|---|---|---|
| Customer/account | One company history; Sales/Coordinator/Manager | Identity, domain, address, status, history; create/edit/archive/merge | Contacts/orders; duplicates/deleted reference | Separate client/organization concepts → current `customers` aggregate | MERGED/IMPROVED, P0 |
| Contacts | Named people for inquiry/handoff | Name/title/email/phone/status; add/update/deactivate | Customer; at least one channel, duplicate email | Contact table and removal RPC → current contacts; soft deactivate, never destructive delete | KEEP/IMPROVED, P0 |
| Customer 360 | See activity, orders, participants and receivables together | Customer header, contacts, interactions, history | All downstream entities; empty history, RLS masking | View/RPC and detail screen → server-composed tabs with pagination | KEEP BUT REDESIGN, P1 |
| Inquiry/lead | Capture demand and next follow-up | Owner, source, requirement, course, pax, status, next action/date | Customer/contact/course; overdue, duplicate lead | Inquiry table/pipeline → current inquiry; add lost reason/source if used | KEEP/IMPROVED, P0 |
| Qualification/opportunity | Decide whether/how to pursue | Stage, need/budget/timing, owner; qualify/win/lost | Inquiry and quote; stale follow-up | Legacy inquiry statuses rather than separate opportunity | MERGE inquiry/opportunity lifecycle unless forecasting needs a distinct entity; P0 |
| Sales team scope | Let supervisor oversee/reassign team | Team membership, salesperson link, manager, assignments | Profiles/orders; orphan/ownerless record | Separate salesperson/team membership/role grants → current Sales Supervisor scope; add explicit teams only for >1 supervisor | SIMPLIFY, P0 |
| Quote | Build controlled offer | Course/modality/pax/unit price/discount/validity; draft/send/accept | Inquiry/course prices; empty quote, expired price | Quote and line tables/RPCs → current quotation aggregate | KEEP/IMPROVED, P0 |
| Discount approval | Govern exceptions | Threshold, reason, pending/approve/reject, approver/time | Quote, supervisor; self-approval, changed discount | Generic approval + rules → focused quotation approval already implemented | KEEP/IMPROVED, P0 |
| Order | Record accepted commitment | Customer/contact/owner/lines/amount/reference/status | Accepted quote; duplicate conversion | Large orders domain → current transactional conversion | KEEP/IMPROVED, P0 |
| Sales→Operations handoff | Make ownership transfer explicit | Completeness, requested date, delivery notes; send/accept/return | Order lines/owners; missing details, simultaneous actions | Endorsement/handoff tables/functions → current simpler order state machine and audit events | KEEP/IMPROVED, P0 |
| SAP reference | Link to financial system without duplicating ledger authority | SAP order number/reference | SAP manual process; duplicate/invalid reference | Reference-only field/guard | KEEP, P1 |
| Activities/follow-ups | Preserve calls, notes and next actions | Type/time/owner/outcome, next action | Customer/inquiry/order; overdue and repeated data entry | Client interaction, tasks, notes | MERGE into typed activity timeline plus next-action fields; P1 |
| Campaign/attribution | Attribute origin and credit | Channel/campaign/sales credit | Inquiry/order; split credit | Attribution table/views | KEEP only if used for decisions; P2 |
| Duplicate detection/merge | Prevent fragmented customer/order history | Candidate pair/reason/status; merge/dismiss | Unique indexes and audit; FK rewrites/concurrency | Candidate table and merge RPC | KEEP BUT REDESIGN as admin-only repair with dry run; P1 |

## Finance, oversight, administration and automation

| Capability | Purpose, roles and entry | Data, actions and rules | Dependencies, errors and edge cases | Legacy implementation → recommended target | Disposition |
|---|---|---|---|---|---|
| Invoice/receivables | Show collection status around delivery | Invoice, due date, amount, SAP reference, ageing | Order/SAP; currency/partial payment | Invoice/payment views and financial screen | DEFER: SAP is system of record; integrate read-only after ownership contract, P2 |
| Payments/refunds/credits | Record money movement/exception | Payment state, confirmation, refund/void approval | Invoice and Business Owner; double refund | Definer RPCs and ledger triggers | DO NOT MIGRATE as editable ledger without finance approval; P3 |
| Session profitability | Decide whether delivery is viable | Revenue, trainer/venue cost, margin | Rates and orders; sensitive cost leakage | P&L view had historic Sales exposure defect | REPLACE with restricted management projection after finance decision, P2 |
| Dashboards/analytics | Answer operational, pipeline and workload questions | Upcoming work, utilization, conversion, quality, receivables | Views and date/country filters; vanity metrics | Many reporting views and large client dashboards → role-specific server derivations with definitions | KEEP BUT REDESIGN, P1 |
| Audit log | Reconstruct changes and overrides | Actor/action/entity/reason/details/time; filter/export | All material functions; deleted actor | `audit_log` and search RPC → current `audit_events`, dedicated read UI needed | KEEP BUT REDESIGN, P0 |
| User/access admin | Activate users, assign roles and delegated scope | Profile, role, active/team link; update | Auth users/RLS; escalation/self-demotion | Profile-only admin and grant RPCs | KEEP BUT REDESIGN; admin creates Auth identity through controlled server/admin flow later, P1 |
| Annual rollover | Prepare new calendar year/config | Year status, copy baseline records, validate | Calendar/prices; partial copy | Rollover screen/functions | REPLACE with idempotent configuration cloning only if annual workflow persists, P2 |
| Communications/templates | Queue reminders/digests/messages | Template/channel/recipient/event/status; preview/send | Edge functions/cron/email provider; duplicate/mis-send | Message templates, comms log, reminder RPCs, source edge functions (none deployed live) | INVENTORY ONLY; DO NOT MIGRATE while communications hold is active |
| E-learning access | Track access grants | Participant/order/access status and due date | External LMS; missing account | Dedicated exception view | DEFER until integration owner exists, P2 |
| Imports/staging/data quality | Reconcile spreadsheet/SAP feeds | Staging rows, validation exceptions, normalization | Source file/year; malformed/duplicate rows | Staging tables and exception screens | SIMPLIFY into explicit import jobs only for confirmed feeds, P2 |

## Legacy status machines discovered

- Inquiry: Received/New → Responded/Qualified → Quoted → Won or Lost.
- Quote: Draft → Sent → Accepted; expired/declined terminal conditions; discount approval can be Pending/Approved/Rejected.
- Fulfillment: New → In Communication → For Order Creation → Endorsed to Operations → SAP Created, with No Feedback and Cancelled paths.
- Current v2 order: Draft → Pending Operations → Returned or With Operations → Fulfillment → Completed; Cancelled exists in constraint but no current UI transition.
- Session: Tentative/Scheduled → Confirmed/Open → Running/In Progress → Completed, or Cancelled.
- Participant: Registered/Confirmed or Waitlisted → Completed/No Show; Cancelled and Transferred terminal evidence.
- Certificate: Not Eligible → Eligible → Issued → Revoked.
- Approval: Pending → Approved or Rejected.
- Duplicate: Open → Merged or Dismissed.

Status transitions must remain centralized in database workflow functions. The legacy duplicate order status models (`fulfillment_stage` and a separate order lifecycle) should not return.
