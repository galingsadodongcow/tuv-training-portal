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
-- All eight roles: the delegation matrix (20260814060000) and the cost gate
-- (20260814090000) both branch on roles beyond the original four.
create type user_role as enum ('super_admin','operations','business_owner','sales',
                               'coordinator','sales_manager','management','auditor');
create type country_t as enum ('PH','SG','MY','ID','VN','TH');
-- Needed so fn_create_order (20260814080000) compiles and its casts resolve.
create type channel_t as enum ('Inside Sales','Field Sales','Webshop','Partner');
create type modality_t as enum ('Classroom','Online','Blended');
create type order_status_t as enum ('New','Confirmed','Completed','Cancelled','Waitlist');

-- Supabase auth.uid(): the JWT `sub` claim -----------------------------------
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Base-table skeletons (minimal — only columns the tested policies touch) ----
create table public.profiles (
  user_id uuid primary key, role user_role, sales_id uuid, full_name text);
create table public.salesperson (
  sales_id uuid primary key default gen_random_uuid(),
  name text, code text, team text, region text,
  is_supervisor boolean default false, active boolean default true);
-- The extra order columns exist so fn_create_order's INSERT list resolves.
create table public.orders (
  order_id text primary key, client_id uuid, created_by uuid,
  fulfillment_stage text, order_date date, total_seats int,
  channel channel_t, modality modality_t, seats int, amount_php numeric,
  country country_t default 'PH');
create table public.order_assignment (
  order_id text, sales_id uuid);
create table public.order_line (
  line_id uuid primary key default gen_random_uuid(),
  order_id text, line_no int, course_id uuid, schedule_id uuid,
  modality modality_t, seats int, amount_php numeric, line_status order_status_t);
create table public.client (
  client_id uuid primary key default gen_random_uuid(),
  company text, name text, email text, org_id uuid);
create table public.organization (
  org_id uuid primary key default gen_random_uuid(),
  name text, industry text, country country_t default 'PH');
-- schedule carries the costing inputs v_session_pnl reads (20260814090000).
create table public.schedule (
  schedule_id uuid primary key default gen_random_uuid(),
  course_id uuid, start_date date, status text,
  trainer_id uuid, venue_id uuid, duration_days int default 2,
  price numeric default 5000, booked_participants int default 10,
  actual_revenue numeric, material_cost numeric default 1000,
  country country_t default 'PH');
create table public.course (
  course_id uuid primary key default gen_random_uuid(),
  course_name text, training_type text, active boolean default true);
-- Rate columns are the sensitive ones the cost migration locks down.
create table public.trainer (
  trainer_id uuid primary key default gen_random_uuid(),
  name text, code text, email text, phone text,
  trainer_type text default 'Internal', daily_rate numeric,
  active boolean default true, notes text,
  created_at timestamptz default now(), country country_t default 'PH');
create table public.venue (
  venue_id uuid primary key default gen_random_uuid(),
  name text, address text, city text, capacity int,
  venue_type text default 'Training Room', day_rate numeric,
  active boolean default true, created_at timestamptz default now(),
  country country_t default 'PH');
create table public.session_trainer (
  schedule_id uuid, trainer_id uuid);
create table public.inquiry (
  inquiry_id uuid primary key default gen_random_uuid(),
  company text, status text, inquiry_date date);
-- old_data/new_data/source/reason are written by the delegation RPCs
-- (20260814060000); `source` is NOT NULL on the live table.
create table public.audit_log (
  audit_id bigint primary key generated always as identity,
  table_name text, row_pk text, action text, actor_role user_role,
  actor_id uuid, changed_at timestamptz default now(), changed_fields jsonb,
  old_data jsonb, new_data jsonb, source text not null default 'test', reason text);

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

create or replace function public.fn_current_team() returns text
 language sql stable security definer set search_path to 'public'
 as $$ select team from salesperson where sales_id = fn_current_sales_id() $$;

create or replace function public.fn_current_region() returns text
 language sql stable security definer set search_path to 'public'
 as $$ select region from salesperson where sales_id = fn_current_sales_id() $$;

-- Team-lead scope: the legacy is_supervisor flag OR the sales_manager role.
create or replace function public.fn_is_team_lead() returns boolean
 language sql stable security definer set search_path to 'public'
 as $$ select fn_is_supervisor() or fn_current_role() = 'sales_manager' $$;

