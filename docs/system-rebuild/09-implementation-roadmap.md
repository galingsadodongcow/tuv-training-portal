# Implementation roadmap

## Completed vertical slice — v2.5 integrated operations

The former Slice 1 and Slice 2 recommendations, plus the highest-value commercial lifecycle work, were delivered together on 2026-08-31:

1. responsive role navigation;
2. Administrator/Auditor audit workspace;
3. trainer blackout periods;
4. venue rooms;
5. public/private/internal offerings;
6. split/multi-day schedule blocks;
7. transactional conflict validation;
8. commercial seat reservations and allocation;
9. configurable Go/No-Go;
10. named Operations handoff;
11. reservation-aware cancellation/completion;
12. v1-derived safe demonstration scenarios.

Database migration: `supabase/migrations/20260830195609_v2_5_integrated_rollout.sql`  
Production migration record: `20260830202610_v2_5_integrated_rollout`

## Slice 2.6 — authenticated workflow assurance

- Create controlled test identities/fixtures without changing production users.
- Add role-allowed and role-denied Playwright journeys.
- Add database concurrency tests for capacity and resource conflicts.
- Run 390px, 768px and desktop UAT.
- Capture evidence for quotation, reservation, handoff, schedule, roster, outcomes and audit.

## Slice 2.7 — CRM lifecycle completion

- Inquiry Won/Lost and mandatory lost reason.
- Quote decline/expiry and proposal output.
- Customer activity timeline.
- Funnel definitions and decision-oriented reporting.

## Slice 2.8 — reusable data operations

- Keyset-paginated server list contract.
- Shared search/filter/sort semantics.
- Scoped exports that reuse list filters.
- Import job ledger and bounded atomic roster processing.
- Duplicate detection and audited dry-run repair.

## Slice 2.9 — delivery evidence and quality

- Certificate verification/correction policy.
- Participant event history.
- Feedback/NPS and complaints after core workflow adoption.
- Course-specific outcome rules only when course owners provide evidence.

## Gated integrations

- SAP is read-only/reference-first.
- Attachments require retention, scanning and access policy.
- LMS requires an owner and API contract.
- Communication automation remains explicitly excluded.

## Definition of done

Every subsequent slice must include schema constraints, RLS/function privilege review, allowed/denied role tests, mobile behavior, loading/empty/error states, migration log updates and an explicit parity disposition. No duplicate old/new path may remain without a documented reason.
