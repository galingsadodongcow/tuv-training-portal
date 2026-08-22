-- Academy Portal clean baseline: identity, audit, catalogue, and resources.
-- Reuses the legacy Supabase project while isolating all new application objects.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists academy_v2;
revoke all on schema academy_v2 from public, anon;
grant usage on schema academy_v2 to authenticated;

create schema if not exists academy_v2_private;
revoke all on schema academy_v2_private from public, anon, authenticated;
grant usage on schema academy_v2_private to authenticated;

create table academy_v2.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  role text not null default 'sales'
    check (role in ('administrator', 'operations', 'sales', 'manager', 'auditor')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table academy_v2.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references academy_v2.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  reason text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create table academy_v2.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references academy_v2.categories(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create table academy_v2.courses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references academy_v2.categories(id) on delete restrict,
  code text not null unique
    check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9._-]{1,29}$'),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  duration_minutes integer not null check (duration_minutes between 30 and 60000),
  default_capacity integer not null check (default_capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table academy_v2.course_prices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references academy_v2.courses(id) on delete restrict,
  learning_type text not null check (learning_type in ('classroom', 'virtual', 'onsite')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table academy_v2.trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table academy_v2.trainer_courses (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references academy_v2.trainers(id) on delete restrict,
  course_id uuid not null references academy_v2.courses(id) on delete restrict,
  qualified_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, course_id)
);

create table academy_v2.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  venue_type text not null check (venue_type in ('physical', 'virtual')),
  capacity integer,
  address text check (address is null or char_length(address) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (venue_type = 'physical' and capacity > 0)
    or (venue_type = 'virtual' and capacity is null)
  )
);

-- Foreign-key and hot lookup indexes. PostgreSQL does not index FKs automatically.
create index audit_events_actor_id_idx on academy_v2.audit_events(actor_id);
create index audit_events_entity_time_idx on academy_v2.audit_events(entity_type, entity_id, occurred_at desc);
create index categories_parent_id_idx on academy_v2.categories(parent_id);
create unique index categories_sibling_name_key
  on academy_v2.categories(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index courses_category_active_title_idx on academy_v2.courses(category_id, is_active, title);
create index course_prices_course_id_idx on academy_v2.course_prices(course_id);
create unique index course_prices_one_active_key
  on academy_v2.course_prices(course_id, learning_type, currency) where is_active;
create unique index trainers_name_key on academy_v2.trainers(lower(btrim(name)));
create index trainer_courses_trainer_id_idx on academy_v2.trainer_courses(trainer_id);
create index trainer_courses_course_id_idx on academy_v2.trainer_courses(course_id);
create unique index venues_name_key on academy_v2.venues(lower(btrim(name)));

-- Caller-specific authority helper. It is in an unexposed schema and returns no
-- data beyond whether the current authenticated user has one of the given roles.
create or replace function academy_v2_private.has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from academy_v2.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role = any(allowed_roles)
  );
$$;

revoke all on function academy_v2_private.has_role(text[]) from public, anon;
grant execute on function academy_v2_private.has_role(text[]) to authenticated;

create or replace function academy_v2_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function academy_v2_private.set_updated_at() from public, anon, authenticated;

create or replace function academy_v2_private.enforce_category_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent' using errcode = '23514';
  end if;

  select c.parent_id into parent_parent_id
  from academy_v2.categories c
  where c.id = new.parent_id;

  if not found then
    raise exception 'Parent category does not exist' using errcode = '23503';
  end if;
  if parent_parent_id is not null then
    raise exception 'Only category and subcategory levels are supported' using errcode = '23514';
  end if;
  if exists (select 1 from academy_v2.categories c where c.parent_id = new.id) then
    raise exception 'A category with subcategories cannot become a subcategory' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function academy_v2_private.enforce_category_depth() from public, anon, authenticated;

create or replace function academy_v2_private.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role is distinct from new.role or old.is_active is distinct from new.is_active then
    insert into academy_v2.audit_events(actor_id, action, entity_type, entity_id, details)
    values (
      (select auth.uid()),
      'profile.access_changed',
      'profile',
      new.id::text,
      jsonb_build_object(
        'role_before', old.role,
        'role_after', new.role,
        'active_before', old.is_active,
        'active_after', new.is_active
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function academy_v2_private.audit_profile_change() from public, anon, authenticated;

create or replace function academy_v2_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into academy_v2.profiles(id, full_name, role, is_active)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pending user'
    ),
    'sales',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function academy_v2_private.handle_new_user() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on academy_v2.profiles
for each row execute function academy_v2_private.set_updated_at();
create trigger categories_set_updated_at before update on academy_v2.categories
for each row execute function academy_v2_private.set_updated_at();
create trigger courses_set_updated_at before update on academy_v2.courses
for each row execute function academy_v2_private.set_updated_at();
create trigger course_prices_set_updated_at before update on academy_v2.course_prices
for each row execute function academy_v2_private.set_updated_at();
create trigger trainers_set_updated_at before update on academy_v2.trainers
for each row execute function academy_v2_private.set_updated_at();
create trigger trainer_courses_set_updated_at before update on academy_v2.trainer_courses
for each row execute function academy_v2_private.set_updated_at();
create trigger venues_set_updated_at before update on academy_v2.venues
for each row execute function academy_v2_private.set_updated_at();
create trigger categories_enforce_depth before insert or update of parent_id on academy_v2.categories
for each row execute function academy_v2_private.enforce_category_depth();
create trigger profiles_audit_access after update of role, is_active on academy_v2.profiles
for each row execute function academy_v2_private.audit_profile_change();
create trigger academy_v2_on_auth_user_created after insert on auth.users
for each row execute function academy_v2_private.handle_new_user();

-- Reuse project identities without importing legacy roles or activation state.
insert into academy_v2.profiles(id, full_name, role, is_active)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Pending user'
  ),
  'sales',
  false
from auth.users u
on conflict (id) do nothing;

-- Explicit grants are separate from RLS. No anonymous business access exists.
revoke all on table academy_v2.profiles, academy_v2.audit_events, academy_v2.categories,
  academy_v2.courses, academy_v2.course_prices, academy_v2.trainers, academy_v2.trainer_courses,
  academy_v2.venues from anon, authenticated;

grant select on table academy_v2.profiles, academy_v2.audit_events, academy_v2.categories,
  academy_v2.courses, academy_v2.course_prices, academy_v2.trainers, academy_v2.trainer_courses,
  academy_v2.venues to authenticated;
grant insert, update on table academy_v2.categories, academy_v2.courses, academy_v2.course_prices,
  academy_v2.trainers, academy_v2.trainer_courses, academy_v2.venues to authenticated;
grant update(full_name, role, is_active) on table academy_v2.profiles to authenticated;

alter table academy_v2.profiles enable row level security;
alter table academy_v2.audit_events enable row level security;
alter table academy_v2.categories enable row level security;
alter table academy_v2.courses enable row level security;
alter table academy_v2.course_prices enable row level security;
alter table academy_v2.trainers enable row level security;
alter table academy_v2.trainer_courses enable row level security;
alter table academy_v2.venues enable row level security;

alter table academy_v2.profiles force row level security;
alter table academy_v2.audit_events force row level security;
alter table academy_v2.categories force row level security;
alter table academy_v2.courses force row level security;
alter table academy_v2.course_prices force row level security;
alter table academy_v2.trainers force row level security;
alter table academy_v2.trainer_courses force row level security;
alter table academy_v2.venues force row level security;

create policy profiles_read_self_or_admin on academy_v2.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select academy_v2_private.has_role(array['administrator']::text[]))
);

