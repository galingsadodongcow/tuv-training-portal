# Clean replacement architecture

## 1. Architecture decision summary

Build a single Next.js web application backed by one clean Supabase/PostgreSQL
schema. Keep React, TypeScript, Supabase Auth, TanStack Query, Vitest, and
Playwright. Remove Recharts initially and introduce no new runtime dependency.
Organize frontend code by workflow domain. Use direct CRUD protected by RLS for
ordinary operations and at most five privileged transactional functions.

This is a modular monolith, not a migration of the current architecture.

## 2. Final role model

### Five roles

| Role | Material authority | Typical scope |
|---|---|---|
| `administrator` | Access/configuration management, audited repair and override | All records, exceptional writes |
| `operations` | Catalogue/resources/session/roster writes; accept/return orders | All operational records and required customer/order context |
| `sales` | Customer/contact/inquiry/quote/order writes; endorse orders | Own records; optional team scope |
| `manager` | Read commercial/operational/financial summaries; entity-specific approvals | All or assigned business scope; business writes denied except approved actions |
| `auditor` | Read business records and material audit events | Read-only, sensitive fields masked as policy requires |

### Scope and capabilities, not more roles

Profiles have an optional `team_id`/manager relationship and a small set of
server-controlled capabilities such as `view_team_sales`,
`approve_financial_correction`, or `approve_session_cancellation`. These should
be columns only if the owner approves the corresponding workflow. They are not
client-editable. “Coordinator” is a Sales user responsible for order preparation;
“Sales Manager” is Sales with team scope; “Business Owner” is Manager with an
approval capability; “Management” maps to Manager. A super administrator maps to
Administrator. This removes navigation-only roles while retaining real authority.

## 3. Information architecture

### Primary navigation

1. **My Work** — only actionable records currently owned by or waiting on the
   signed-in user/function. No KPIs or configurable task records.
2. **Calendar** — schedule, create/edit drawer, readiness and conflict warnings;
   session record for roster and completion.
3. **Sales** — Pipeline, Quotes, and Orders as three views in one workspace.
4. **Customers** — list/search and a single Customer 360 record.
5. **Administration** — catalogue, trainers, venues, and users/access, shown only
   to roles with configuration access.

For Manager and Auditor, **Overview** replaces My Work. They retain read-only
deep links into Calendar, Sales, and Customers. Administration is one grouped
destination rather than top-level entries per entity.

### Route budget (12 authenticated routes)

| Route | Purpose |
|---|---|
| `/my-work` | Action list for Sales/Operations/Admin |
| `/overview` | Compact Manager/Auditor oversight |
| `/calendar` | Scheduling workspace and create/edit drawer |
| `/calendar/sessions/[id]` | Session, roster, attendance, completion |
| `/sales` | Pipeline/Quotes/Orders views and progressive create flows |
| `/sales/inquiries/[id]` | Inquiry context/history when deep-linking is needed |
| `/sales/quotes/[id]` | Quote lines and conversion |
| `/sales/orders/[id]` | Order lines, ownership, handoff, fulfilment context |
| `/customers` | Customer search/list/create |
| `/customers/[id]` | Customer 360 |
| `/administration` | Catalogue/resources/users tabs by permission |
| `/administration/users/[id]` | Controlled access change record |

`/login` is public and `/` redirects by role. Modal/drawer flows are not routes.
No legacy redirects are carried into the replacement.

## 4. Frontend architecture

```text
src/
  app/                         # thin routes, layouts, providers
  features/
    my-work/
    calendar/
    sales/
    customers/
    training/
    administration/
    overview/
    auth/
  shared/
    ui/                        # Button, Drawer, Modal, Table, FormField, Combobox
    auth/                      # session and permission helpers
    lib/                       # formatting only when genuinely cross-domain
  test/
```

