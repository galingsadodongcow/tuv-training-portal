-- Let a sales supervisor sell as well as supervise (owner decision).
--
-- Context: sales supervisors were being unified onto the sales_manager role, but
-- sales_manager could not create orders — so promoting a working seller would
-- have taken their day job away.
--
-- The gate is this function, not RLS. fn_create_order is SECURITY DEFINER, so it
-- bypasses the orders INSERT policies entirely and enforces its own allowlist —
-- which is why `operations` can create orders despite having no INSERT policy.
-- Adding an RLS policy for sales_manager would therefore be dead code; the
-- allowlist here is the only thing that matters.
--
-- sales_manager is added to the allowlist and inherits the same channel
-- restriction as sales: a selling role may only raise Inside Sales / Field Sales
-- orders, leaving the other channels to coordinator/operations/super_admin.
--
-- Reproduced verbatim from the live definition with those two lines changed, so
-- nothing else about order creation shifts. Idempotent: create or replace.

create or replace function public.fn_create_order(
  p_order_id text,
  p_channel text,
  p_order_date date,
  p_client_id uuid,
  p_lines jsonb,
  p_sales_id uuid default null::uuid,
  p_country text default 'PH'::text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r text := fn_current_role()::text; v_line jsonb; v_no int := 0;
begin
  -- sales_manager joins the selling roles (was: sales, coordinator, operations,
  -- super_admin) so a supervisor can raise an order for their own team.
  if r is null or r not in ('sales','sales_manager','coordinator','operations','super_admin') then
    raise exception 'Your role may not create orders' using errcode = '42501';
  end if;
  -- Same channel restriction for both selling roles.
  if r in ('sales','sales_manager') and p_channel not in ('Inside Sales','Field Sales') then
    raise exception 'Sales may only create Inside Sales or Field Sales orders' using errcode = '42501';
  end if;
  if coalesce(btrim(p_order_id),'') = '' then
    raise exception 'An order reference is required' using errcode = '22004';
  end if;
  if exists (select 1 from orders where order_id = p_order_id) then
    raise exception 'Order % already exists', p_order_id using errcode = '23505';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line is required' using errcode = '22004';
  end if;

  insert into orders (order_id, order_date, channel, modality, seats, amount_php,
                      client_id, created_by, country, fulfillment_stage)
  values (p_order_id, coalesce(p_order_date, current_date), p_channel::channel_t,
          (p_lines->0->>'modality')::modality_t, 1, 0, p_client_id, auth.uid(),
          coalesce(p_country,'PH')::country_t, 'New');

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into order_line (order_id, line_no, course_id, schedule_id, modality,
                            seats, amount_php, line_status)
    values (p_order_id, v_no, (v_line->>'course_id')::uuid,
            nullif(v_line->>'schedule_id','')::uuid, (v_line->>'modality')::modality_t,
            coalesce((v_line->>'seats')::int, 1), coalesce((v_line->>'amount_php')::numeric, 0),
            coalesce(nullif(v_line->>'line_status',''), 'New')::order_status_t);
  end loop;

  if p_sales_id is not null then
    insert into order_assignment (order_id, sales_id) values (p_order_id, p_sales_id)
      on conflict (order_id) do nothing;
  end if;

  return p_order_id;
end $function$;
