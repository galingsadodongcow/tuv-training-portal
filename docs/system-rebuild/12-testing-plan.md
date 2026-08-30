# Testing plan

## Current baseline

- 30 TypeScript assertions across nine test files, including reservation/named-seat de-duplication and audit access.
- Two SQL security/workflow smoke files.
- Playwright configuration exists, but no `e2e/` directory or authenticated workflow tests exist.
- Legacy repository had public route/redirect tests and RLS assertions; its authenticated harness did not exercise real protected journeys.
- Verification on 2026-08-31: lint, type-check, `pnpm test` (9 files/30 tests), and the Vinext production build passed. The prior internal-link lint failures were corrected. The production migration and post-migration integrity/advisor checks also passed.

## Test layers

| Layer | Purpose | Examples |
|---|---|---|
| Unit | Pure validation/derivation/state helper correctness | dates, totals, seat counts, filter codecs, CSV escaping |
| Database integration | Constraints, RLS, transaction/state rules and concurrency | conflict detection, ownership, transitions, waitlist promotion |
| Server integration | Actions/queries/route handlers with safe error mapping | quote conversion, scoped export, PDF permission |
| Component/accessibility | Interaction and semantics | drawer focus, filter labels, status announcements |
| Authenticated E2E | Real journeys by role on desktop/mobile | Operations delivery, Sales handoff, Auditor audit |
| Regression/performance | Scale and query shape | 10k participants/audit events, keyset pages, concurrent writes |

## Required role fixtures

- active Administrator;
- active Operations;
- Sales individual A and B;
- Sales Supervisor with team scope;
- Manager;
- Auditor;
- inactive profile;
- authenticated Auth user with no active profile.

Use non-production test identities and generated fixture data. Do not reuse personal credentials.

## P0 automated scenarios

### Identity and permissions

1. Each active role lands on its intended home and sees exactly its navigation.
2. Direct unauthorized route/API calls fail.
3. Inactive/no-profile callers see no business data.
4. Sales ownership and Supervisor team scope are isolated.
5. Manager/Auditor participant contact fields are masked.

### Catalogue/resources

1. Valid course/category/price/trainer/qualification/venue creation.
2. Duplicate code/name/active price fails.
3. Category depth/cycle fails.
4. Inactive/expired qualification blocks assignment.
5. Trainer blackout blocks assignment/reschedule.

### Sales workflow

1. Customer/contact/inquiry creation.
2. Inquiry New→Qualified→Quoted→Won/Lost rules.
3. Quote with no lines cannot send.
4. >10% discount requires Supervisor; changed discount resets approval.
5. Accepted quote converts once; line facts are copied exactly.
6. Sales sends, Operations accepts/returns with reason, Sales cannot perform Ops action.

### Delivery workflow

1. Session creation from eligible accepted order line.
2. End before start, over-capacity venue, unqualified trainer and conflicts fail.
3. Concurrent conflicting schedules produce one success at most.
4. Full capacity auto-waitlists; cancellation/transfer promotes correct participant.
5. Attendance minutes/status/assessment consistency.
6. Session cannot complete with pending outcomes.
7. Certificate issue eligibility and Admin-only revoke.
8. Cancellation reason/approval policy once decided.

### Audit and files

1. Every material transition writes actor/action/entity/time and safe details.
2. Auditor/Admin can paginate/filter; other roles see zero/denied.
3. CSV cannot trigger spreadsheet formulas and obeys current RLS.
4. Certificate PDF exposes only authorized fields and shows revoked state.

## Responsive E2E journeys

At 390×844, 768×1024 and desktop:

- sign in and navigate every authorized module;
- create inquiry and open quote/order details;
- find a session, filter calendar, open detail;
- register participant and record an outcome;
- Auditor opens/filter audit history;
- menu focus is trapped, Escape closes, focus returns to trigger.

## Edge/error tests

- expired auth during mutation;
- slow/failed Supabase request;
- double click/double submit;
- stale record/status changed by another user;
- deleted/deactivated related resource;
- duplicate contact/participant;
- invalid/oversized CSV and mixed valid/invalid rows;
- thousands of list rows;
- timezone boundary and multi-day/split schedule;
- unexpected DB error returns generic message and logged correlation, not raw SQL.

## Quality gates

Every slice must pass lint, typecheck, unit, SQL integration, authenticated Chromium E2E (desktop + mobile), and production build. Database migrations are tested from an empty baseline and against a sanitized copy/backfill path. A slice is not complete when only the happy-path UI works.
