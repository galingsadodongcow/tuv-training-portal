-- ===========================================================================
-- S6 — real Category → Subcategory hierarchy (replaces free-text course.category).
--
--  * category (name unique, sort, active) and subcategory (category_id FK, name,
--    sort, active; unique per category).
--  * course.subcategory_id FK (nullable). course.category is KEPT for now
--    (dropped in a later migration once nothing reads it) — the frontend
--    strip-and-retries on 42703 so it works before/after this is live.
--  * Backfill: every distinct course.category becomes a category with a default
--    'General' subcategory; each course links to that subcategory.
--  * RLS: read for all authenticated; write for super_admin/operations only
--    (matrix Categories row — coordinator/sales_manager ✖ write; BO/sales/
--    management/auditor read-only ▲). Enum compared to text literals in an IN
--    list (implicit literal→enum cast); no CASE→enum assignment here.
--
-- Idempotent throughout.
-- ===========================================================================

create table if not exists public.category (
  category_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subcategory (
  subcategory_id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.category(category_id) on delete cascade,
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

alter table public.course add column if not exists subcategory_id uuid references public.subcategory(subcategory_id);

-- ---- Backfill from the existing free-text course.category -------------------
-- Guarded on column existence: 20260812230000_s6_retire_course_category drops
-- course.category, so re-running this migration after that point would error
-- ("column category does not exist"). The data is backfilled on the first apply;
-- skip the free-text-derived steps once the column is retired.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'course' and column_name = 'category'
  ) then
    insert into public.category (name)
      select distinct btrim(category) from public.course
       where category is not null and btrim(category) <> ''
      on conflict (name) do nothing;
  end if;
end $$;

insert into public.subcategory (category_id, name)
  select category_id, 'General' from public.category
  on conflict (category_id, name) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'course' and column_name = 'category'
  ) then
    update public.course c
       set subcategory_id = s.subcategory_id
      from public.category cat
      join public.subcategory s on s.category_id = cat.category_id and s.name = 'General'
     where c.subcategory_id is null
       and c.category is not null and btrim(c.category) <> ''
       and cat.name = btrim(c.category);
  end if;
end $$;

-- ---- RLS: read all authenticated; write super_admin/operations -------------
alter table public.category enable row level security;
alter table public.subcategory enable row level security;

drop policy if exists p_category_r on public.category;
create policy p_category_r on public.category for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_category_w on public.category;
create policy p_category_w on public.category for all to authenticated
  using (fn_current_role() in ('super_admin','operations'))
  with check (fn_current_role() in ('super_admin','operations'));

drop policy if exists p_subcategory_r on public.subcategory;
create policy p_subcategory_r on public.subcategory for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_subcategory_w on public.subcategory;
create policy p_subcategory_w on public.subcategory for all to authenticated
  using (fn_current_role() in ('super_admin','operations'))
  with check (fn_current_role() in ('super_admin','operations'));

grant select, insert, update, delete on public.category, public.subcategory to authenticated;
