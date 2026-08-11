-- ─────────────────────────────────────────────────────────────────────────
-- RLS regression fixture (self-contained, runnable on a bare Postgres 16).
--
-- WHY THIS IS SYNTHESIZED, NOT "apply all migrations":
--   The live base schema (create table orders / client / salesperson / …) is
--   NOT in this repo — the migrations are hardening *deltas* on top of it, and
--   supabase/schema.sql is documentation that is explicitly not runnable
--   (CRLF, missing semicolons, no `enable row level security`). So this fixture
--   supplies MINIMAL skeletons of just the base tables the policies-under-test
--   read, plus the real helper functions copied verbatim from schema.sql, and
--   then `\i`s the ACTUAL repo migration files that define the policy/RPC
--   surface being regression-tested:
--       supabase/migrations/20260808260000_access_scoping.sql   (orders scoping)
--       supabase/migrations/20260811000000_lock_search_rpcs.sql (locked search RPCs)
--   fn_audit_search is copied in below (its own migration also creates unrelated
--   pricing/country objects that are out of scope for this fixture).
--
--   This guards the POLICY LOGIC as written in the repo. It complements — does
--   not replace — verifying against the live DB. If you add a column that a
--   tested policy references, add it to the matching skeleton below.
--   Run with psql from the REPO ROOT so the \i paths resolve.
-- ─────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade;   create schema auth;

-- Supabase roles ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public to anon, authenticated;

-- Enums used by the skeleton / functions ------------------------------------
create type user_role as enum ('super_admin','operations','business_owner','sales');
create type country_t as enum ('PH','SG','MY','ID','VN','TH');

-- Supabase auth.uid(): the JWT `sub` claim -----------------------------------
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Base-table skeletons (minimal — only columns the tested policies touch) ----
create table public.profiles (
  user_id uuid primary key, role user_role, sales_id uuid);
create table public.salesperson (
  sales_id uuid primary key, team text, region text, is_supervisor boolean default false);
create table public.orders (
  order_id text primary key, client_id uuid, created_by uuid,
  fulfillment_stage text, order_date date, total_seats int);
create table public.order_assignment (
  order_id text, sales_id uuid);
create table public.client (
  client_id uuid primary key default gen_random_uuid(),
  company text, name text, email text, org_id uuid);
create table public.organization (
  org_id uuid primary key default gen_random_uuid(),
  name text, industry text, country country_t default 'PH');
create table public.schedule (
  schedule_id uuid primary key default gen_random_uuid(),
  course_id uuid, start_date date, status text);
create table public.course (
  course_id uuid primary key default gen_random_uuid(),
  course_name text, training_type text, active boolean default true);
create table public.inquiry (
  inquiry_id uuid primary key default gen_random_uuid(),
  company text, status text, inquiry_date date);
create table public.audit_log (
  audit_id bigint primary key generated always as identity,
  table_name text, row_pk text, action text, actor_role user_role,
  actor_id uuid, changed_at timestamptz default now(), changed_fields jsonb);

-- Helper functions — copied VERBATIM from supabase/schema.sql ----------------
create or replace function public.fn_current_role() returns user_role
 language sql stable security definer set search_path to 'public'
 as $$ select role from profiles where user_id = auth.uid() $$;

create or replace function public.fn_current_sales_id() returns uuid
 language sql stable security definer set search_path to 'public'
 as $$ select sales_id from profiles where user_id = auth.uid() $$;

create or replace function public.fn_is_supervisor() returns boolean
 language sql stable security definer set search_path to 'public'
 as $$ select coalesce((select is_supervisor from salesperson
          where sales_id = fn_current_sales_id()), false) $$;

-- Table grants: RLS (not the grant) is what must yield 0 rows for anon on
-- orders, so anon holds SELECT on orders too. The policy subquery reads
-- order_assignment + salesperson as the invoking user, so authenticated needs
-- SELECT on those.
grant select on public.orders to anon, authenticated;
grant select on public.order_assignment, public.salesperson, public.client,
  public.organization, public.schedule, public.course, public.inquiry,
  public.audit_log, public.profiles to authenticated;

