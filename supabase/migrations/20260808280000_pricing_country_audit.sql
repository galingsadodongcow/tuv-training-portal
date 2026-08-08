-- Phase N. Three additions:
--
--  1. A pricing and discount engine: reusable discount rules (volume or type
--     based) and a function that returns the rules applicable to a booking, so
--     quotes and sales entry can advise the best discount without hard-coding it.
--  2. Multi-country scaffolding: a fn_current_country() helper and a country
--     currency lookup, plus a v_country_revenue rollup by country and currency.
--  3. A global audit search function for the super-admin audit browser.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. Nothing here
-- changes existing booking math — the discount engine is advisory.

-- ---- Pricing and discount rules ----
create table if not exists public.discount_rule (
  rule_id uuid primary key default gen_random_uuid(),
  label text not null,
  course_id uuid references public.course(course_id) on delete cascade,   -- null = all courses
  training_type training_type_t,                                          -- null = all types
  country country_t,                                                      -- null = all countries
  min_seats integer not null default 1,
  discount_pct numeric check (discount_pct >= 0 and discount_pct <= 100),
  discount_amount numeric check (discount_amount >= 0),
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);

alter table public.discount_rule enable row level security;
drop policy if exists p_discount_r on public.discount_rule;
create policy p_discount_r on public.discount_rule for select to authenticated
  using (fn_current_role() is not null);
drop policy if exists p_discount_w on public.discount_rule;
create policy p_discount_w on public.discount_rule for all to authenticated
  using (fn_current_role() in ('operations','business_owner','super_admin'))
  with check (fn_current_role() in ('operations','business_owner','super_admin'));

-- Rules that apply to a given course / type / country / seat count, today,
-- richest discount first.
create or replace function public.fn_applicable_discounts(
  p_course uuid default null,
  p_type text default null,
  p_country text default null,
  p_seats integer default 1
)
returns setof public.discount_rule
language sql stable security definer set search_path to 'public'
as $$
  select *
    from discount_rule r
   where r.active
     and (r.course_id is null or r.course_id = p_course)
     and (r.training_type is null or p_type is null or r.training_type::text = p_type)
     and (r.country is null or p_country is null or r.country::text = p_country)
     and r.min_seats <= coalesce(p_seats, 1)
     and (r.valid_from is null or r.valid_from <= current_date)
     and (r.valid_to is null or r.valid_to >= current_date)
   order by coalesce(r.discount_pct, 0) desc, coalesce(r.discount_amount, 0) desc;
$$;
grant execute on function public.fn_applicable_discounts(uuid, text, text, integer) to authenticated;

-- ---- Multi-country ----
-- The caller's country, taken from their linked salesperson's region mapping is
-- not reliable, so we expose it from the profile-linked salesperson's most
-- recent order country, falling back to PH. Kept as a helper for reporting and
-- future country-scoped policies; not enforced in RLS here.
create or replace function public.fn_current_country()
returns country_t
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select o.country from orders o
       where o.created_by = auth.uid()
       order by o.created_at desc limit 1),
    'PH'::country_t
  );
$$;
grant execute on function public.fn_current_country() to authenticated;

create or replace view public.v_country_revenue as
  select o.country,
         o.currency,
         count(*) as orders,
         sum(o.total_seats) as seats,
         sum(o.total_amount) as booked
    from orders o
   where o.order_status <> 'Cancelled'
   group by o.country, o.currency
   order by sum(o.total_amount) desc;

-- ---- Global audit search ----
-- A filterable window over audit_log for the super-admin browser. Every
-- argument is optional; nulls widen the search.
create or replace function public.fn_audit_search(
  p_table text default null,
  p_action text default null,
  p_role text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_limit integer default 200
)
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
