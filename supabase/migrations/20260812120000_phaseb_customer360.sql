-- ===========================================================================
-- Phase B (second-pass) — 3/6: Customer 360 data model (D5).
--
-- Decision: roll the transactional `client` under `organization` (reversible,
-- low blast radius) — NOT a full collapse of client into organization.
--
--  1. Reconcile the client → organization FK drift. The live `client` table
--     carries TWO FKs to organization (org_id AND organization_id). Make
--     `organization_id` canonical and keep `org_id` as a synced, deprecated
--     mirror so any legacy reader/writer still works during the transition.
--     (A later cleanup migration may DROP org_id once nothing writes it.)
--  2. Ensure every client with a company name rolls up to an organization:
--     dedupe by normalized name (fn_norm_org) and backfill organization_id.
--  3. Resolve leads to customers: add inquiry.client_id (+ inquiry.owner for
--     O01) and backfill via email, then normalized-company, dedup.
--  4. Customer-360 read views (org contacts + org rollup), security_invoker so
--     they respect the caller's RLS.
--
-- Idempotent. No column is dropped in this pass. No RLS is loosened: client /
-- organization / contact SELECT already admit every authenticated role.
-- ===========================================================================

-- ---- 1. Canonical FK + deprecated mirror ----------------------------------
comment on column public.client.org_id is
  'DEPRECATED mirror of organization_id (Customer-360 transition). Kept in sync by trg_client_org_sync; do not write directly. Slated for removal once no app path writes it.';

create or replace function public.fn_client_org_sync()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  -- organization_id is canonical. Promote a legacy-only org_id write, then
  -- mirror canonical -> org_id so old readers keep working.
  if new.organization_id is null and new.org_id is not null then
    new.organization_id := new.org_id;
  end if;
  new.org_id := new.organization_id;
  return new;
end $$;

drop trigger if exists trg_client_org_sync on public.client;
create trigger trg_client_org_sync before insert or update on public.client
  for each row execute function public.fn_client_org_sync();

-- Converge existing rows onto the canonical value (fn_audit skips no-op rows).
update public.client
   set organization_id = coalesce(organization_id, org_id),
       org_id          = coalesce(organization_id, org_id)
 where (organization_id is not null or org_id is not null)
   and (organization_id is distinct from org_id
        or organization_id is null or org_id is null);

-- ---- 2. Roll clients under organizations (dedupe by normalized name) -------
-- Create an organization for each distinct normalized company name that has no
-- matching org yet (only for clients not already linked).
insert into public.organization (name, country)
select distinct on (fn_norm_org(c.company)) c.company, c.country
  from public.client c
 where c.organization_id is null
   and coalesce(btrim(c.company),'') <> ''
   and fn_norm_org(c.company) is not null
   and not exists (
     select 1 from public.organization o
      where fn_norm_org(o.name) = fn_norm_org(c.company))
 order by fn_norm_org(c.company), c.company;

-- Link every unlinked client to its organization by normalized name.
update public.client c
   set organization_id = o.org_id
  from public.organization o
 where c.organization_id is null
   and coalesce(btrim(c.company),'') <> ''
   and fn_norm_org(o.name) = fn_norm_org(c.company);

-- ---- 3. inquiry.client_id + inquiry.owner (lead -> customer, O01) ----------
alter table public.inquiry add column if not exists client_id uuid references public.client(client_id);
alter table public.inquiry add column if not exists owner uuid references public.salesperson(sales_id);

-- Backfill client by exact email match first (most reliable), then by
-- normalized company name for the remainder.
update public.inquiry i
   set client_id = c.client_id
  from public.client c
 where i.client_id is null
   and coalesce(btrim(i.email),'') <> ''
   and lower(c.email) = lower(i.email);

update public.inquiry i
   set client_id = c.client_id
  from public.client c
 where i.client_id is null
   and coalesce(btrim(i.company),'') <> ''
   and fn_norm_org(c.company) = fn_norm_org(i.company);

-- Owner defaults to the inquiry's originating sales rep.
update public.inquiry set owner = sales_id where owner is null;

-- ---- 4. Customer-360 read views -------------------------------------------
create or replace view public.v_org_contacts with (security_invoker = true) as
  select o.org_id, o.name as org_name,
         c.client_id, c.name as client_name,
         ct.contact_id, ct.name as contact_name, ct.title,
         ct.email, ct.phone, ct.is_primary
    from public.organization o
    join public.client c  on c.organization_id = o.org_id
    join public.contact ct on ct.client_id = c.client_id;
grant select on public.v_org_contacts to authenticated;

-- Org-level rollup for the Customer-360 header. Subqueries (not joins) avoid
-- fan-out double counting; security_invoker means each count only reflects rows
-- the caller may see.
create or replace view public.v_customer_360 with (security_invoker = true) as
  select o.org_id, o.name as org_name, o.country, o.industry, o.owner_sales_id,
    (select count(*) from public.client c where c.organization_id = o.org_id) as clients,
    (select count(*) from public.contact ct join public.client c on c.client_id = ct.client_id
      where c.organization_id = o.org_id) as contacts,
    (select count(*) from public.orders ord join public.client c on c.client_id = ord.client_id
      where c.organization_id = o.org_id and ord.order_status <> 'Cancelled') as active_orders,
    (select coalesce(sum(ord.total_amount),0) from public.orders ord
       join public.client c on c.client_id = ord.client_id
      where c.organization_id = o.org_id and ord.order_status <> 'Cancelled') as booked_amount,
    (select count(*) from public.inquiry q join public.client c on c.client_id = q.client_id
      where c.organization_id = o.org_id) as linked_inquiries
  from public.organization o;
grant select on public.v_customer_360 to authenticated;
