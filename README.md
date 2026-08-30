# Academy Portal

Academy Portal is a clean replacement for the internal training sales, scheduling,
handoff, and fulfilment application. This repository is greenfield: the previous
portal is evidence for business behavior, not a code or migration base.

The product is intentionally a modular monolith with focused work areas for My Work,
Training Delivery, Participants, Sales, Customers, Administration, and Overview.

## Current delivery state

The repository currently contains authentication, catalogue/resource administration,
customer and contact management, inquiry pipeline, quotation pricing and focused
discount approval, quote-to-order conversion, Sales-to-Operations handoff, Customer
360, role-driven My Work/Overview screens, session scheduling, participant rosters,
waitlists, transfers, attendance, assessment outcomes, and certificate control.
Training Delivery includes public, private, and internal offerings; commercial seat
reservations; configurable Go/No-Go; multi-day schedule blocks; trainer blackout
periods; venue rooms; and transactional trainer, venue, room, and capacity checks.
Its role-scoped month, week, and list calendar views expose course, category, trainer,
venue, status, offering, and capacity signals linked to each session workspace.
Management Reporting adds live role-scoped KPIs, filters, delivery and pipeline
charts, course/trainer performance, and a clearly isolated simulation scenario.
It is read-only and does not send emails, reminders, or notifications.

## Local setup

Requirements: Node.js 22 or later and a Supabase project.

1. Copy `.env.example` to `.env.local`.
2. Set the project URL and publishable key from Supabase **Connect**.
3. Add `academy_v2` to the project's Data API exposed schemas, then apply
   the reviewed migrations in order. They leave the legacy `public` schema untouched.
4. Create an Auth user, then bootstrap the first administrator as described in
   [Deployment](docs/DEPLOYMENT.md).
5. Install and run:

```bash
pnpm install
pnpm dev
```

Quality gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Durable documentation

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA-MODEL.md)
- [Permissions](docs/PERMISSIONS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [System rebuild and parity record](docs/system-rebuild/00-executive-summary.md)

These five documents are the maintained design record. Review diaries, duplicate
manuals, and generated recommendation backlogs are deliberately excluded.
