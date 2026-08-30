# Known gaps and decisions

## Closed by v2.5

| Former gap | Resolution |
|---|---|
| Mobile primary navigation | Accessible role-aware mobile navigation added. |
| Audit user journey | Read-only `/audit` workspace for Administrator/Auditor added. |
| Trainer availability | Blackout records and transactional validation added. |
| Multi-day/split schedule | Session parent + schedule-block model implemented and backfilled. |
| Venue rooms | Room inventory, capacity and conflict validation added. |
| Cancellation side effects | Order cancellation releases reservations, cancels allocated participants and rebalances/promotes waitlist. |
| Repository lint blocker | Internal export links corrected; lint now passes. |

## Open P0 verification/lifecycle gaps

| ID | Gap | Required action |
|---|---|---|
| GAP-005 | Authenticated E2E and role simulation are not automated | Add non-production role fixtures and Playwright allowed/denied journeys. |
| GAP-006 | Inquiry Won/Lost UI is incomplete | Add mandatory lost reason, transition audit and funnel definition. |
| GAP-009 | Database concurrency regression suite is limited | Exercise competing reservations, transfers and schedule changes against an isolated database. |
| GAP-010 | Credentialed mobile UAT evidence is incomplete | Simulate Operations, Sales, Admin, Manager and Auditor at 390/768/desktop. |

## P1 gaps

- Shared keyset pagination/list contract and global search.
- Typed customer/sales activity timeline.
- Quote decline/expiry and branded proposal output.
- Import-job ledger, atomic batch policy and detailed error download.
- Certificate public verification and correction/reissue rules.
- Audited duplicate detection/dry-run merge.
- Day calendar view and guarded drag/drop/recurrence after UAT.
- Virtual/hybrid provider and meeting-link metadata.
- Full actor/date pagination and CSV export for audit events; current screen shows the latest 200 with action/entity filters.

## Deferred/held

- Automated emails, reminders and digests are explicitly held.
- Editable finance/refund/credit ledger is replaced by the SAP boundary.
- Trainer login/self-service needs a separate privacy/identity design.
- Attachments require retention/scanning/signed-URL policy.
- LMS/e-learning needs an integration contract.
- Feedback/complaints remains secondary after core adoption.

## Product decisions still needed

1. Lost-reason taxonomy and funnel definitions.
2. Whether one private order line may create several cohorts.
3. Cancellation reversal/approval policy beyond the currently final reasoned cancellation.
4. Virtual/hybrid location metadata.
5. SAP integration owner and read model.
6. Participant/certificate retention and public verification privacy.
7. When communication automation simulation is approved to begin.

## Evidence limitation

The v2.5 production database and static application quality gates were verified. Authenticated end-to-end browser journeys still require controlled test identities/UAT; the report does not claim they were executed.
