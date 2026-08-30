# Academy Portal convergence rollout — executive summary

**Assessment and rollout date:** 2026-08-31  
**Target architecture:** v2 (`academy_v2`)  
**Functional reference:** v1 Academy Portal  
**Production database:** Supabase project `ruwuqzwtwngpcauzbrqj`

## Outcome

The recommended integration has been delivered as one v2.5 convergence rollout. v2 remains the only application architecture; useful v1 business outcomes were absorbed into it rather than keeping two portals or copying the legacy 52-table design.

The rollout adds:

- public, private and internal training offerings in one session model;
- sellable public sessions selected from quotations;
- transactional commercial seat reservations, waitlists and named allocation without double counting;
- configurable course/session minimum participants and explicit Go/No-Go control;
- multi-day and split-day schedule blocks;
- trainer blackout periods, venue rooms and transactional trainer/venue/room conflict checks;
- named Sales-to-Operations handoff ownership;
- reservation-aware order cancellation and session-to-order completion;
- calendar filters for course, category, trainer, venue, status and offering type;
- responsive role navigation and a read-only audit workspace for Administrator/Auditor;
- safer v1-derived sample scenarios with synthetic `.test` identities only.

Automated email and communication automation remain deliberately excluded by product direction.

## Architecture decision

There is one portal, one Supabase Auth identity, one role/capability model and one authoritative `academy_v2` schema. `academy_v2_private` continues to hold privileged helpers; exposed RPCs are thin `SECURITY INVOKER` wrappers. RLS remains forced on application tables.

The convergence adds four tables, taking the v2 business schema from 17 to 21 tables:

- `venue_rooms`
- `trainer_unavailability`
- `session_schedule_blocks`
- `session_reservations`

No legacy `public` table became an authority for the new portal.

## Verification

- Production migration `20260830202610_v2_5_integrated_rollout` applied successfully.
- Post-migration integrity: 3 sample rooms, 6 schedule blocks, 1 migrated reservation, 3 public sessions and 12 synthetic sample participants.
- Invalid session minimum/capacity records: 0.
- Invalid reservation balance records: 0.
- Supabase security-advisor findings for `academy_v2`: 0.
- TypeScript unit tests: 30/30 passed across 9 files.
- Lint, type-check and production Vinext build passed.

## Product recommendations retained

1. Keep minimum participants configurable. v1's universal value of eight is a seed/default, not a hard-coded business law; ESG demonstrates an override of ten.
2. Keep trainers as resources, not automatically as login users. Add self-service only after a separate role/privacy design.
3. Treat a session as the delivery aggregate and schedule blocks as its dated resource reservations.
4. Keep seat reservations separate from named participants: the commercial commitment exists before Operations receives the final roster.
5. Continue using SAP as the financial system of record; do not recreate an editable finance ledger in the portal.
6. Keep communication automation on hold until users finish frontend/backend simulation and approve each trigger.

## Remaining work after this rollout

The convergence recommendation is complete, but the master parity program is not the same as “every legacy screen is now migrated.” Remaining work is explicitly listed in `14-known-gaps.md`; the most important items are authenticated role E2E/UAT, inquiry Won/Lost completion, shared server pagination/search, import-job reporting and certificate verification/correction policy.
