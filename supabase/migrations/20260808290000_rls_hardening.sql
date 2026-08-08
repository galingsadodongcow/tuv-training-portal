-- RLS hardening found by the QA simulation.
--
-- 1. Order-linked child tables (order_line, participant, invoice, payment) were
--    readable by ANY authenticated user (using (fn_current_role() is not null)),
--    so the phase-L order scoping was cosmetic: a sales user scoped out of an
--    order could still read its participants' PII and its financials directly
--    via PostgREST. Scope each child's SELECT to the same visibility as its
--    order.
-- 2. The AR/analytics views added after the security-hardening batch never got
--    security_invoker, so they ran as owner and ignored RLS. Set it so they
--    honour the caller's row access.
--
-- Idempotent and safe to paste whole into the Supabase SQL editor.

-- Single source of truth for "can the caller see this order", mirroring p_orders_r.
create or replace function public.fn_can_see_order(p_order text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select
    fn_current_role() in ('super_admin','operations','business_owner')
    or exists (select 1 from orders o where o.order_id = p_order and o.created_by = auth.uid())
    or exists (
      select 1 from order_assignment oa join salesperson sp on sp.sales_id = oa.sales_id
       where oa.order_id = p_order
         and ((fn_current_team() is not null and sp.team is not distinct from fn_current_team())
           or (fn_is_supervisor() and fn_current_region() is not null and sp.region is not distinct from fn_current_region())));
$$;
grant execute on function public.fn_can_see_order(text) to authenticated;

-- Ensure row security is actually on for the child tables (a policy is inert
-- otherwise), then scope each SELECT to the order's visibility.
alter table public.order_line enable row level security;
alter table public.participant enable row level security;
alter table public.invoice enable row level security;
alter table public.payment enable row level security;

drop policy if exists order_line_read on public.order_line;
create policy order_line_read on public.order_line for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists participant_read on public.participant;
create policy participant_read on public.participant for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists p_invoice_r on public.invoice;
create policy p_invoice_r on public.invoice for select to authenticated
  using (fn_can_see_order(order_id));

drop policy if exists p_payment_r on public.payment;
create policy p_payment_r on public.payment for select to authenticated
  using (fn_can_see_order(order_id));

-- Views run with the caller's row access, not the owner's.
alter view public.v_order_ar set (security_invoker = true);
alter view public.v_session_pnl set (security_invoker = true);
alter view public.v_session_forecast set (security_invoker = true);
alter view public.v_country_revenue set (security_invoker = true);