-- ── Real repo SQL under regression ─────────────────────────────────────────
\echo '>> applying real migration: 20260808260000_access_scoping.sql'
\i supabase/migrations/20260808260000_access_scoping.sql
\echo '>> applying real migration: 20260811000000_lock_search_rpcs.sql'
\i supabase/migrations/20260811000000_lock_search_rpcs.sql

-- fn_audit_search — copied from 20260808280000_pricing_country_audit.sql
-- (that migration also builds pricing/country objects out of scope here).
-- Gate: returns rows only to super_admin; anyone else gets an empty set.
create or replace function public.fn_audit_search(
  p_table text default null, p_action text default null, p_role text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_search text default null, p_limit integer default 200)
returns table(audit_id bigint, table_name text, row_pk text, action text,
              actor_role text, actor_id uuid, changed_at timestamptz, changed_fields jsonb)
language sql stable security definer set search_path to 'public'
as $$
  select a.audit_id, a.table_name, a.row_pk, a.action, a.actor_role, a.actor_id, a.changed_at, a.changed_fields
    from audit_log a
   where fn_current_role() = 'super_admin'
     and (p_table is null or a.table_name = p_table)
     and (p_action is null or a.action = p_action)
     and (p_role is null or a.actor_role::text = p_role)
     and (p_from is null or a.changed_at >= p_from)
     and (p_to is null or a.changed_at <= p_to)
     and (p_search is null or a.row_pk ilike '%' || p_search || '%' or a.changed_fields::text ilike '%' || p_search || '%')
   order by a.changed_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
grant execute on function public.fn_audit_search(text, text, text, timestamptz, timestamptz, text, integer) to authenticated;

-- ── Identities + data ──────────────────────────────────────────────────────
-- Two reps on TeamA (S001, S002) + one on TeamB (S003) + a super admin.
insert into public.salesperson (sales_id, team, region, is_supervisor) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'TeamA', 'Luzon',   false),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'TeamA', 'Luzon',   false),
  ('b1b1b1b1-0000-0000-0000-000000000003', 'TeamB', 'Visayas', false);

insert into public.profiles (user_id, role, sales_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'sales',       'a1a1a1a1-0000-0000-0000-000000000001'), -- S001 TeamA
  ('00000000-0000-0000-0000-0000000000a2', 'sales',       'a2a2a2a2-0000-0000-0000-000000000002'), -- S002 TeamA
  ('00000000-0000-0000-0000-0000000000b1', 'sales',       'b1b1b1b1-0000-0000-0000-000000000003'), -- S003 TeamB
  ('00000000-0000-0000-0000-0000000000ad', 'super_admin', null);                                    -- admin

insert into public.client (client_id, company, name, email, org_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'Acme Corp', 'Jane', 'jane@acme.test',
   '33333333-3333-3333-3333-333333333333');
insert into public.organization (org_id, name, industry, country) values
  ('33333333-3333-3333-3333-333333333333', 'Acme Group', 'Manufacturing', 'PH');

-- Orders: one owned by each rep. created_by drives the "own" leg; the
-- order_assignment row drives the "teammate/region" leg of the policy.
insert into public.orders (order_id, client_id, created_by, fulfillment_stage, order_date, total_seats) values
  ('SO-A1', 'cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Delivered', '2026-01-01', 5),
  ('SO-A2', 'cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Delivered', '2026-01-02', 3),
  ('SO-B1', 'cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Delivered', '2026-01-03', 4);
insert into public.order_assignment (order_id, sales_id) values
  ('SO-A1', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('SO-A2', 'a2a2a2a2-0000-0000-0000-000000000002'),
  ('SO-B1', 'b1b1b1b1-0000-0000-0000-000000000003');

insert into public.audit_log (table_name, row_pk, action, actor_role, actor_id, changed_fields) values
  ('orders', 'SO-A1', 'UPDATE', 'operations', '00000000-0000-0000-0000-0000000000ad', '{"x":1}');

\echo '>> fixture built OK'
