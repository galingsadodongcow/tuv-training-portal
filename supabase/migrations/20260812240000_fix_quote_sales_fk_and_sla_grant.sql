-- ===========================================================================
-- Fix two live runtime errors.
--
-- 1. "Could not find a relationship between 'quote' and 'sales_id' in the
--    schema cache" — the `quote.sales_id` column existed but had NO foreign
--    key to `salesperson`, so PostgREST could not resolve the embed
--    `salesperson:sales_id(...)` used by useQuotes/useQuote. Every other
--    sales_id in the schema (order_assignment.sales_id, client.owner_sales_id)
--    carries this FK; quote was missing it. Data verified safe before writing:
--    salesperson PK = sales_id; 15/15 quotes have a non-null sales_id; 0 orphans.
--
-- 2. "permission denied for view v_sla_breach" — the view is
--    security_invoker=true (correct) but was never granted SELECT to the
--    `authenticated` role, so every My Work load (useSlaBreaches) failed for
--    every signed-in user. The underlying-table RLS still applies via
--    security_invoker, so granting SELECT on the view is safe.
--
-- Idempotent: safe to run more than once (IF NOT EXISTS guard + idempotent GRANT).
-- ===========================================================================

-- 1. Add the missing quote.sales_id -> salesperson foreign key.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quote'::regclass
      and conname  = 'quote_sales_id_fkey'
  ) then
    alter table public.quote
      add constraint quote_sales_id_fkey
      foreign key (sales_id) references public.salesperson (sales_id);
  end if;
end
$$;

-- 2. Grant SELECT on the SLA-breach view to authenticated users.
--    (RLS on the source tables still governs which rows they see, because the
--     view runs with security_invoker=true.)
grant select on public.v_sla_breach to authenticated;

-- Ask PostgREST to reload its schema cache so the new relationship is picked up
-- immediately (Supabase's DDL event trigger normally does this; belt-and-braces).
notify pgrst, 'reload schema';
