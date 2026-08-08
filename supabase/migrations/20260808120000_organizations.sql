-- Organizations. A parent account that groups the individual client contacts
-- who belong to the same company. One organization, many clients. Lets the
-- team see all training bought across a company, not one contact at a time.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

create table if not exists public.organization (
  org_id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  country country_t not null default 'PH',
  notes text,
  created_at timestamptz not null default now()
);

-- Each client may belong to one organization. Nullable: an unattached contact
-- is fine. On delete of the org, the contact stays and simply loses the link.
alter table public.client add column if not exists org_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_org_id_fkey') then
    alter table public.client add constraint client_org_id_fkey
      foreign key (org_id) references public.organization(org_id) on delete set null;
  end if;
end $$;
create index if not exists client_org_id_idx on public.client(org_id);

alter table public.organization enable row level security;

-- Read: any signed-in user who has a role. Organizations are shared reference.
drop policy if exists p_org_r on public.organization;
create policy p_org_r on public.organization for select to authenticated
  using (fn_current_role() is not null);

-- Create and edit: super admin and sales.
drop policy if exists p_org_i on public.organization;
create policy p_org_i on public.organization for insert to authenticated
  with check (fn_current_role() in ('super_admin', 'sales'));
drop policy if exists p_org_u on public.organization;
create policy p_org_u on public.organization for update to authenticated
  using (fn_current_role() in ('super_admin', 'sales'))
  with check (fn_current_role() in ('super_admin', 'sales'));

-- Delete: super admin only. Contacts survive via on delete set null.
drop policy if exists p_org_d on public.organization;
create policy p_org_d on public.organization for delete to authenticated
  using (fn_current_role() = 'super_admin');

-- One row per organization with its rolled-up counts. SECURITY DEFINER so the
-- totals are the same whoever asks; they are counts, not sensitive detail.
create or replace function public.fn_org_summary()
returns table(org_id uuid, name text, industry text, country country_t,
              client_count bigint, order_count bigint, seat_count bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select o.org_id, o.name, o.industry, o.country,
    (select count(*) from client c where c.org_id = o.org_id),
    (select count(*) from orders ord
       where ord.client_id in (select client_id from client where org_id = o.org_id)),
    (select coalesce(sum(ord.total_seats), 0) from orders ord
       where ord.client_id in (select client_id from client where org_id = o.org_id))
  from organization o
  order by o.name;
$$;
grant execute on function public.fn_org_summary() to authenticated;