Each feature owns `components/`, `queries.ts`, `mutations.ts`, `types.ts`,
`validation.ts`, and domain-specific utilities as required. Do not create empty
folders or barrel layers pre-emptively. Supabase row types may be generated into
one infrastructure file; feature DTOs expose only fields a screen needs.

### Data and UI patterns

- TanStack Query owns remote state. Form state remains local React state.
- Query keys are feature-local factories; mutations invalidate the smallest
  relevant keys.
- Screens never depend on one global data hook module.
- Create forms ask only for the minimum, then reveal “More options”.
- Record pages expose one primary action and place uncommon actions in a menu.
- Tables use one filter row, bounded pagination, explicit loading/error/empty
  states, accessible names, focus-managed modal/drawer behavior, and responsive
  overflow.
- `OK/Risk/Blocked` attention appears only where a reason and remediation exist.
- Avoid nested tabs: a workspace may have views; a record uses sections.

## 5. Domain boundaries

| Domain | Owns | May reference | Must not own |
|---|---|---|---|
| Identity/access | Profiles, role/scope policy | Actor references | Business workflow state |
| Training | Categories, courses, prices | None | Session/customer state |
| Scheduling/fulfilment | Trainers, venues, sessions, participants | Course, order line | Commercial ownership/pricing rules |
| Customers | Customers, contacts | Sales owner | Parallel organization book |
| Sales | Inquiries, quotes/lines, orders/lines, handoff facts | Customer, course/session/profile | Session lifecycle |
| Finance (conditional) | Append-only payment references | Order | General ledger/invoicing engine |
| Audit/oversight | Immutable audit events and read queries | All material entity IDs | Duplicate reporting state |

Cross-domain imports point toward IDs/contracts, not other domains' UI or query
internals. Database foreign keys are the integration mechanism; there is no event
bus or service layer.

## 6. Data flow

### Inquiry to order

1. Sales searches Customer by normalized name/email/domain.
2. Inquiry stores `customer_id`, optional `contact_id`, `course_id`, owner, and
   qualification facts.
3. Quote creation copies the customer/owner and creates price snapshot lines.
4. Quote conversion calls the atomic order-creation function, copying accepted
   lines and retaining `source_quote_id`; no re-entry.
5. Direct order creation uses the same function without a quote.

### Order to Operations

1. Ordinary draft edits use RLS-protected table writes.
2. Endorse invokes a privileged transaction that locks the order, revalidates
   completeness, stamps endorser/time, and changes responsibility.
3. Accept locks and stamps acceptance; return requires a reason, stamps return,
   and returns responsibility to the sales owner.
4. My Work derives records from responsibility and missing action; no task or
   notification record needs synchronization.

### Session fulfilment

1. Calendar query returns sessions plus participant count and derived attention
   reasons in one bounded date range.
2. Draft session edits validate in UI and database. Confirmation rechecks trainer,
   venue, interval, and capacity under transaction/concurrency control.
3. Participant changes are RLS-protected CRUD with soft-removal constraints.
4. Session completion transaction locks the session, checks required roster and
   attendance conditions, stamps completion, and prevents later ordinary edits.

## 7. Security model

### Authentication and authorization

- Supabase Auth establishes identity; `profiles` maps identity to one role and
  optional scope. Missing/disabled profiles have no business access.
- RLS is enabled before grants on every exposed table. Policies are expressed in
  terms of stable helper functions for current role, profile, and team scope.
- Reads and writes are separate policies. `WITH CHECK` prevents ownership or
  team changes from escaping scope.
- Operations sees only commercial/customer fields needed for fulfilment. Sales
  cannot select trainer costs, internal margins, audit payloads, or access data.
- Manager/Auditor have no ordinary insert/update/delete policy.
- Storage buckets, anonymous business access, and broad authenticated execute
  grants do not exist unless later requirements prove them necessary.

### Privileged functions

Every `SECURITY DEFINER` function:

1. has a fixed `search_path`;
2. is revoked from `PUBLIC` and `anon`;
3. checks role/capability and row scope internally;
4. locks relevant rows and validates current state;
5. writes audit reason/actor/time in the same transaction; and
6. returns a narrow result rather than unrestricted table rows.

Ordinary course, customer, inquiry, quote, session-draft, roster, and contact CRUD
does not use privileged RPCs.

## 8. Database architecture

- One new baseline migration defines the clean schema; subsequent migrations are
  forward-only and idempotent where operationally useful, but no old-schema
  compatibility is included.
- UUID primary keys, timestamps with time zone, explicit foreign keys, check and
  unique constraints, and `numeric` money with currency are used consistently.
- Lifecycle values use small check constraints (or shared enums only when stable
  and useful across tables). Timestamps/booleans express facts instead of adding
  status fields.
- Aggregate counts, attention, revenue summaries, and current responsibility are
  derived in queries. No reporting tables, task tables, or notification tables.
- Indexes follow foreign keys and actual hot filters: owner/status/date/customer,
  session dates/resources, and normalized customer search.
- Data migration is a separate, repeatable ETL with reconciliation totals and is
  not embedded as legacy application fallback logic.

The detailed 18-table proposal is in `docs/04-data-model.md`.

## 9. Testing strategy

### Highest-risk automated coverage

1. **SQL/RLS:** anonymous denial; disabled profile denial; Sales own-versus-other
   rows; team-scope boundaries; Operations writes; Manager/Auditor read-only;
   sensitive cost/audit field denial; privileged function execute grants.
2. **Domain/unit:** small lifecycle transitions, completeness validator,
   responsibility derivation, capacity calculation, customer normalization, and
   `OK/Risk/Blocked` reasons.
3. **Database integration:** concurrent trainer/venue conflicts, capacity race,
   order creation from quote, endorse/accept/return atomicity, session completion,
   payment reversal if retained, audit event transactionality.
4. **Playwright:** one vertical happy path for Sales and Operations; returned
   order correction; session creation/conflict; roster/attendance/completion;
   Customer 360; Manager read-only controls absent; key accessibility checks.
5. **Build/static:** lint, TypeScript, unit tests, production build on every PR.

Use a separate staging Supabase project with seeded role accounts. Read-only tests
against production are not an adequate substitute for workflow verification.

## 10. Delivery and operations

- Retain Netlify unless deployment evaluation finds a concrete incompatibility.
- Two CI workflows are sufficient: application quality/browser tests, and
  controlled database migration plus RLS regression.
- Deploy schema to staging, run SQL/RLS and browser flows, then promote through a
  reviewed migration process. Never hand-paste production SQL.
- Log application errors without customer/participant PII. Secrets remain in
  deployment configuration; only the Supabase public URL/anon key reach browser.
- Backups, restore rehearsal, migration parity, Auth password protection, and
  least-privileged service credentials are release controls.

## 11. Architectural risks

| Risk | Impact | Mitigation/decision |
|---|---|---|
| Requirements inferred from implementation churn | Wrong v1 scope | Resolve eight owner questions before code |
| Historical data does not map cleanly to small lifecycles | Migration loss or ambiguous records | Define mapping and reconciliation; preserve old app read-only if needed |
| Five-role model hides a true approval/access difference | Over- or under-privilege | Validate permission scenarios, then add a capability—not a nav role—when possible |
| RLS complexity returns through team/customer visibility | Security leak | Keep scopes few; SQL simulation for two Sales users and every role |
| Conflict/capacity checks race under concurrent booking | Double booking/over-capacity | Transaction locks/exclusion constraints and integration tests |
| Finance scope expands into ERP | Complexity and sensitive exposure | Decide system of record; retain references only |
| My Work becomes another persisted workflow engine | Stale/duplicate state | Derive from ownership, lifecycle, dates, and missing facts |
| Large-bang replacement delays feedback | Wrong architecture implemented fully | After approval, ship vertical slices in specified sequence |