create policy profiles_admin_update on academy_v2.profiles
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator']::text[])))
with check ((select academy_v2_private.has_role(array['administrator']::text[])));

create policy audit_events_oversight_read on academy_v2.audit_events
for select to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'auditor']::text[])));

create policy categories_active_read on academy_v2.categories
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy categories_write on academy_v2.categories
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy categories_update on academy_v2.categories
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy courses_active_read on academy_v2.courses
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy courses_write on academy_v2.courses
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy courses_update on academy_v2.courses
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy course_prices_active_read on academy_v2.course_prices
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy course_prices_write on academy_v2.course_prices
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy course_prices_update on academy_v2.course_prices
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy trainers_active_read on academy_v2.trainers
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy trainers_write on academy_v2.trainers
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy trainers_update on academy_v2.trainers
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy trainer_courses_active_read on academy_v2.trainer_courses
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy trainer_courses_write on academy_v2.trainer_courses
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy trainer_courses_update on academy_v2.trainer_courses
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

create policy venues_active_read on academy_v2.venues
for select to authenticated
using (
  (select academy_v2_private.has_role(array['administrator', 'operations', 'sales', 'manager', 'auditor']::text[]))
  and (is_active or (select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
);
create policy venues_write on academy_v2.venues
for insert to authenticated
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));
create policy venues_update on academy_v2.venues
for update to authenticated
using ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])))
with check ((select academy_v2_private.has_role(array['administrator', 'operations']::text[])));

comment on schema academy_v2 is 'Isolated application and Data API schema for Academy Portal v2';
comment on schema academy_v2_private is 'Unexposed helpers for Academy Portal RLS and triggers';
comment on table academy_v2.profiles is 'Application authority for Supabase Auth identities';
comment on table academy_v2.audit_events is 'Immutable material access and workflow audit trail';
comment on table academy_v2.categories is 'Two-level training catalogue hierarchy';
comment on table academy_v2.courses is 'Stable sellable training definitions';
comment on table academy_v2.course_prices is 'Standard course price history by learning type and currency';
comment on table academy_v2.trainers is 'Safe scheduling identity for trainers';
comment on table academy_v2.trainer_courses is 'Trainer-to-course competency';
comment on table academy_v2.venues is 'Physical and virtual scheduling locations';
