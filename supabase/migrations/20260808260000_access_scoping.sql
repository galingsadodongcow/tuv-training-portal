-- Access scoping. Two changes:
--
--  1. Order read visibility is scoped for the sales role. Operations, business
--     owners, and super admins keep full read (they manage across the pool).
--     A salesperson sees an order when they created it, when the assigned
--     salesperson is on their team, or — for supervisors — anywhere in their
--     region. Other roles are unaffected.
--
--  2. Helper functions expose the caller's team and region so the policy and the
--     app can reason about scope consistently.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor. If it is
-- never applied the old "all authenticated read all orders" policy stays in
-- force, so the app keeps working either way.

create or replace function public.fn_current_team()
returns text
language sql stable security definer set search_path to 'public'
as $$ select team from salesperson where sales_id = fn_current_sales_id() $$;
grant execute on function public.fn_current_team() to authenticated;

create or replace function public.fn_current_region()
returns text
language sql stable security definer set search_path to 'public'
as $$ select region from salesperson where sales_id = fn_current_sales_id() $$;
grant execute on function public.fn_current_region() to authenticated;

-- Replace the blanket order read policy with a scoped one.
drop policy if exists p_orders_r on public.orders;
create policy p_orders_r on public.orders for select to authenticated
using (
  -- Roles that manage the whole pool see everything.
  fn_current_role() in ('super_admin','operations','business_owner')
  -- Sales always see what they created.
  or created_by = auth.uid()
  -- Sales see orders owned by a teammate; supervisors, the whole region.
  or exists (
    select 1
      from order_assignment oa
      join salesperson sp on sp.sales_id = oa.sales_id
     where oa.order_id = orders.order_id
       and (
         (fn_current_team() is not null and sp.team is not distinct from fn_current_team())
         or (fn_is_supervisor() and fn_current_region() is not null and sp.region is not distinct from fn_current_region())
       )
  )
);
