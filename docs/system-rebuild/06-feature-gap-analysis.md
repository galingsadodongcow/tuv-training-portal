# Old-versus-new feature gap analysis

Status reflects the v2.5 production rollout on 2026-08-31.

| Capability | Existing v1 outcome | v2.5 design | Remaining gap | Priority | Disposition/status |
|---|---|---|---|---|---|
| Authentication | Client AuthProvider/guards | SSR cookies/claims, profile fail-closed | Authenticated E2E fixtures | P0 QA | KEEP/IMPROVED |
| Roles | 8 overlapping roles/grants | 5 roles + Sales Supervisor scope | Full automated allow/deny matrix | P0 QA | MERGED |
| Mobile shell | Drawer/focus behavior | Responsive role-aware native menu | Credentialed role UAT | P0 QA | MIGRATED/REDESIGNED |
| Categories | Category + subcategory tables | Max-two-level self-reference | None material | Done | MERGED |
| Courses/pricing | Rich catalogue/rules | Focused course and effective prices; configurable minimum | Advanced metadata/country pricing only with evidence | P1/P2 | SIMPLIFIED |
| Trainers | Profile, qualifications, availability | Resource + course qualification + blackout periods | Contact/docs/type/performance history | P2 | KEEP/REDESIGNED |
| Venues/rooms | Venue availability/resources | Venue→rooms, capacity/equipment, physical/virtual validation | Hybrid/provider/link metadata | P1 | MIGRATED/IMPROVED |
| Customers/contacts | Client/organization/contact | Customer aggregate and contacts | Typed activity, duplicate repair | P1 | MERGED |
| Inquiry pipeline | Detailed stages/SLA | Compact inquiry stages/follow-up | Won/Lost UI, lost reason/history | P0 | KEEP/REDESIGN NEXT |
| Quotes | Lines, discounts, proposal states | Focused approval plus delivery intent/public-session selection | Decline/expiry/proposal PDF | P1 | KEEP/IMPROVED |
| Orders/handoff | Endorse/accept/return/SAP | Named Operations target, accept/return, fulfillment, cancellation | SAP read reference/readiness details | P1/P2 | KEEP/IMPROVED |
| Public/private delivery | Public schedule and corporate delivery | Unified public/private/internal offering type | Multi-cohort private-line decision | P1 decision | MIGRATED/IMPROVED |
| Session schedule | Date segments/resources | Parent session + dated schedule blocks | Recurrence and drag/drop | P2 | MIGRATED/IMPROVED |
| Conflict safety | Trainer/venue checks/warnings | Transactional qualification, blackout, trainer, venue, room and capacity validation with advisory locks | Automated DB concurrency suite | P0 QA | MIGRATED/IMPROVED |
| Calendar | Month/week/day/list, dense filters | Month/week/list, block rendering and progressive course/category/trainer/venue/status/offering filters | Day view and guarded drag/drop | P1/P2 | KEEP/REDESIGNED |
| Commercial capacity | Registrations/capacity | Order seat reservations with FIFO rebalance and named allocation | UAT under concurrent sale | P0 QA | NEW/IMPROVED |
| Go/No-Go | Minimum-pax workflow | Configurable course/session minimum; explicit Go; final atomic No-Go | Reversal/approval policy | P1 decision | MIGRATED/IMPROVED |
| Participants | Roster/waitlist/transfer | Reservation-aware registration/waitlist/transfer/cancel with role masking | Detailed event history | P1 | KEEP/IMPROVED |
| CSV import | Staging/import | Preview and reservation/customer allocation | Job ledger, bounded atomic batch/error report | P1 | KEEP/REDESIGN NEXT |
| Attendance/assessment | Outcome functions | Atomic participant outcome workflow | Course-specific rules only with evidence | P2 | KEEP |
| Certificates | Issue/verify/history | Eligibility, issue, revoke, PDF, register/export | Public verify and correction/reissue | P1 | KEEP/IMPROVED |
| Audit | Search/export audit screen | Immutable events + Admin/Auditor `/audit` filters/details | Pagination, actor/date filters, export | P1 | MIGRATED CORE |
| Search/lists | Global search/saved views | Page-local search/filter; simple tables | Shared keyset pagination/global search | P1 | REPLACE NEXT |
| Tasks/activities | Generic tasks/notes | Derived My Work and workflow next actions | Typed human interactions | P1 | MERGED |
| Dashboards | Many reporting views | Role-scoped server derivations | Metric dictionary/utilization definitions | P1 | KEEP/REDESIGNED |
| Notifications | In-app/SLA messages | Derived action queues | Only actionable in-app signals after UAT | P2 | DEFER |
| Communications | Templates/reminders/jobs | None by explicit direction | Entire automation scope held | Hold | DO NOT MIGRATE NOW |
| Finance/AR | Invoices/payments/refunds/P&L | SAP boundary; no editable ledger | Read-only integration contract | P2/P3 | REPLACE/DEFER |
| Files | Attachments | None | Retention/scanning/signed URLs | P2 | DEFER |
| Feedback/quality | NPS/complaints | None | Add after delivery adoption | P2 | DEFER |
| LMS/e-learning | Access workflow | None | Owner/API contract | P2 | DEFER |
| Security boundary | Public schema and broad RPC surface | Custom `academy_v2`, private definers, forced RLS | Legacy public surface retirement separately approved | P0 risk | ARCHITECTURE REPLACED |
| Automated tests | Partial SQL/UI harness | 30 pure-rule assertions and production migration checks | Authenticated E2E + DB concurrency | P0 QA | PARTIAL |

## Summary

- **Completed convergence:** mobile navigation, audit UI, trainer availability, rooms, schedule blocks, public inventory, commercial reservations, configurable Go/No-Go, named handoff and cancellation/completion side effects.
- **Next operational assurance:** authenticated role UAT/E2E and isolated concurrency testing.
- **Next product work:** inquiry end states, shared list/search, customer activity, import jobs and certificate verification.
- **Held:** every automated email/reminder/digest capability.