-- Table grants: RLS (not the grant) is what must yield 0 rows for anon on
-- orders, so anon holds SELECT on orders too. The policy subquery reads
-- order_assignment + salesperson as the invoking user, so authenticated needs
-- SELECT on those.
grant select on public.orders to anon, authenticated;
grant select on public.order_assignment, public.salesperson, public.client,
  public.organization, public.schedule, public.course, public.inquiry,
  public.audit_log, public.profiles, public.order_line, public.session_trainer
  to authenticated;
-- Granted table-wide here on purpose: 20260814090000 must be able to REVOKE and
-- re-grant per column, which is exactly the behaviour under regression.
grant select on public.trainer, public.venue to authenticated;

-- ── Real repo SQL under regression ─────────────────────────────────────────
\echo '>> applying real migration: 20260808260000_access_scoping.sql'
\i supabase/migrations/20260808260000_access_scoping.sql
\echo '>> applying real migration: 20260811000000_lock_search_rpcs.sql'
\i supabase/migrations/20260811000000_lock_search_rpcs.sql

-- Delegated team membership + the role-grant matrix, then the follow-up that
-- ring-fences the oversight roles. Order matters: 070000 replaces the
-- fn_can_manage_member defined by 060000.
\echo '>> applying real migration: 20260814060000_team_membership_delegation.sql'
\i supabase/migrations/20260814060000_team_membership_delegation.sql
\echo '>> applying real migration: 20260814070000_protect_oversight_roles.sql'
\i supabase/migrations/20260814070000_protect_oversight_roles.sql

-- Order-creation authority. The gate is this function's own allowlist, not RLS
-- (it is SECURITY DEFINER and bypasses the orders INSERT policies).
\echo '>> applying real migration: 20260814080000_sales_manager_can_sell.sql'
\i supabase/migrations/20260814080000_sales_manager_can_sell.sql

-- Cost/margin masking + the narrowed column grants on trainer/venue.
\echo '>> applying real migration: 20260814090000_restrict_cost_visibility.sql'
\i supabase/migrations/20260814090000_restrict_cost_visibility.sql
grant select on public.v_session_pnl to authenticated;

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

-- ── Extra identities for the delegation + cost matrices ────────────────────
-- A TeamA supervisor (sales_manager, so fn_is_team_lead is true), an operations
-- user, and a business_owner — the three sides of the delegation boundary.
insert into public.salesperson (sales_id, name, code, team, region, is_supervisor) values
  ('a9a9a9a9-0000-0000-0000-000000000009', 'Lead A', 'LA', 'TeamA', 'Luzon', true);

update public.salesperson set name = 'Rep A1', code = 'RA1' where sales_id = 'a1a1a1a1-0000-0000-0000-000000000001';
update public.salesperson set name = 'Rep A2', code = 'RA2' where sales_id = 'a2a2a2a2-0000-0000-0000-000000000002';
update public.salesperson set name = 'Rep B1', code = 'RB1' where sales_id = 'b1b1b1b1-0000-0000-0000-000000000003';

insert into public.profiles (user_id, role, sales_id, full_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'sales_manager',  'a9a9a9a9-0000-0000-0000-000000000009', 'Lead A'),
  ('00000000-0000-0000-0000-0000000000f1', 'operations',     null, 'Ops User'),
  ('00000000-0000-0000-0000-0000000000f2', 'business_owner', null, 'Biz Owner');

-- Costing inputs: one fully-costed session (trainer 8000/day, venue 5000/day,
-- 2 days, 10 pax @ 5000 = 50000 revenue) so margin is deterministic.
insert into public.trainer (trainer_id, name, code, daily_rate) values
  ('7a7a7a7a-0000-0000-0000-000000000001', 'Trainer One', 'TR-01', 8000);
insert into public.venue (venue_id, name, day_rate) values
  ('7b7b7b7b-0000-0000-0000-000000000001', 'Venue One', 5000);
insert into public.course (course_id, course_name, training_type) values
  ('7c7c7c7c-0000-0000-0000-000000000001', 'ISO 9001 Lead Auditor', 'Certification');
insert into public.schedule (schedule_id, course_id, trainer_id, venue_id, start_date, status)
values ('7d7d7d7d-0000-0000-0000-000000000001',
        '7c7c7c7c-0000-0000-0000-000000000001',
        '7a7a7a7a-0000-0000-0000-000000000001',
        '7b7b7b7b-0000-0000-0000-000000000001',
        '2026-03-02', 'Confirmed');

\echo '>> fixture built OK'
