# Architecture

## Decision

Build one Next.js 16 App Router application backed by one clean Supabase/Postgres
schema. It is a modular monolith organized by business feature. Ordinary work is
direct CRUD protected by RLS; privileged database functions exist only for
atomic handoff/order/completion transactions.

Current Supabase guidance is applied: Node.js 22+, publishable browser key,
`@supabase/ssr` cookie clients, verified claims in `proxy.ts`, explicit Data API
grants, and RLS on every exposed table. No secret/service-role key enters the app.

## Roles and scope

Final roles are `administrator`, `operations`, `sales`, `manager`, and `auditor`.
Team visibility and exceptional approval authority are scopes/capabilities, not
new roles. Database policies are authoritative. UI permission checks exist only
to remove controls the user cannot use.

## Final navigation and routes

Regular primary navigation is My Work, Calendar, Sales, Customers, and
Administration. Overview replaces My Work for Manager/Auditor.

Target authenticated route budget:

| Route | Purpose |
|---|---|
| `/my-work` | Sales/Operations action queue |
| `/overview` | Manager/Auditor read-only oversight |
| `/calendar` | Schedule and quick session drawer |
| `/calendar/sessions/[id]` | Session, roster, attendance, completion |
| `/sales` | Pipeline, Quotes, Orders views |
| `/sales/inquiries/[id]` | Inquiry record/context |
| `/sales/quotes/[id]` | Quote lines and conversion |
| `/sales/orders/[id]` | Order, ownership, handoff, fulfilment context |
| `/customers` | Search/list/create |
| `/customers/[id]` | Customer 360 |
| `/administration` | Catalogue, trainers, venues, access |
| `/administration/users/[id]` | Controlled user access change |

`/login` is public and `/` is role-aware. There are no compatibility routes.

## Domain boundaries

| Feature | Owns | References |
|---|---|---|
| auth/access | profiles, roles, scopes | Auth users |
| training | categories, courses, prices, trainers, venues | profiles for actors |
| calendar | sessions, participants | courses/resources/order lines |
| customers | customers, contacts | sales owner |
| sales | inquiries, quotes, orders, lines, handoff facts | customers/courses/sessions |
| my-work/overview | derived queries only | source records |
| audit | immutable material events | actor/entity identifiers |

Frontend features own their components, queries, mutations, validation, and
types. Routes stay thin. There is no global data hook, generic service layer,
event bus, or state store. TanStack Query is deferred until a client-heavy slice
actually benefits from caching; the first catalogue slice uses Server Components
and Server Actions.

```text
src/
  app/
  features/
    training/
    calendar/
    sales/
    customers/
    my-work/
    overview/
  components/ui/
  lib/
    auth/
    permissions/
    supabase/
  types/
```

Folders are added with their slice, not pre-created.

## Security model

- Supabase Auth establishes identity; an active `profiles` row establishes authority.
- Role/scope values live in protected application data/app metadata, never user metadata.
- Every exposed table has RLS and explicit grants. Anonymous business access is absent.
- Read/insert/update policies are separate and updates use both `USING` and `WITH CHECK`.
- Internal RLS helpers live in an unexposed `private` schema, use a fixed search path, and return only caller-specific authority.
- Security-definer workflow functions lock rows, validate identity/role/scope/state, write audit evidence, and expose narrow results.
- Sensitive financial/rate fields are separated or projected safely; UI masking is never the control.
- No ordinary business delete privilege is granted. Lifecycle actions preserve history.

## Deployment architecture

The browser connects to Supabase with the project URL and publishable key. Next.js
Server Components/Actions use the same caller cookie and remain subject to RLS.
Supabase hosts Auth, Postgres, and the Data API. Netlify is the initial web host;
Vercel remains a low-friction alternative if a measured adapter issue appears.
There are no Edge Functions, cron jobs, queues, storage buckets, or background
workers in the launch architecture.

## Complexity budgets

| Measure | Target | Review trigger |
|---|---:|---|
| Authority roles | 5 | Any sixth role must prove distinct data/transactions/approval |
| Primary work areas | 5 + optional Overview | New navigation requires a new high-frequency workflow |
| Authenticated main routes | 12 | Drawers/actions should not become routes by default |
| Business tables | 17 | Finance approval may raise to 18 |
| Persisted reporting views | 0 | Add only for measured correctness/performance need |
| Privileged workflow RPCs | 5 | Each additional RPC needs atomicity/security justification |
| Runtime dependencies | 5 initially; 6 with Query | No speculative packages |
| Lifecycle vocabularies | 5 core, 26 values total maximum | Attention must remain separate/derived |
| CI workflows | 2 | App quality and controlled database/security only |

## Testing

- Vitest covers small business rules: normalization, lifecycle transitions,
  completeness, capacity, and attention reasons.
- SQL integration tests cover anonymous denial, role/scope boundaries, write
  restrictions, workflow RPC execution, conflicts, capacity races, and audit.
- Playwright adds one representative path per completed critical workflow.
- Staging uses seeded accounts for two Sales scopes plus Operations, Manager,
  Auditor, and Administrator. Production is not the mutation test environment.

## Delivery sequence

1. Foundation and authentication.
2. Training catalogue/resources (current slice).
3. Customers and Customer 360 (delivered).
4. Inquiry, quotation, and Sales Supervisor approval (delivered).
5. Order creation, handoff, and My Work (delivered).
6. Calendar and session conflicts.
7. Roster, attendance, completion.
8. Only approved management/administration additions.
