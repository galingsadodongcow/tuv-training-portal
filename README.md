# Academy Portal

Academy Portal is a clean replacement for the internal training sales, scheduling,
handoff, and fulfilment application. This repository is greenfield: the previous
portal is evidence for business behavior, not a code or migration base.

The product is intentionally a modular monolith with five work areas: My Work,
Calendar, Sales, Customers, and Administration. Management and audit users receive
a read-only Overview instead of an action queue.

## Current delivery state

The repository currently contains authentication, catalogue/resource administration,
customer and contact management, inquiry pipeline, quotation pricing and focused
discount approval, quote-to-order conversion, Sales-to-Operations handoff, Customer
360, and role-driven My Work/Overview screens. Calendar, sessions, rosters, and
attendance remain the next separate delivery slice rather than placeholder records.

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

These five documents are the maintained design record. Review diaries, duplicate
manuals, and generated recommendation backlogs are deliberately excluded.
