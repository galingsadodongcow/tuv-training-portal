# Deployment

## Environments

Production reuses the existing `A02 Academy Hub` Supabase project while isolating
the replacement application in `academy_v2`. Keep local/staging work in a separate
project or database branch; workflow and RLS tests must never mutate legacy data.

Required application variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Only the publishable key is browser-visible. Do not configure a service-role or
secret key in the Next.js application.

## Database bootstrap

1. Confirm a current backup and verify that `academy_v2` and
   `academy_v2_private` do not already exist.
2. In **Integrations > Data API**, add `academy_v2` to **Exposed schemas**.
3. Apply `supabase/migrations/0001_initial_schema.sql` through the reviewed
   migration workflow. It creates only `academy_v2` and `academy_v2_private`
   objects and does not modify legacy `public` tables.
4. Create the first Auth user in Supabase Auth. New users receive an inactive
   Sales profile and therefore no business access by default.
5. Bootstrap the first administrator once from the SQL editor:

```sql
update academy_v2.profiles
set role = 'administrator', is_active = true
where id = '<auth-user-uuid>'::uuid;
```

6. Sign in as that administrator and provision later users through the controlled
   application workflow when that slice is delivered.
7. Verify explicit grants, RLS policies, and both Supabase security and performance advisors.

## Optional demonstration data

`0002_demo_roles_and_catalogue.sql` adds representative catalogue, standard
price, trainer competency, and venue records without replacing existing data.
`0003_demo_role_assignments.sql` is deliberately separate: it activates existing
dedicated test identities across the five approved roles. Treat that migration as
an access-control change and apply it only with explicit environment-owner approval.
Do not apply demo role activation to production identities by assumption.

`0004_switch_joane_romely_roles.sql` records the approved Joane/Romely assignment.
`0005_sales_handoff_workflow.sql` adds the seven-table commercial workflow, protected
functions, Romely’s Sales Supervisor scope, and conspicuous sample records.
`0006_sales_workflow_advisor_fixes.sql` contains the covering indexes and consolidated
profile read policy identified by the Supabase advisors.
`0007_pending_approval_sample.sql` keeps one representative Supervisor decision in
My Work after the original sample quotation is exercised through acceptance testing.

Custom schemas are not exposed automatically. The migration grants schema/table
access only to `authenticated`, grants nothing to `anon`, and the application
selects `academy_v2` explicitly in every Supabase client.

## Web deployment

Initial target: Netlify with Node.js 22 and the standard Next.js adapter. Build
command is `pnpm build`; publish behavior is supplied by the adapter. Configure
the two public Supabase variables in the deployment environment. Preview deploys
must point to staging, never production.

## Release gate

Before promotion:

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
2. Migration applies from an empty staging database and migration history matches source control.
3. SQL/RLS tests pass for anonymous and all five roles/scopes.
4. Supabase security/performance advisors have no unexplained findings.
5. Representative Playwright paths for every delivered critical workflow pass.
6. Backup/restore and rollback procedures are confirmed for the release.
7. Logs contain no customer, contact, participant, credential, or token payloads.

## Historical data

Legacy data remains in `public`. Historical migration is a separate, repeatable ETL with mapping rules,
reconciliation counts, rejected-row reporting, and business sign-off. Do not add
legacy columns, routes, or fallback queries to make an incomplete import appear
compatible. Until migration and cutover are approved, the old portal and its
schema remain untouched.
