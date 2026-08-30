# Migration priorities after the v2.5 convergence rollout

## Completed P0/P1 convergence scope

| Capability | Exit evidence | Status |
|---|---|---|
| Mobile navigation | Role-filtered accessible mobile navigation in `AppShell` | Complete |
| Audit workspace | `/audit`, database-scoped to Administrator/Auditor | Complete |
| Trainer availability | Managed blackout periods enforced in scheduling transaction | Complete |
| Multi-block sessions | `session_schedule_blocks` with backfill and calendar rendering | Complete |
| Venue rooms | Room capacity and overlap validation | Complete |
| Public/private/internal offerings | Unified session aggregate and publication lifecycle | Complete |
| Commercial reservations | Atomic quote-to-order reservation, allocation, transfer, release and rebalance | Complete |
| Configurable Go/No-Go | Per-course/per-session threshold and final No-Go cancellation | Complete |
| Named Operations handoff | Explicit active Operations target before endorsement | Complete |
| Cancellation side effects | Order cancellation releases reservations and cancels allocated attendees | Complete |

## Next P0 — verification and lifecycle closure

1. Add database-backed authenticated Playwright fixtures for Administrator, Operations, Sales, Sales Supervisor, Manager and Auditor.
2. Run credentialed UAT on desktop and mobile for quotation → reservation → handoff → delivery → completion.
3. Complete Inquiry Won/Lost UI, required lost reason and conversion reporting.
4. Define and automate concurrency regression tests for competing seat reservations and schedule changes.

## P1 — daily efficiency

- Shared server-side list contract with keyset pagination, URL filters and scoped export reuse.
- Quote decline/expiry and branded proposal output.
- Customer activity timeline and typed follow-up history.
- Import-job ledger with atomic/bounded roster batches and downloadable error report.
- Privacy-safe certificate verification and a correction/reissue policy.
- Global search after privacy-safe snippets and indexes are agreed.
- Audited duplicate detection and dry-run merge repair.

## P2/P3 — gated capabilities

- Feedback/NPS and service recovery.
- Attachments after retention, scanning and signed-URL policies.
- Read-only SAP/receivables projection after an integration contract.
- LMS/e-learning integration after ownership and API scope are confirmed.
- Recurrence and guarded drag/drop after calendar UAT.
- Trainer self-service only after a distinct identity/privacy design.

## Held

Automated emails, reminders, digests and other communication automation remain held. No workaround scheduler or hidden email job should be introduced while this decision remains active.
